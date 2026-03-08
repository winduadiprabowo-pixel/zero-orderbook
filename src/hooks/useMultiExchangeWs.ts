/**
 * useMultiExchangeWs.ts — ZERØ ORDER BOOK v64
 *
 * v62:
 *   1. Real latency tracking — exchange timestamp → browser delta
 *   2. Latency smoothed with EMA (no jitter spike in display)
 *   3. ExponentialBackoff cap at 30s with jitter (already in formatters)
 *   4. Heartbeat/ping timeout detection — close dead connections faster
 *   5. visibilitychange: reconnect immediately when tab becomes visible
 *
 * v64:
 *   6. Snapshot cache — bids/asks saved to sessionStorage per symbol+exchange
 *      On reconnect: load cache instantly → no blank skeleton while connecting
 *      Badge 'CACHED' shown until live data arrives (isStale flag)
 *
 * rgba() only ✓ · RAF-gated ✓ · mountedRef ✓ · zero mock data ✓
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import type { ConnectionStatus } from '@/types/market';
import type { ExchangeId } from './useExchange';
import { getWsUrl, getSubscribeMsg } from './useExchange';
import { getReconnectDelay } from '@/lib/formatters';
import type { OrderBookLevel2 } from './useOrderBook';
import type { CvdPoint } from './useTrades';
import type { Trade, TickerData } from '@/types/market';
import { CircularBuffer } from '@/utils/circularBuffer';
import { detectDeviceProfile } from '@/utils/deviceProfiler';

export interface ExchangeState {
  bids:       OrderBookLevel2[];
  asks:       OrderBookLevel2[];
  trades:     Trade[];
  ticker:     TickerData | null;
  cvdPoints:  CvdPoint[];
  status:     ConnectionStatus;
  latencyMs:  number | null;
  activeFeed: ExchangeId;
  isStale:    boolean; // v64: true = showing cached data, not live yet
}

const EMPTY_STATE: ExchangeState = {
  bids: [], asks: [], trades: [], ticker: null, cvdPoints: [],
  status: 'disconnected', latencyMs: null, activeFeed: 'bybit',
  isStale: false,
};

// ── v64: Snapshot cache helpers ──────────────────────────────────────────────
// sessionStorage: cleared when tab closes, no stale data across sessions

function snapKey(exchange: ExchangeId, symbol: string): string {
  return `zero_snap_${exchange}_${symbol}`;
}

// v64: throttle — max 1 write per 2s (prevents 60fps sessionStorage hammering on mobile)
const snapThrottleMap = new Map<string, number>();

function saveSnapshot(exchange: ExchangeId, symbol: string, bids: OrderBookLevel2[], asks: OrderBookLevel2[]): void {
  if (!bids.length || !asks.length) return;
  const key = snapKey(exchange, symbol);
  const now = Date.now();
  const last = snapThrottleMap.get(key) ?? 0;
  if (now - last < 2000) return; // throttle: skip if written < 2s ago
  snapThrottleMap.set(key, now);
  try {
    const snap = { bids: bids.slice(0, 20), asks: asks.slice(0, 20), ts: now };
    sessionStorage.setItem(key, JSON.stringify(snap));
  } catch { /* storage full or unavailable — silently skip */ }
}

function loadSnapshot(exchange: ExchangeId, symbol: string): { bids: OrderBookLevel2[]; asks: OrderBookLevel2[] } | null {
  try {
    const raw = sessionStorage.getItem(snapKey(exchange, symbol));
    if (!raw) return null;
    const snap = JSON.parse(raw) as { bids: OrderBookLevel2[]; asks: OrderBookLevel2[]; ts: number };
    // Discard cache older than 5 minutes — price moved too much
    if (Date.now() - snap.ts > 5 * 60_000) return null;
    return { bids: snap.bids, asks: snap.asks };
  } catch { return null; }
}

const BYBIT_TIMEOUT_MS = 10_000;

type PriceMap = Map<string, number>;
const WHALE = 100_000;

// ── Network aware levels ──────────────────────────────────────────────────────
function getEffectiveLevels(base: number): number {
  const conn = (navigator as unknown as Record<string, Record<string,string>>).connection;
  const type = conn?.effectiveType ?? '4g';
  if (type === 'slow-2g') return Math.max(5,  Math.floor(base * 0.2));
  if (type === '2g')      return Math.max(10, Math.floor(base * 0.4));
  if (type === '3g')      return Math.max(15, Math.floor(base * 0.6));
  return base;
}

function applyDelta(map: PriceMap, updates: [string, string][]): void {
  for (const [p, s] of updates) {
    const n = parseFloat(s);
    n === 0 ? map.delete(p) : map.set(p, n);
  }
}

function mapToLevels(map: PriceMap, isAsk: boolean, levels: number): OrderBookLevel2[] {
  const entries: [number, number][] = [];
  map.forEach((size, p) => entries.push([parseFloat(p), size]));
  entries.sort((a, b) => isAsk ? a[0] - b[0] : b[0] - a[0]);
  let cum = 0;
  return entries.slice(0, levels).map(([price, size]) => {
    cum += size;
    const notional = price * size;
    return { price, size, total: cum, notional, isWhale: notional >= WHALE };
  });
}

// v55c: CF Worker proxy — /stream/ route for combined stream
const PROXY_WS  = import.meta.env.VITE_PROXY_URL
  ? import.meta.env.VITE_PROXY_URL.replace('https://', 'wss://')
  : 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

// Worker: /stream/sym@depth.../sym@trade/sym@ticker
// → wss://stream.binance.me/stream?streams=sym@depth.../sym@trade/sym@ticker
function getBinanceCombinedUrl(symbol: string): string {
  const sym = symbol.toLowerCase();
  const streams = `${sym}@depth20@100ms/${sym}@trade/${sym}@ticker`;
  return `${PROXY_WS}/stream/${streams}`;
}

export function useMultiExchangeWs(
  exchange: ExchangeId,
  symbol:   string,
  levelsOverride?: number,
): ExchangeState {
  // ── Device profile — auto detect levels ──────────────────────────────────
  const profile        = useRef(detectDeviceProfile());
  const baseLevels     = levelsOverride ?? profile.current.maxLevels;
  const effectiveLevels = getEffectiveLevels(baseLevels);

  const [state, setState] = useState<ExchangeState>({ ...EMPTY_STATE, activeFeed: exchange });

  const wsRef         = useRef<WebSocket | null>(null);
  const mountedRef    = useRef(true);
  const attemptRef    = useRef(0);
  const retryRef      = useRef<ReturnType<typeof setTimeout>>();
  const pingRef       = useRef<ReturnType<typeof setInterval>>();
  const bybitTmrRef   = useRef<ReturnType<typeof setTimeout>>();
  const activeFeedRef = useRef<ExchangeId>(exchange);

  const rafRef   = useRef(0);
  const queueRef = useRef<Record<string, unknown>[]>([]);

  // v62: latency tracking — EMA smoothed
  const latencyEmaRef   = useRef<number | null>(null);
  const lastPingTimeRef = useRef<number>(0);
  // v62: heartbeat watchdog — detect dead connections faster (15s timeout)
  const heartbeatRef    = useRef<ReturnType<typeof setTimeout>>();
  const HEARTBEAT_TIMEOUT = 15_000;

  const bidsMap      = useRef<PriceMap>(new Map());
  const asksMap      = useRef<PriceMap>(new Map());
  const cvdRef       = useRef(0);
  // ── v51: CircularBuffer — O(1) push replaces shift() ─────────────────────
  const cvdBuf       = useRef(new CircularBuffer<CvdPoint>(profile.current.cvdWindow));
  const tradeId      = useRef(0);
  const prevPrice24h = useRef(0);

  // Keep stable refs for exchange/symbol/levels to avoid reconnect loop
  const exchangeRef = useRef(exchange);
  const symbolRef   = useRef(symbol);
  const levelsRef   = useRef(effectiveLevels);
  exchangeRef.current = exchange;
  symbolRef.current   = symbol;
  levelsRef.current   = effectiveLevels;

  const setStatus = useCallback((s: ConnectionStatus) => {
    setState((prev) => prev.status === s ? prev : { ...prev, status: s });
  }, []);

  const parseBybit = useCallback((
    data: Record<string, unknown>,
    draft: Partial<ExchangeState>,
  ): void => {
    const topic = data.topic as string | undefined;
    if (!topic) return;

    if (topic.startsWith('orderbook.')) {
      const d = data.data as { b: [string,string][]; a: [string,string][] } | undefined;
      if (!d) return;
      if (data.type === 'snapshot') {
        bidsMap.current = new Map(d.b.map(([p, s]) => [p, parseFloat(s)]));
        asksMap.current = new Map(d.a.map(([p, s]) => [p, parseFloat(s)]));
      } else if (data.type === 'delta') {
        applyDelta(bidsMap.current, d.b);
        applyDelta(asksMap.current, d.a);
      }
      draft.bids = mapToLevels(bidsMap.current, false, levelsRef.current);
      draft.asks = mapToLevels(asksMap.current, true,  levelsRef.current);
    }

    if (topic.startsWith('publicTrade.')) {
      const arr = data.data as Array<{ i:string; T:number; p:string; v:string; S:'Buy'|'Sell' }>;
      if (!Array.isArray(arr)) return;
      const incoming: Trade[] = arr.map((d) => ({
        id: String(tradeId.current++),
        time: d.T, price: parseFloat(d.p), size: parseFloat(d.v),
        isBuyerMaker: d.S === 'Sell',
      }));
      for (const t of incoming) {
        cvdRef.current += t.isBuyerMaker ? -t.size : t.size;
        cvdBuf.current.push({ time: t.time, cvd: cvdRef.current });
      }
      draft.trades    = incoming;
      draft.cvdPoints = cvdBuf.current.toArray();
    }

    if (topic.startsWith('tickers.')) {
      const d = data.data as Record<string, string> | undefined;
      if (!d) return;
      if (d.prevPrice24h) prevPrice24h.current = parseFloat(d.prevPrice24h);
      draft.ticker = {
        _partial: true,
        lastPrice:          d.lastPrice         ? parseFloat(d.lastPrice)          : null,
        priceChangePercent: d.price24hPcnt      ? parseFloat(d.price24hPcnt) * 100 : null,
        highPrice:          d.highPrice24h       ? parseFloat(d.highPrice24h)       : null,
        lowPrice:           d.lowPrice24h        ? parseFloat(d.lowPrice24h)        : null,
        volume:             d.volume24h          ? parseFloat(d.volume24h)          : null,
        quoteVolume:        d.turnover24h        ? parseFloat(d.turnover24h)        : null,
        _prevPrice24h:      prevPrice24h.current,
      } as unknown as TickerData;
    }
  }, []);

  const parseBinance = useCallback((
    data: Record<string, unknown>,
    draft: Partial<ExchangeState>,
  ): void => {
    const stream = data.stream as string | undefined;
    const d      = data.data  as Record<string, unknown> | undefined;
    if (!stream || !d) return;

    if (stream.includes('@depth')) {
      // depth20@100ms: always full snapshot, bids/asks at d.bids and d.asks
      const bids = (d.bids as [string,string][]) ?? (d.b as [string,string][]) ?? [];
      const asks = (d.asks as [string,string][]) ?? (d.a as [string,string][]) ?? [];
      if (bids.length > 0 || asks.length > 0) {
        bidsMap.current = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
        asksMap.current = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
      }
      draft.bids = mapToLevels(bidsMap.current, false, levelsRef.current);
      draft.asks = mapToLevels(asksMap.current, true,  levelsRef.current);
    }

    if (stream.includes('@trade')) {
      const t: Trade = {
        id:           String(tradeId.current++),
        time:         d.T as number,
        price:        parseFloat(d.p as string),
        size:         parseFloat(d.q as string),
        isBuyerMaker: d.m as boolean,
      };
      cvdRef.current += t.isBuyerMaker ? -t.size : t.size;
      cvdBuf.current.push({ time: t.time, cvd: cvdRef.current });
      draft.trades    = [t];
      draft.cvdPoints = cvdBuf.current.toArray();
    }

    if (stream.includes('@ticker')) {
      draft.ticker = {
        lastPrice:          parseFloat(d.c as string),
        priceChange:        parseFloat(d.p as string),
        priceChangePercent: parseFloat(d.P as string),
        highPrice:          parseFloat(d.h as string),
        lowPrice:           d.l ? parseFloat(d.l as string) : 0,
        volume:             parseFloat(d.v as string),
        quoteVolume:        parseFloat(d.q as string),
      };
    }
  }, []);

  const parseCoinbase = useCallback((
    data: Record<string, unknown>,
    draft: Partial<ExchangeState>,
  ): void => {
    const type = data.type as string | undefined;
    if (type === 'snapshot') {
      const bids = (data.bids as [string,string][]) ?? [];
      const asks = (data.asks as [string,string][]) ?? [];
      bidsMap.current = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
      asksMap.current = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
      draft.bids = mapToLevels(bidsMap.current, false, levelsRef.current);
      draft.asks = mapToLevels(asksMap.current, true,  levelsRef.current);
    }
    if (type === 'l2update') {
      const changes = (data.changes as [string,string,string][]) ?? [];
      for (const [side, price, size] of changes) {
        if (side === 'buy')  applyDelta(bidsMap.current, [[price, size]]);
        if (side === 'sell') applyDelta(asksMap.current, [[price, size]]);
      }
      draft.bids = mapToLevels(bidsMap.current, false, levelsRef.current);
      draft.asks = mapToLevels(asksMap.current, true,  levelsRef.current);
    }
  }, []);

  // v62: compute EMA latency from exchange timestamp
  const computeLatency = useCallback((exchangeTs: number): void => {
    if (!exchangeTs || exchangeTs <= 0) return;
    const now = Date.now();
    const raw = now - exchangeTs;
    if (raw < 0 || raw > 10_000) return; // ignore bogus values
    const ema = latencyEmaRef.current;
    latencyEmaRef.current = ema === null ? raw : Math.round(ema * 0.8 + raw * 0.2);
  }, []);

  const flushQueue = useCallback(() => {
    rafRef.current = 0;
    if (!mountedRef.current) return;

    const messages = queueRef.current.splice(0);
    if (messages.length === 0) return;

    const draft: Partial<ExchangeState> & { _newTrades?: Trade[] } = {};
    const feed = activeFeedRef.current;
    let dirty = false; // v60: only setState if something actually changed

    for (const data of messages) {
      const msg = data as Record<string, unknown>;
      if (feed === 'bybit')    parseBybit(msg, draft);
      if (feed === 'binance')  parseBinance(msg, draft);
      if (feed === 'coinbase') parseCoinbase(msg, draft);

      // v62: extract exchange timestamp for latency measurement
      // Bybit: data.ts (ms) | Binance trade: data.data.T | Bybit trade: data.data[0].T
      const ts = (msg.ts as number) ||
        (msg.data && Array.isArray(msg.data) && (msg.data[0] as Record<string,number>)?.T) ||
        ((msg.data as Record<string,unknown>)?.T as number) ||
        0;
      if (ts > 1_000_000_000_000) computeLatency(ts); // sanity: must be ms epoch

      if (draft.trades) {
        draft._newTrades = [...(draft._newTrades ?? []), ...draft.trades];
        delete draft.trades;
        dirty = true;
      }
      if (draft.bids || draft.asks || draft.cvdPoints || draft.ticker) dirty = true;
    }

    if (!dirty) return; // v60: skip re-render if nothing changed

    if (draft._newTrades) {
      draft.trades = draft._newTrades;
      delete draft._newTrades;
    }

    setState((prev) => {
      const next: ExchangeState = { ...prev };
      if (draft.bids)      next.bids = draft.bids;
      if (draft.asks)      next.asks = draft.asks;
      if (draft.cvdPoints) next.cvdPoints = draft.cvdPoints;
      // v62: update latency from EMA ref
      if (latencyEmaRef.current !== null) next.latencyMs = latencyEmaRef.current;
      // v64: first live bids/asks → clear stale flag + save snapshot
      if ((draft.bids || draft.asks) && next.bids.length && next.asks.length) {
        next.isStale = false;
        saveSnapshot(activeFeedRef.current, symbolRef.current, next.bids, next.asks);
      }
      if (draft.trades) {
        // v60: cap at 50, avoid spread concat on large arrays
        const combined = draft.trades.length >= 50
          ? draft.trades.slice(0, 50)
          : draft.trades.concat(prev.trades).slice(0, 50);
        next.trades = combined;
      }
      if (draft.ticker) {
        const t = draft.ticker as TickerData & { _partial?: boolean; _prevPrice24h?: number };
        if (t._partial) {
          const base = prev.ticker ?? {
            lastPrice: 0, priceChange: 0, priceChangePercent: 0,
            highPrice: 0, lowPrice: 0, volume: 0, quoteVolume: 0,
          };
          const last    = (t.lastPrice as unknown as number | null) ?? base.lastPrice;
          const prev24h = (t as unknown as Record<string, number>)._prevPrice24h ?? 0;
          next.ticker = {
            lastPrice:          last,
            priceChange:        prev24h > 0 ? last - prev24h : base.priceChange + (last - base.lastPrice),
            priceChangePercent: (t.priceChangePercent as unknown as number | null) ?? base.priceChangePercent,
            highPrice:          (t.highPrice          as unknown as number | null) ?? base.highPrice,
            lowPrice:           (t.lowPrice           as unknown as number | null) ?? base.lowPrice,
            volume:             (t.volume             as unknown as number | null) ?? base.volume,
            quoteVolume:        (t.quoteVolume        as unknown as number | null) ?? base.quoteVolume,
          };
        } else {
          next.ticker = draft.ticker;
        }
      }
      return next;
    });
  }, [parseBybit, parseBinance, parseCoinbase]);

  // ── Generic WS connect helper ─────────────────────────────────────────────
  const connectWs = useCallback((
    feed: ExchangeId,
    url: string,
    subMsg: object,
    withPing: boolean,
  ) => {
    if (!mountedRef.current) return;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }

    // v67 BUG1+3 FIX: set refs BEFORE callbacks so rapid switches
    // don't let old WS onopen/onmessage corrupt activeFeedRef
    wsRef.current         = ws;
    activeFeedRef.current = feed;

    ws.onopen = () => {
      // v67: guard — stale WS already replaced, ignore
      if (!mountedRef.current || wsRef.current !== ws) return;
      if (bybitTmrRef.current) { clearTimeout(bybitTmrRef.current); bybitTmrRef.current = undefined; }
      attemptRef.current = 0;
      latencyEmaRef.current = null;
      setStatus('connected');
      setState((prev) => ({ ...prev, activeFeed: feed }));
      if (Object.keys(subMsg).length > 0) ws.send(JSON.stringify(subMsg));
      if (withPing) {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            lastPingTimeRef.current = Date.now();
            ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, 20_000);
      }
      function resetHeartbeat() {
        if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
        heartbeatRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          if (ws.readyState === WebSocket.OPEN) ws.close();
        }, HEARTBEAT_TIMEOUT);
      }
      resetHeartbeat();
      const origMsg = ws.onmessage;
      ws.onmessage = (ev) => {
        resetHeartbeat();
        if (origMsg) origMsg.call(ws, ev);
      };
    };

    ws.onmessage = (ev) => {
      // v67: guard — only process messages from active WS
      if (!mountedRef.current || wsRef.current !== ws) return;
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (data.op === 'pong' || data.op === 'subscribe') return;
        queueRef.current.push(data);
        if (!rafRef.current) rafRef.current = requestAnimationFrame(flushQueue);
      } catch { /* malformed */ }
    };

    ws.onclose = () => {
      // v67: guard — ignore close if already replaced by newer WS
      if (wsRef.current !== ws && wsRef.current !== null) return;
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = undefined; }
      if (heartbeatRef.current) { clearTimeout(heartbeatRef.current); heartbeatRef.current = undefined; }
      setStatus('disconnected');
      if (mountedRef.current) {
        retryRef.current = setTimeout(() => {
          attemptRef.current++;
          connectRef.current();
        }, getReconnectDelay(attemptRef.current));
      }
    };

    ws.onerror = () => ws.close();
  }, [flushQueue, setStatus]);

  // ── Main connect ──────────────────────────────────────────────────────────
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // v67 BUG2 FIX: cancel pending retry FIRST — prevents ghost reconnects
    if (retryRef.current)    { clearTimeout(retryRef.current);    retryRef.current    = undefined; }
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    if (pingRef.current)     { clearInterval(pingRef.current);    pingRef.current     = undefined; }
    // v67 BUG4 FIX: always cancel bybitTmrRef (even when switching FROM bybit to other)
    if (bybitTmrRef.current) { clearTimeout(bybitTmrRef.current); bybitTmrRef.current = undefined; }

    setStatus('reconnecting');

    const exch = exchangeRef.current;
    const sym  = symbolRef.current;

    if (exch === 'bybit') {
      const bybitUrl = getWsUrl('bybit', sym);
      const subMsg   = getSubscribeMsg('bybit', sym);

      bybitTmrRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        const ws = wsRef.current;
        if (ws && ws.readyState !== WebSocket.OPEN) {
          ws.onclose = null;
          ws.close();
          wsRef.current = null;
          connectWs('binance', getBinanceCombinedUrl(sym), {}, false);
        }
      }, BYBIT_TIMEOUT_MS);

      connectWs('bybit', bybitUrl, subMsg, true);

    } else if (exch === 'binance') {
      connectWs('binance', getBinanceCombinedUrl(sym), {}, false);

    } else if (exch === 'coinbase') {
      const url    = getWsUrl('coinbase', sym);
      const subMsg = getSubscribeMsg('coinbase', sym);
      connectWs('coinbase', url, subMsg, false);
    }
  }, [connectWs, setStatus]);

  // Keep connectRef always pointing to latest connect
  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current   = true;
    bidsMap.current      = new Map();
    asksMap.current      = new Map();
    cvdRef.current       = 0;
    cvdBuf.current.clear();
    tradeId.current      = 0;
    prevPrice24h.current = 0;
    queueRef.current     = [];

    // v64: Load snapshot cache — show stale data immediately while connecting
    const cached = loadSnapshot(exchange, symbol);
    if (cached) {
      setState({ ...EMPTY_STATE, activeFeed: exchange, bids: cached.bids, asks: cached.asks, isStale: true });
    } else {
      setState({ ...EMPTY_STATE, activeFeed: exchange });
    }

    connect();

    // v62: reconnect immediately when tab becomes visible again
    const onVisible = () => {
      if (!document.hidden && mountedRef.current) {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          attemptRef.current = 0; // reset backoff on manual focus
          connectRef.current();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (retryRef.current)     clearTimeout(retryRef.current);
      if (pingRef.current)      clearInterval(pingRef.current);
      if (rafRef.current)       cancelAnimationFrame(rafRef.current);
      if (bybitTmrRef.current)  clearTimeout(bybitTmrRef.current);
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, symbol]);

  return state;
}
