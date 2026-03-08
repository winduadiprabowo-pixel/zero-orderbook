/**
 * useMultiExchangeWs.ts — ZERØ ORDER BOOK v68
 *
 * v67:
 *   - 4 race conditions fixed on exchange switch
 *   - activeFeedRef set in connectWs() BEFORE callbacks (not onopen)
 *   - retryRef + bybitTmrRef cancelled at top of connect()
 *   - WS guard: if (wsRef.current !== ws) return in all 3 callbacks
 *
 * v68 — Web Worker wiring:
 *   - orderbook.worker.ts now handles ALL parsing off main thread
 *   - Main thread: WS recv → postMessage(raw) → worker → postMessage(parsed) → setState
 *   - Fallback: if Worker unavailable (e.g. old browser), parse inline (same as v67)
 *   - Worker receives: orderbook + trades messages per exchange
 *   - Worker returns: { type:'orderbook', bids, asks, mid } | { type:'trades', trades, cvdPoints }
 *   - Ticker still parsed on main thread (lightweight, no array ops)
 *   - RAF queue only for ticker now; orderbook/trades come from worker postMessage
 *
 * rgba() only ✓ · RAF-gated ticker ✓ · mountedRef ✓ · zero mock data ✓
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

// ── v64: Snapshot cache ───────────────────────────────────────────────────────
function snapKey(exchange: ExchangeId, symbol: string): string {
  return `zero_snap_${exchange}_${symbol}`;
}
const snapThrottleMap = new Map<string, number>();

function saveSnapshot(exchange: ExchangeId, symbol: string, bids: OrderBookLevel2[], asks: OrderBookLevel2[]): void {
  if (!bids.length || !asks.length) return;
  const key = snapKey(exchange, symbol);
  const now = Date.now();
  const last = snapThrottleMap.get(key) ?? 0;
  if (now - last < 2000) return;
  snapThrottleMap.set(key, now);
  try {
    const snap = { bids: bids.slice(0, 20), asks: asks.slice(0, 20), ts: now };
    sessionStorage.setItem(key, JSON.stringify(snap));
  } catch { /* storage full — silently skip */ }
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

const BYBIT_TIMEOUT_MS = 10_000;

type PriceMap = Map<string, number>;
const WHALE = 100_000;

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

const PROXY_WS = import.meta.env.VITE_PROXY_URL
  ? import.meta.env.VITE_PROXY_URL.replace('https://', 'wss://')
  : 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

function getBinanceCombinedUrl(symbol: string): string {
  const sym = symbol.toLowerCase();
  const streams = `${sym}@depth20@100ms/${sym}@trade/${sym}@ticker`;
  return `${PROXY_WS}/stream/${streams}`;
}

// ── Worker bootstrap ──────────────────────────────────────────────────────────
function tryCreateWorker(): Worker | null {
  try {
    return new Worker(new URL('../workers/orderbook.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null; // Old browser or bundler issue — graceful fallback
  }
}

export function useMultiExchangeWs(
  exchange: ExchangeId,
  symbol:   string,
  levelsOverride?: number,
): ExchangeState {
  const profile         = useRef(detectDeviceProfile());
  const baseLevels      = levelsOverride ?? profile.current.maxLevels;
  const effectiveLevels = getEffectiveLevels(baseLevels);

  const [state, setState] = useState<ExchangeState>({ ...EMPTY_STATE, activeFeed: exchange });

  const wsRef         = useRef<WebSocket | null>(null);
  const mountedRef    = useRef(true);
  const attemptRef    = useRef(0);
  const retryRef      = useRef<ReturnType<typeof setTimeout>>();
  const pingRef       = useRef<ReturnType<typeof setInterval>>();
  const bybitTmrRef   = useRef<ReturnType<typeof setTimeout>>();
  const activeFeedRef = useRef<ExchangeId>(exchange);

  // ── v68: Web Worker ref ────────────────────────────────────────────────────
  const workerRef      = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false); // false = fallback to inline parse

  // Inline fallback state (used only if worker unavailable)
  const rafRef   = useRef(0);
  const queueRef = useRef<Record<string, unknown>[]>([]);

  const latencyEmaRef   = useRef<number | null>(null);
  const lastPingTimeRef = useRef<number>(0);
  const heartbeatRef    = useRef<ReturnType<typeof setTimeout>>();
  const HEARTBEAT_TIMEOUT = 15_000;

  // Fallback-only maps (worker has its own)
  const bidsMap      = useRef<PriceMap>(new Map());
  const asksMap      = useRef<PriceMap>(new Map());
  const cvdRef       = useRef(0);
  const cvdBuf       = useRef(new CircularBuffer<CvdPoint>(profile.current.cvdWindow));
  const tradeId      = useRef(0);
  const prevPrice24h = useRef(0);

  const exchangeRef = useRef(exchange);
  const symbolRef   = useRef(symbol);
  const levelsRef   = useRef(effectiveLevels);
  exchangeRef.current = exchange;
  symbolRef.current   = symbol;
  levelsRef.current   = effectiveLevels;

  const setStatus = useCallback((s: ConnectionStatus) => {
    setState((prev) => prev.status === s ? prev : { ...prev, status: s });
  }, []);

  // ── Worker message handler ─────────────────────────────────────────────────
  const handleWorkerMessage = useCallback((e: MessageEvent) => {
    if (!mountedRef.current) return;
    const msg = e.data as { type: string } & Record<string, unknown>;

    if (msg.type === 'orderbook') {
      const bids = msg.bids as OrderBookLevel2[];
      const asks = msg.asks as OrderBookLevel2[];
      setState((prev) => {
        const next = { ...prev, bids, asks, isStale: false };
        if (latencyEmaRef.current !== null) next.latencyMs = latencyEmaRef.current;
        saveSnapshot(activeFeedRef.current, symbolRef.current, bids, asks);
        return next;
      });
      return;
    }

    if (msg.type === 'trades') {
      const incoming = msg.trades as Trade[];
      const cvdPoints = msg.cvdPoints as CvdPoint[];
      setState((prev) => {
        const combined = incoming.length >= 50
          ? incoming.slice(0, 50)
          : incoming.concat(prev.trades).slice(0, 50);
        return { ...prev, trades: combined, cvdPoints };
      });
    }
  }, []);

  // ── Inline fallback parsers (used only when worker unavailable) ────────────
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

  const parseOkx = useCallback((
    data: Record<string, unknown>,
    draft: Partial<ExchangeState>,
  ): void => {
    // OKX WS v5 format:
    // { arg: { channel, instId }, action: 'snapshot'|'update', data: [{ bids:[[p,s,_,_]], asks:... }] }
    // trades: { arg: { channel:'trades' }, data: [{ tradeId, px, sz, side:'buy'|'sell', ts }] }
    // tickers: { arg: { channel:'tickers' }, data: [{ last, open24h, high24h, low24h, vol24h, volCcy24h }] }
    const arg     = data.arg as Record<string, string> | undefined;
    const channel = arg?.channel ?? '';
    const action  = data.action  as string | undefined;
    const rawData = data.data    as Record<string, unknown>[] | undefined;
    if (!rawData?.length) return;

    if (channel === 'books' || channel === 'books5') {
      const d = rawData[0] as {
        bids: [string, string, string, string][];
        asks: [string, string, string, string][];
      };
      if (!d) return;
      // OKX bids/asks: [price, size, liquidated_orders, orders_count]
      if (action === 'snapshot') {
        bidsMap.current = new Map(d.bids.map(([p, s]) => [p, parseFloat(s)]));
        asksMap.current = new Map(d.asks.map(([p, s]) => [p, parseFloat(s)]));
      } else { // update
        applyDelta(bidsMap.current, d.bids.map(([p, s]) => [p, s] as [string, string]));
        applyDelta(asksMap.current, d.asks.map(([p, s]) => [p, s] as [string, string]));
      }
      draft.bids = mapToLevels(bidsMap.current, false, levelsRef.current);
      draft.asks = mapToLevels(asksMap.current, true,  levelsRef.current);
    }

    if (channel === 'trades') {
      const incoming: Trade[] = rawData.map((d) => ({
        id:           d.tradeId as string,
        time:         parseInt(d.ts as string),
        price:        parseFloat(d.px as string),
        size:         parseFloat(d.sz as string),
        isBuyerMaker: (d.side as string) === 'sell',
      }));
      for (const t of incoming) {
        cvdRef.current += t.isBuyerMaker ? -t.size : t.size;
        cvdBuf.current.push({ time: t.time, cvd: cvdRef.current });
      }
      draft.trades    = incoming;
      draft.cvdPoints = cvdBuf.current.toArray();
    }

    if (channel === 'tickers') {
      const d = rawData[0] as Record<string, string>;
      if (!d) return;
      draft.ticker = {
        lastPrice:          parseFloat(d.last),
        priceChange:        parseFloat(d.last) - parseFloat(d.open24h),
        priceChangePercent: ((parseFloat(d.last) - parseFloat(d.open24h)) / parseFloat(d.open24h)) * 100,
        highPrice:          parseFloat(d.high24h),
        lowPrice:           parseFloat(d.low24h),
        volume:             parseFloat(d.vol24h),
        quoteVolume:        parseFloat(d.volCcy24h),
      };
    }
  }, []);

  const computeLatency = useCallback((exchangeTs: number): void => {
    if (!exchangeTs || exchangeTs <= 0) return;
    const now = Date.now();
    const raw = now - exchangeTs;
    if (raw < 0 || raw > 10_000) return;
    const ema = latencyEmaRef.current;
    latencyEmaRef.current = ema === null ? raw : Math.round(ema * 0.8 + raw * 0.2);
  }, []);

  // ── v68: route message to worker OR inline fallback ────────────────────────
  const routeToWorker = useCallback((
    data: Record<string, unknown>,
    feed: ExchangeId,
  ): boolean => {
    if (!workerReadyRef.current || !workerRef.current) return false;
    const w = workerRef.current;

    if (feed === 'bybit') {
      const topic = data.topic as string | undefined;
      if (!topic) return false;
      if (topic.startsWith('orderbook.')) {
        const d = data.data as { b: [string,string][]; a: [string,string][] } | undefined;
        if (!d) return false;
        w.postMessage({
          type: 'orderbook', exchange: 'bybit',
          msgType: data.type, data: d,
          levels: levelsRef.current,
        });
        return true;
      }
      if (topic.startsWith('publicTrade.')) {
        const arr = data.data as Array<{ i:string; T:number; p:string; v:string; S:'Buy'|'Sell' }>;
        if (Array.isArray(arr)) {
          w.postMessage({ type: 'trades', exchange: 'bybit', trades: arr });
          return true;
        }
      }
    }

    if (feed === 'binance') {
      const stream = data.stream as string | undefined;
      const d      = data.data  as Record<string, unknown> | undefined;
      if (!stream || !d) return false;
      if (stream.includes('@depth')) {
        const bids = (d.bids as [string,string][]) ?? (d.b as [string,string][]) ?? [];
        const asks = (d.asks as [string,string][]) ?? (d.a as [string,string][]) ?? [];
        w.postMessage({ type: 'orderbook', exchange: 'binance', bids, asks, levels: levelsRef.current });
        return true;
      }
      if (stream.includes('@trade')) {
        w.postMessage({ type: 'trades', exchange: 'binance', trade: d });
        return true;
      }
    }

    if (feed === 'okx') {
      const arg     = data.arg as Record<string, string> | undefined;
      const channel = arg?.channel ?? '';
      const action  = data.action  as string | undefined;
      const rawData = data.data    as Record<string, unknown>[] | undefined;
      if (!rawData?.length) return false;

      if (channel === 'books' || channel === 'books5') {
        const d = rawData[0] as { bids: [string,string,string,string][]; asks: [string,string,string,string][] };
        w.postMessage({
          type: 'orderbook', exchange: 'okx',
          action: action ?? 'update',
          bids: d.bids, asks: d.asks,
          levels: levelsRef.current,
        });
        return true;
      }
      if (channel === 'trades') {
        w.postMessage({ type: 'trades', exchange: 'okx', trades: rawData });
        return true;
      }
    }

    return false; // not an orderbook/trade message — don't route
  }, []);

  // ── Ticker RAF flush (stays on main thread — lightweight) ──────────────────
  const tickerDraftRef = useRef<Partial<ExchangeState> | null>(null);

  const flushTicker = useCallback(() => {
    rafRef.current = 0;
    if (!mountedRef.current || !tickerDraftRef.current) return;
    const draft = tickerDraftRef.current;
    tickerDraftRef.current = null;
    if (!draft.ticker) return;

    setState((prev) => {
      const next: ExchangeState = { ...prev };
      if (latencyEmaRef.current !== null) next.latencyMs = latencyEmaRef.current;
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
        next.ticker = draft.ticker!;
      }
      return next;
    });
  }, []);

  // ── Inline fallback flush (full — used when worker unavailable) ────────────
  const flushQueue = useCallback(() => {
    rafRef.current = 0;
    if (!mountedRef.current) return;
    const messages = queueRef.current.splice(0);
    if (messages.length === 0) return;

    const draft: Partial<ExchangeState> & { _newTrades?: Trade[] } = {};
    const feed = activeFeedRef.current;
    let dirty = false;

    for (const data of messages) {
      const msg = data as Record<string, unknown>;
      if (feed === 'bybit')    parseBybit(msg, draft);
      if (feed === 'binance')  parseBinance(msg, draft);
      if (feed === 'okx') parseOkx(msg, draft);

      const ts = (msg.ts as number) ||
        (msg.data && Array.isArray(msg.data) && (msg.data[0] as Record<string,number>)?.T) ||
        ((msg.data as Record<string,unknown>)?.T as number) || 0;
      if (ts > 1_000_000_000_000) computeLatency(ts);

      if (draft.trades) {
        draft._newTrades = [...(draft._newTrades ?? []), ...draft.trades];
        delete draft.trades;
        dirty = true;
      }
      if (draft.bids || draft.asks || draft.cvdPoints || draft.ticker) dirty = true;
    }

    if (!dirty) return;
    if (draft._newTrades) { draft.trades = draft._newTrades; delete draft._newTrades; }

    setState((prev) => {
      const next: ExchangeState = { ...prev };
      if (draft.bids)      next.bids = draft.bids;
      if (draft.asks)      next.asks = draft.asks;
      if (draft.cvdPoints) next.cvdPoints = draft.cvdPoints;
      if (latencyEmaRef.current !== null) next.latencyMs = latencyEmaRef.current;
      if ((draft.bids || draft.asks) && next.bids.length && next.asks.length) {
        next.isStale = false;
        saveSnapshot(activeFeedRef.current, symbolRef.current, next.bids, next.asks);
      }
      if (draft.trades) {
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
  }, [parseBybit, parseBinance, parseOkx, computeLatency]);

  // ── Generic WS connect ─────────────────────────────────────────────────────
  const connectWs = useCallback((
    feed: ExchangeId,
    url: string,
    subMsg: object,
    withPing: boolean,
  ) => {
    if (!mountedRef.current) return;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }

    // v67: set refs BEFORE callbacks — prevents race on rapid switch
    wsRef.current         = ws;
    activeFeedRef.current = feed;

    // v68: notify worker of new feed/reset
    if (workerReadyRef.current && workerRef.current) {
      workerRef.current.postMessage({ type: 'reset' });
      workerRef.current.postMessage({
        type: 'configure',
        levels: levelsRef.current,
        cvdWindow: profile.current.cvdWindow,
      });
    }

    ws.onopen = () => {
      // v67 guard
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
      // v67 guard
      if (!mountedRef.current || wsRef.current !== ws) return;
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (data.op === 'pong' || data.op === 'subscribe') return;

        // v68: latency from exchange timestamp
        const ts = (data.ts as number) ||
          (data.data && Array.isArray(data.data) && (data.data[0] as Record<string,number>)?.T) ||
          ((data.data as Record<string,unknown>)?.T as number) || 0;
        if (ts > 1_000_000_000_000) computeLatency(ts);

        // v68: try to route orderbook/trades to worker
        const routed = routeToWorker(data, activeFeedRef.current);

        if (!routed) {
          // Ticker + unhandled messages → inline RAF (stays main thread)
          // Also full inline fallback if worker unavailable
          if (workerReadyRef.current) {
            // Worker active — only handle ticker inline
            const feed = activeFeedRef.current;
            const tickerDraft: Partial<ExchangeState> = {};
            if (feed === 'bybit')    parseBybit(data, tickerDraft);
            if (feed === 'binance')  parseBinance(data, tickerDraft);
            if (feed === 'okx') parseOkx(data, tickerDraft);
            if (tickerDraft.ticker) {
              tickerDraftRef.current = tickerDraft;
              if (!rafRef.current) rafRef.current = requestAnimationFrame(flushTicker);
            }
          } else {
            // Full inline fallback
            queueRef.current.push(data);
            if (!rafRef.current) rafRef.current = requestAnimationFrame(flushQueue);
          }
        }
      } catch { /* malformed */ }
    };

    ws.onclose = () => {
      // v67 guard
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
  }, [flushQueue, flushTicker, setStatus, routeToWorker, parseBybit, parseBinance, parseOkx, computeLatency]);

  // ── Main connect ───────────────────────────────────────────────────────────
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // v67: cancel pending retry FIRST
    if (retryRef.current)    { clearTimeout(retryRef.current);    retryRef.current    = undefined; }
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    if (pingRef.current)     { clearInterval(pingRef.current);    pingRef.current     = undefined; }
    // v67: always cancel bybitTmrRef
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

    } else if (exch === 'okx') {
      const url    = getWsUrl('okx', sym);
      const subMsg = getSubscribeMsg('okx', sym);
      connectWs('okx', url, subMsg, false);
    }
  }, [connectWs, setStatus]);

  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current   = true;

    // v68: init Web Worker
    const worker = tryCreateWorker();
    if (worker) {
      workerRef.current      = worker;
      workerReadyRef.current = true;
      worker.onmessage       = handleWorkerMessage;
      worker.onerror         = () => {
        // Worker crashed — degrade to inline fallback silently
        workerReadyRef.current = false;
        workerRef.current      = null;
      };
      // Configure worker with device profile
      worker.postMessage({
        type:      'configure',
        levels:    effectiveLevels,
        cvdWindow: profile.current.cvdWindow,
      });
    }

    // Reset inline state
    bidsMap.current      = new Map();
    asksMap.current      = new Map();
    cvdRef.current       = 0;
    cvdBuf.current.clear();
    tradeId.current      = 0;
    prevPrice24h.current = 0;
    queueRef.current     = [];

    // v64: load snapshot cache
    const cached = loadSnapshot(exchange, symbol);
    if (cached) {
      setState({ ...EMPTY_STATE, activeFeed: exchange, bids: cached.bids, asks: cached.asks, isStale: true });
    } else {
      setState({ ...EMPTY_STATE, activeFeed: exchange });
    }

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
      if (retryRef.current)     clearTimeout(retryRef.current);
      if (pingRef.current)      clearInterval(pingRef.current);
      if (rafRef.current)       cancelAnimationFrame(rafRef.current);
      if (bybitTmrRef.current)  clearTimeout(bybitTmrRef.current);
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      // v68: terminate worker on unmount
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current      = null;
        workerReadyRef.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, symbol]);

  return state;
}
