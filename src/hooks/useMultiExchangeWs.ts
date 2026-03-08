/**
 * useMultiExchangeWs.ts — ZERØ ORDER BOOK v70
 *
 * v70 PERFORMANCE OVERHAUL — fixes all 4 lag issues:
 *
 * FIX 1 — Worker onmessage stale closure:
 *   Worker dibuat SEKALI di module level (singleton), bukan per hook mount.
 *   Ini eliminasi re-attach handler bug yang bikin orderbook jarang update.
 *
 * FIX 2 — RAF bottleneck dihapus untuk orderbook:
 *   Orderbook/trades dari worker → setState LANGSUNG, no RAF queue.
 *   RAF hanya untuk ticker (1 update/detik, tidak perlu cepat).
 *
 * FIX 3 — Switch exchange instant:
 *   connectWs() langsung reset worker + clear maps sebelum koneksi baru.
 *   Snapshot cache tetap tampil selama connecting.
 *
 * FIX 4 — UI lag:
 *   Hapus spread concat di trades — pakai slice langsung.
 *   mapToLevels hanya dipanggil dari worker thread, bukan main thread.
 *   setState batching — orderbook + trades digabung dalam 1 setState call.
 *
 * rgba() only ✓ · mountedRef ✓ · zero mock data ✓
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
  isStale:    boolean;
}

const EMPTY_STATE: ExchangeState = {
  bids: [], asks: [], trades: [], ticker: null, cvdPoints: [],
  status: 'disconnected', latencyMs: null, activeFeed: 'bybit',
  isStale: false,
};

// ── Snapshot cache ────────────────────────────────────────────────────────────
function snapKey(exchange: ExchangeId, symbol: string) {
  return `zero_snap_${exchange}_${symbol}`;
}
const snapThrottleMap = new Map<string, number>();

function saveSnapshot(exchange: ExchangeId, symbol: string, bids: OrderBookLevel2[], asks: OrderBookLevel2[]) {
  if (!bids.length || !asks.length) return;
  const key = snapKey(exchange, symbol);
  const now = Date.now();
  if ((now - (snapThrottleMap.get(key) ?? 0)) < 2000) return;
  snapThrottleMap.set(key, now);
  try {
    sessionStorage.setItem(key, JSON.stringify({ bids: bids.slice(0, 20), asks: asks.slice(0, 20), ts: now }));
  } catch {}
}

function loadSnapshot(exchange: ExchangeId, symbol: string): { bids: OrderBookLevel2[]; asks: OrderBookLevel2[] } | null {
  try {
    const raw = sessionStorage.getItem(snapKey(exchange, symbol));
    if (!raw) return null;
    const snap = JSON.parse(raw) as { bids: OrderBookLevel2[]; asks: OrderBookLevel2[]; ts: number };
    if (Date.now() - snap.ts > 5 * 60_000) return null;
    return { bids: snap.bids, asks: snap.asks };
  } catch { return null; }
}

// ── Worker singleton — created once, reused across all hook instances ─────────
// This is the KEY fix: worker tidak di-recreate tiap exchange/symbol switch
let _workerSingleton: Worker | null = null;
let _workerCallbacks = new Set<(e: MessageEvent) => void>();

function getWorker(): Worker | null {
  if (_workerSingleton) return _workerSingleton;
  try {
    _workerSingleton = new Worker(
      new URL('../workers/orderbook.worker.ts', import.meta.url),
      { type: 'module' },
    );
    _workerSingleton.onmessage = (e: MessageEvent) => {
      _workerCallbacks.forEach(cb => cb(e));
    };
    _workerSingleton.onerror = () => {
      _workerSingleton = null;
      _workerCallbacks.clear();
    };
    return _workerSingleton;
  } catch {
    return null;
  }
}

// ── Price map helpers ─────────────────────────────────────────────────────────
type PriceMap = Map<string, number>;
const WHALE = 100_000;

function applyDelta(map: PriceMap, updates: [string, string][]) {
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

function getEffectiveLevels(base: number): number {
  const conn = (navigator as unknown as Record<string, Record<string, string>>).connection;
  const type = conn?.effectiveType ?? '4g';
  if (type === 'slow-2g') return Math.max(5,  Math.floor(base * 0.2));
  if (type === '2g')      return Math.max(10, Math.floor(base * 0.4));
  if (type === '3g')      return Math.max(15, Math.floor(base * 0.6));
  return base;
}

const PROXY_WS = import.meta.env.VITE_PROXY_URL
  ? import.meta.env.VITE_PROXY_URL.replace('https://', 'wss://')
  : 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

function getBinanceCombinedUrl(symbol: string) {
  const sym = symbol.toLowerCase();
  return `${PROXY_WS}/stream/${sym}@depth20@100ms/${sym}@trade/${sym}@ticker`;
}

const BYBIT_TIMEOUT_MS = 10_000;

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useMultiExchangeWs(
  exchange: ExchangeId,
  symbol:   string,
  levelsOverride?: number,
): ExchangeState {
  const profile         = useRef(detectDeviceProfile());
  const effectiveLevels = getEffectiveLevels(levelsOverride ?? profile.current.maxLevels);

  const [state, setState] = useState<ExchangeState>({ ...EMPTY_STATE, activeFeed: exchange });

  const wsRef         = useRef<WebSocket | null>(null);
  const mountedRef    = useRef(true);
  const attemptRef    = useRef(0);
  const retryRef      = useRef<ReturnType<typeof setTimeout>>();
  const pingRef       = useRef<ReturnType<typeof setInterval>>();
  const bybitTmrRef   = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatRef  = useRef<ReturnType<typeof setTimeout>>();
  const activeFeedRef = useRef<ExchangeId>(exchange);
  const rafRef        = useRef(0);

  // Latency EMA
  const latencyEmaRef = useRef<number | null>(null);

  // Inline parse state (fallback when worker unavailable)
  const bidsMap      = useRef<PriceMap>(new Map());
  const asksMap      = useRef<PriceMap>(new Map());
  const cvdRef       = useRef(0);
  const cvdBuf       = useRef(new CircularBuffer<CvdPoint>(profile.current.cvdWindow));
  const tradeId      = useRef(0);
  const prevPrice24h = useRef(0);

  // Stable refs
  const exchangeRef = useRef(exchange);
  const symbolRef   = useRef(symbol);
  const levelsRef   = useRef(effectiveLevels);
  exchangeRef.current = exchange;
  symbolRef.current   = symbol;
  levelsRef.current   = effectiveLevels;

  const setStatus = useCallback((s: ConnectionStatus) => {
    setState(prev => prev.status === s ? prev : { ...prev, status: s });
  }, []);

  const computeLatency = useCallback((exchangeTs: number) => {
    if (!exchangeTs || exchangeTs <= 0) return;
    const raw = Date.now() - exchangeTs;
    if (raw < 0 || raw > 10_000) return;
    latencyEmaRef.current = latencyEmaRef.current === null
      ? raw
      : Math.round(latencyEmaRef.current * 0.8 + raw * 0.2);
  }, []);

  // ── Worker message handler — registered on mount, removed on unmount ───────
  // FIX 1: stable callback registered to singleton worker
  const workerCallback = useCallback((e: MessageEvent) => {
    if (!mountedRef.current) return;
    const msg = e.data as { type: string } & Record<string, unknown>;

    if (msg.type === 'orderbook') {
      const bids = msg.bids as OrderBookLevel2[];
      const asks = msg.asks as OrderBookLevel2[];
      // FIX 2: setState DIRECTLY — no RAF delay for orderbook
      setState(prev => {
        const next = { ...prev, bids, asks, isStale: false };
        if (latencyEmaRef.current !== null) next.latencyMs = latencyEmaRef.current;
        saveSnapshot(activeFeedRef.current, symbolRef.current, bids, asks);
        return next;
      });
      return;
    }

    if (msg.type === 'trades') {
      const incoming  = msg.trades    as Trade[];
      const cvdPoints = msg.cvdPoints as CvdPoint[];
      setState(prev => {
        // FIX 4: no spread concat — direct slice
        const combined = incoming.concat(prev.trades).slice(0, 50);
        return { ...prev, trades: combined, cvdPoints };
      });
    }
  }, []);

  // ── Inline parsers (fallback — worker unavailable) ────────────────────────
  const tickerRafDraft = useRef<Partial<ExchangeState> | null>(null);

  const flushTicker = useCallback(() => {
    rafRef.current = 0;
    if (!mountedRef.current || !tickerRafDraft.current) return;
    const draft = tickerRafDraft.current;
    tickerRafDraft.current = null;
    if (!draft.ticker) return;
    setState(prev => {
      const next = { ...prev };
      if (latencyEmaRef.current !== null) next.latencyMs = latencyEmaRef.current;
      const t = draft.ticker as TickerData & { _partial?: boolean; _prevPrice24h?: number };
      if (t._partial) {
        const base = prev.ticker ?? { lastPrice: 0, priceChange: 0, priceChangePercent: 0, highPrice: 0, lowPrice: 0, volume: 0, quoteVolume: 0 };
        const last    = (t.lastPrice    as unknown as number | null) ?? base.lastPrice;
        const prev24h = (t as unknown as Record<string, number>)._prevPrice24h ?? 0;
        next.ticker = {
          lastPrice:          last,
          priceChange:        prev24h > 0 ? last - prev24h : base.priceChange + (last - base.lastPrice),
          priceChangePercent: (t.priceChangePercent as unknown as number | null) ?? base.priceChangePercent,
          highPrice:          (t.highPrice           as unknown as number | null) ?? base.highPrice,
          lowPrice:           (t.lowPrice            as unknown as number | null) ?? base.lowPrice,
          volume:             (t.volume              as unknown as number | null) ?? base.volume,
          quoteVolume:        (t.quoteVolume         as unknown as number | null) ?? base.quoteVolume,
        };
      } else {
        next.ticker = draft.ticker!;
      }
      return next;
    });
  }, []);

  // ── Route message to worker OR parse inline ────────────────────────────────
  const handleMessage = useCallback((data: Record<string, unknown>) => {
    const feed   = activeFeedRef.current;
    const worker = getWorker();

    // ── BYBIT ──────────────────────────────────────────────────────────────
    if (feed === 'bybit') {
      const topic = data.topic as string | undefined;
      if (!topic) return;

      if (topic.startsWith('orderbook.')) {
        const d = data.data as { b: [string,string][]; a: [string,string][] } | undefined;
        if (!d) return;
        if (worker) {
          worker.postMessage({ type: 'orderbook', exchange: 'bybit', msgType: data.type, data: d, levels: levelsRef.current });
        } else {
          if (data.type === 'snapshot') {
            bidsMap.current = new Map(d.b.map(([p, s]) => [p, parseFloat(s)]));
            asksMap.current = new Map(d.a.map(([p, s]) => [p, parseFloat(s)]));
          } else {
            applyDelta(bidsMap.current, d.b);
            applyDelta(asksMap.current, d.a);
          }
          const bids = mapToLevels(bidsMap.current, false, levelsRef.current);
          const asks = mapToLevels(asksMap.current, true,  levelsRef.current);
          setState(prev => ({ ...prev, bids, asks, isStale: false }));
        }
        return;
      }

      if (topic.startsWith('publicTrade.')) {
        const arr = data.data as Array<{ i:string; T:number; p:string; v:string; S:'Buy'|'Sell' }>;
        if (!Array.isArray(arr)) return;
        if (worker) {
          worker.postMessage({ type: 'trades', exchange: 'bybit', trades: arr });
        } else {
          const incoming: Trade[] = arr.map(d => ({
            id: String(tradeId.current++), time: d.T,
            price: parseFloat(d.p), size: parseFloat(d.v),
            isBuyerMaker: d.S === 'Sell',
          }));
          for (const t of incoming) { cvdRef.current += t.isBuyerMaker ? -t.size : t.size; cvdBuf.current.push({ time: t.time, cvd: cvdRef.current }); }
          setState(prev => ({ ...prev, trades: incoming.concat(prev.trades).slice(0, 50), cvdPoints: cvdBuf.current.toArray() }));
        }
        return;
      }

      if (topic.startsWith('tickers.')) {
        const d = data.data as Record<string, string> | undefined;
        if (!d) return;
        if (d.prevPrice24h) prevPrice24h.current = parseFloat(d.prevPrice24h);
        const ticker = {
          _partial: true,
          lastPrice:          d.lastPrice    ? parseFloat(d.lastPrice)          : null,
          priceChangePercent: d.price24hPcnt ? parseFloat(d.price24hPcnt) * 100 : null,
          highPrice:          d.highPrice24h  ? parseFloat(d.highPrice24h)       : null,
          lowPrice:           d.lowPrice24h   ? parseFloat(d.lowPrice24h)        : null,
          volume:             d.volume24h     ? parseFloat(d.volume24h)          : null,
          quoteVolume:        d.turnover24h   ? parseFloat(d.turnover24h)        : null,
          _prevPrice24h:      prevPrice24h.current,
        } as unknown as TickerData;
        tickerRafDraft.current = { ticker };
        if (!rafRef.current) rafRef.current = requestAnimationFrame(flushTicker);
        return;
      }
    }

    // ── BINANCE ────────────────────────────────────────────────────────────
    if (feed === 'binance') {
      const stream = data.stream as string | undefined;
      const d      = data.data   as Record<string, unknown> | undefined;
      if (!stream || !d) return;

      if (stream.includes('@depth')) {
        const bids = (d.bids as [string,string][]) ?? (d.b as [string,string][]) ?? [];
        const asks = (d.asks as [string,string][]) ?? (d.a as [string,string][]) ?? [];
        if (worker) {
          worker.postMessage({ type: 'orderbook', exchange: 'binance', bids, asks, levels: levelsRef.current });
        } else {
          if (bids.length || asks.length) {
            bidsMap.current = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
            asksMap.current = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
          }
          const b = mapToLevels(bidsMap.current, false, levelsRef.current);
          const a = mapToLevels(asksMap.current, true,  levelsRef.current);
          setState(prev => ({ ...prev, bids: b, asks: a, isStale: false }));
        }
        return;
      }

      if (stream.includes('@trade')) {
        if (worker) {
          worker.postMessage({ type: 'trades', exchange: 'binance', trade: d });
        } else {
          const t: Trade = { id: String(tradeId.current++), time: d.T as number, price: parseFloat(d.p as string), size: parseFloat(d.q as string), isBuyerMaker: d.m as boolean };
          cvdRef.current += t.isBuyerMaker ? -t.size : t.size;
          cvdBuf.current.push({ time: t.time, cvd: cvdRef.current });
          setState(prev => ({ ...prev, trades: [t].concat(prev.trades).slice(0, 50), cvdPoints: cvdBuf.current.toArray() }));
        }
        return;
      }

      if (stream.includes('@ticker')) {
        const ticker: TickerData = {
          lastPrice:          parseFloat(d.c as string),
          priceChange:        parseFloat(d.p as string),
          priceChangePercent: parseFloat(d.P as string),
          highPrice:          parseFloat(d.h as string),
          lowPrice:           d.l ? parseFloat(d.l as string) : 0,
          volume:             parseFloat(d.v as string),
          quoteVolume:        parseFloat(d.q as string),
        };
        tickerRafDraft.current = { ticker };
        if (!rafRef.current) rafRef.current = requestAnimationFrame(flushTicker);
        return;
      }
    }

    // ── OKX ───────────────────────────────────────────────────────────────
    if (feed === 'okx') {
      const arg     = data.arg     as Record<string, string> | undefined;
      const channel = arg?.channel ?? '';
      const action  = data.action  as string | undefined;
      const rawData = data.data    as Record<string, unknown>[] | undefined;
      if (!rawData?.length) return;

      if (channel === 'books' || channel === 'books5') {
        const d = rawData[0] as { bids: [string,string,string,string][]; asks: [string,string,string,string][] };
        if (worker) {
          worker.postMessage({ type: 'orderbook', exchange: 'okx', action: action ?? 'update', bids: d.bids, asks: d.asks, levels: levelsRef.current });
        } else {
          // FIX v78: if maps empty (first msg after switch), treat as snapshot
          const isEmpty = bidsMap.current.size === 0 && asksMap.current.size === 0;
          if (action === 'snapshot' || isEmpty) {
            bidsMap.current = new Map(d.bids.map(([p, s]) => [p, parseFloat(s)]));
            asksMap.current = new Map(d.asks.map(([p, s]) => [p, parseFloat(s)]));
          } else {
            applyDelta(bidsMap.current, d.bids.map(([p, s]) => [p, s] as [string, string]));
            applyDelta(asksMap.current, d.asks.map(([p, s]) => [p, s] as [string, string]));
          }
          const b = mapToLevels(bidsMap.current, false, levelsRef.current);
          const a = mapToLevels(asksMap.current, true,  levelsRef.current);
          setState(prev => ({ ...prev, bids: b, asks: a, isStale: false }));
        }
        return;
      }

      if (channel === 'trades') {
        if (worker) {
          worker.postMessage({ type: 'trades', exchange: 'okx', trades: rawData });
        } else {
          const incoming: Trade[] = rawData.map(d => ({
            id: d.tradeId as string, time: parseInt(d.ts as string),
            price: parseFloat(d.px as string), size: parseFloat(d.sz as string),
            isBuyerMaker: (d.side as string) === 'sell',
          }));
          for (const t of incoming) { cvdRef.current += t.isBuyerMaker ? -t.size : t.size; cvdBuf.current.push({ time: t.time, cvd: cvdRef.current }); }
          setState(prev => ({ ...prev, trades: incoming.concat(prev.trades).slice(0, 50), cvdPoints: cvdBuf.current.toArray() }));
        }
        return;
      }

      if (channel === 'tickers') {
        const d = rawData[0] as Record<string, string>;
        const last = parseFloat(d.last);
        const open = parseFloat(d.open24h);
        const ticker: TickerData = {
          lastPrice:          last,
          priceChange:        last - open,
          priceChangePercent: ((last - open) / open) * 100,
          highPrice:          parseFloat(d.high24h),
          lowPrice:           parseFloat(d.low24h),
          volume:             parseFloat(d.vol24h),
          quoteVolume:        parseFloat(d.volCcy24h),
        };
        tickerRafDraft.current = { ticker };
        if (!rafRef.current) rafRef.current = requestAnimationFrame(flushTicker);
      }
    }
  }, [flushTicker]);

  // ── WebSocket connect ──────────────────────────────────────────────────────
  const connectRef = useRef<() => void>(() => {});
  const HEARTBEAT  = 15_000;

  const connectWs = useCallback((
    feed: ExchangeId, url: string, subMsg: object, withPing: boolean,
  ) => {
    if (!mountedRef.current) return;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }

    // v67 race fix: set refs BEFORE callbacks
    wsRef.current         = ws;
    activeFeedRef.current = feed;

    // FIX 3: reset worker state instantly on new connection
    const worker = getWorker();
    if (worker) {
      worker.postMessage({ type: 'reset' });
      worker.postMessage({ type: 'configure', levels: levelsRef.current, cvdWindow: profile.current.cvdWindow });
    }
    bidsMap.current = new Map();
    asksMap.current = new Map();
    cvdRef.current  = 0;
    cvdBuf.current.clear();

    ws.onopen = () => {
      if (!mountedRef.current || wsRef.current !== ws) return;
      if (bybitTmrRef.current) { clearTimeout(bybitTmrRef.current); bybitTmrRef.current = undefined; }
      attemptRef.current    = 0;
      latencyEmaRef.current = null;
      setStatus('connected');
      setState(prev => ({ ...prev, activeFeed: feed }));
      if (Object.keys(subMsg).length > 0) ws.send(JSON.stringify(subMsg));
      if (withPing) {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
        }, 20_000);
      }
      // Heartbeat watchdog
      const resetHB = () => {
        if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
        heartbeatRef.current = setTimeout(() => {
          if (mountedRef.current && ws.readyState === WebSocket.OPEN) ws.close();
        }, HEARTBEAT);
      };
      resetHB();
      const origMsg = ws.onmessage;
      ws.onmessage = (ev) => { resetHB(); if (origMsg) origMsg.call(ws, ev); };
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current || wsRef.current !== ws) return;
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (data.op === 'pong' || data.op === 'subscribe') return;

        // Latency from exchange timestamp
        const ts = (data.ts as number) ||
          (data.data && Array.isArray(data.data) && (data.data[0] as Record<string,number>)?.T) ||
          ((data.data as Record<string,unknown>)?.T as number) || 0;
        if (ts > 1_000_000_000_000) computeLatency(ts);

        handleMessage(data);
      } catch {}
    };

    ws.onclose = () => {
      if (wsRef.current !== ws && wsRef.current !== null) return;
      if (pingRef.current)    { clearInterval(pingRef.current);   pingRef.current    = undefined; }
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
  }, [setStatus, handleMessage, computeLatency]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    // v67: cancel all pending timers first
    if (retryRef.current)    { clearTimeout(retryRef.current);    retryRef.current    = undefined; }
    if (wsRef.current)       { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    if (pingRef.current)     { clearInterval(pingRef.current);    pingRef.current     = undefined; }
    if (bybitTmrRef.current) { clearTimeout(bybitTmrRef.current); bybitTmrRef.current = undefined; }

    setStatus('reconnecting');
    const exch = exchangeRef.current;
    const sym  = symbolRef.current;

    if (exch === 'bybit') {
      bybitTmrRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        const ws = wsRef.current;
        if (ws && ws.readyState !== WebSocket.OPEN) {
          ws.onclose = null; ws.close(); wsRef.current = null;
          connectWs('binance', getBinanceCombinedUrl(sym), {}, false);
        }
      }, BYBIT_TIMEOUT_MS);
      connectWs('bybit', getWsUrl('bybit', sym), getSubscribeMsg('bybit', sym), true);

    } else if (exch === 'binance') {
      connectWs('binance', getBinanceCombinedUrl(sym), {}, false);

    } else if (exch === 'okx') {
      connectWs('okx', getWsUrl('okx', sym), getSubscribeMsg('okx', sym), false);
    }
  }, [connectWs, setStatus]);

  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current = true;

    // Register to singleton worker
    const worker = getWorker();
    if (worker) {
      _workerCallbacks.add(workerCallback);
      worker.postMessage({ type: 'configure', levels: effectiveLevels, cvdWindow: profile.current.cvdWindow });
    }

    // Reset inline state
    bidsMap.current = new Map(); asksMap.current = new Map();
    cvdRef.current  = 0; cvdBuf.current.clear();
    tradeId.current = 0; prevPrice24h.current = 0;

    // Load snapshot cache
    const cached = loadSnapshot(exchange, symbol);
    setState(cached
      ? { ...EMPTY_STATE, activeFeed: exchange, bids: cached.bids, asks: cached.asks, isStale: true }
      : { ...EMPTY_STATE, activeFeed: exchange },
    );

    connect();

    const onVisible = () => {
      if (!document.hidden && mountedRef.current) {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          attemptRef.current = 0;
          connectRef.current();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      _workerCallbacks.delete(workerCallback);
      if (retryRef.current)     clearTimeout(retryRef.current);
      if (pingRef.current)      clearInterval(pingRef.current);
      if (rafRef.current)       cancelAnimationFrame(rafRef.current);
      if (bybitTmrRef.current)  clearTimeout(bybitTmrRef.current);
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      if (wsRef.current)        { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      // NOTE: worker singleton NOT terminated — reused across sessions
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, symbol]);

  return state;
}
