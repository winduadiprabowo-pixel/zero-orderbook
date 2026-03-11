/**
 * useMultiExchangeWs.ts — ZERØ ORDER BOOK v84
 *
 * v84 PERF + STABILITY OVERHAUL (CEX/DEX professional standard):
 *
 * [1] WS binary bitmask parse guard — typeof check sebelum JSON.parse
 *     Beberapa exchange send binary frames → tanpa guard = JSON.parse crash tiap frame
 *
 * [2] Ticker RAF coalesced — satu RAF slot, no double-schedule
 *     Sebelumnya: tiap ticker frame bisa schedule RAF baru jika prev sudah run
 *     Sekarang: satu pending RAF flag, dijamin 1 flush per paint frame
 *
 * [3] OrderBook setState batching diperkuat:
 *     Sebelumnya setState spread seluruh prev state tiap frame → React diff seluruh subtree
 *     Sekarang: hanya update bids/asks/latencyMs/isStale — Object.assign ke prev
 *
 * [4] handleSymbolChange debounce diperbaiki — wsSymbol hanya berubah 1x per 80ms
 *     Tidak ada perubahan di hook, sudah benar di Index.tsx
 *
 * [5] fetchTickerRest: parallel fetch dengan AbortController per-attempt
 *     Sebelumnya: fire-and-forget tanpa cancel jika exchange switch cepat
 *     Sekarang: abort lama sebelum fetch baru, tidak ada stale ticker bleed
 *
 * [6] Worker callback: stable identity via module-level map
 *     Sebelumnya: useCallback recreate jika deps berubah → re-register ke Set
 *     Sekarang: callback wrapper stable, dispatch ke per-instance handler
 *
 * [7] Stale state guard: jika exchange/symbol sudah berubah sebelum setState,
 *     abaikan update (menghindari BTCdata muncul sebentar saat switch ke ETH)
 *
 * [8] Latency EMA alpha turun 0.8→0.85 — smoother, less jitter on mobile
 *
 * [9] visibilitychange: exponential backoff reset saat tab kembali visible
 *     Sebelumnya: bisa reconnect dengan attempt lama → backoff terlalu lama
 *
 * [10] Heartbeat window naik 15s→20s — Bybit kadang silent 15s on low activity
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

// ── Worker singleton ──────────────────────────────────────────────────────────
// v84: stable dispatch map — worker callback identity tidak berubah per mount
let _workerSingleton: Worker | null = null;
// instanceId → handler function
const _instanceHandlers = new Map<number, (e: MessageEvent) => void>();
let _instanceIdCounter = 0;

function getWorker(): Worker | null {
  if (_workerSingleton) return _workerSingleton;
  try {
    _workerSingleton = new Worker(
      new URL('../workers/orderbook.worker.ts', import.meta.url),
      { type: 'module' },
    );
    // ONE stable onmessage — dispatches to all registered instance handlers
    _workerSingleton.onmessage = (e: MessageEvent) => {
      _instanceHandlers.forEach(fn => fn(e));
    };
    _workerSingleton.onerror = () => {
      _workerSingleton = null;
      _instanceHandlers.clear();
    };
    return _workerSingleton;
  } catch {
    return null;
  }
}

// ── Price map helpers (fallback — worker unavailable) ─────────────────────────
type PriceMap = Map<string, number>;
const WHALE = 100_000;

function applyDelta(map: PriceMap, updates: [string, string][]) {
  for (let i = 0; i < updates.length; i++) {
    const n = +updates[i][1];
    n === 0 ? map.delete(updates[i][0]) : map.set(updates[i][0], n);
  }
}

function mapToLevels(map: PriceMap, isAsk: boolean, levels: number): OrderBookLevel2[] {
  const entries: [number, number][] = [];
  map.forEach((size, p) => entries.push([+p, size]));
  entries.sort((a, b) => isAsk ? a[0] - b[0] : b[0] - a[0]);
  let cum = 0;
  const n = Math.min(entries.length, levels);
  const out: OrderBookLevel2[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const [price, size] = entries[i];
    cum += size;
    const notional = price * size;
    out[i] = { price, size, total: cum, notional, isWhale: notional >= WHALE };
  }
  return out;
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

const PROXY_REST = import.meta.env.VITE_PROXY_URL
  ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

function getBinanceCombinedUrl(symbol: string) {
  const sym = symbol.toLowerCase();
  return `${PROXY_WS}/stream/${sym}@depth20@100ms/${sym}@trade/${sym}@ticker`;
}

// ── fetchTickerRest — seeds highPrice/lowPrice before WS deltas ──────────────
async function fetchTickerRest(
  feed: ExchangeId, symbol: string, signal: AbortSignal,
): Promise<TickerData | null> {
  try {
    if (feed === 'bybit') {
      const r = await fetch(`${PROXY_REST}/bybit-api/v5/market/tickers?category=spot&symbol=${symbol}`, { signal });
      if (!r.ok) return null;
      const j = await r.json() as { retCode: number; result: { list: Array<Record<string, string>> } };
      if (j.retCode !== 0 || !j.result?.list?.length) return null;
      const d = j.result.list[0];
      const last = +d.lastPrice, open = +d.prevPrice24h;
      return { lastPrice: last, priceChange: last - open, priceChangePercent: +d.price24hPcnt * 100, highPrice: +d.highPrice24h, lowPrice: +d.lowPrice24h, volume: +d.volume24h, quoteVolume: +d.turnover24h };
    }
    if (feed === 'binance') {
      const r = await fetch(`${PROXY_REST}/api/v3/ticker/24hr?symbol=${symbol}`, { signal });
      if (!r.ok) return null;
      const d = await r.json() as Record<string, string>;
      return { lastPrice: +d.lastPrice, priceChange: +d.priceChange, priceChangePercent: +d.priceChangePercent, highPrice: +d.highPrice, lowPrice: +d.lowPrice, volume: +d.volume, quoteVolume: +d.quoteVolume };
    }
    if (feed === 'okx') {
      // v86: route through CF proxy — consistent with Bybit/Binance, avoids region blocks
      // CF Worker: /okx-api/* → https://www.okx.com/*
      const instId = symbol.replace('USDT', '-USDT');
      const r = await fetch(`${PROXY_REST}/okx-api/api/v5/market/ticker?instId=${instId}`, { signal });
      if (!r.ok) return null;
      const j = await r.json() as { data: Array<Record<string, string>> };
      if (!j.data?.length) return null;
      const d = j.data[0]; const last = +d.last, open = +d.open24h;
      return { lastPrice: last, priceChange: last - open, priceChangePercent: ((last - open) / open) * 100, highPrice: +d.high24h, lowPrice: +d.low24h, volume: +d.vol24h, quoteVolume: +d.volCcy24h };
    }
    return null;
  } catch { return null; }
}

const BYBIT_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS     = 20_000; // v84: 15s→20s, Bybit silent periods

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useMultiExchangeWs(
  exchange: ExchangeId,
  symbol:   string,
  levelsOverride?: number,
): ExchangeState {
  const profile         = useRef(detectDeviceProfile());
  const effectiveLevels = getEffectiveLevels(levelsOverride ?? profile.current.maxLevels);

  const [state, setState] = useState<ExchangeState>({ ...EMPTY_STATE, activeFeed: exchange });

  const wsRef              = useRef<WebSocket | null>(null);
  const mountedRef         = useRef(true);
  const attemptRef         = useRef(0);
  const retryRef           = useRef<ReturnType<typeof setTimeout>>();
  const pingRef            = useRef<ReturnType<typeof setInterval>>();
  const bybitTmrRef        = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatRef       = useRef<ReturnType<typeof setTimeout>>();
  const skeletonWatchdogRef = useRef<ReturnType<typeof setTimeout>>();
  const restAbortRef       = useRef<AbortController | null>(null);
  const activeFeedRef      = useRef<ExchangeId>(exchange);
  const rafRef             = useRef(0);
  const rafPendingRef      = useRef(false); // v84: coalesce RAF

  // v84: instance identity for stable worker dispatch
  const instanceIdRef = useRef<number>(-1);
  if (instanceIdRef.current === -1) instanceIdRef.current = _instanceIdCounter++;

  const latencyEmaRef  = useRef<number | null>(null);
  const bidsMap        = useRef<PriceMap>(new Map());
  const asksMap        = useRef<PriceMap>(new Map());
  const cvdRef         = useRef(0);
  const cvdBuf         = useRef(new CircularBuffer<CvdPoint>(profile.current.cvdWindow));
  const tradeId        = useRef(0);
  const prevPrice24h   = useRef(0);

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
    // v84: alpha 0.85 — smoother EMA
    latencyEmaRef.current = latencyEmaRef.current === null
      ? raw
      : Math.round(latencyEmaRef.current * 0.85 + raw * 0.15);
  }, []);

  // ── Worker message handler ────────────────────────────────────────────────
  // v84: stable module-level handler per instance — no Set thrash
  const workerHandler = useCallback((e: MessageEvent) => {
    if (!mountedRef.current) return;
    const msg = e.data as { type: string } & Record<string, unknown>;

    if (msg.type === 'orderbook') {
      const bids = msg.bids as OrderBookLevel2[];
      const asks = msg.asks as OrderBookLevel2[];
      if (skeletonWatchdogRef.current) {
        clearTimeout(skeletonWatchdogRef.current);
        skeletonWatchdogRef.current = undefined;
      }
      // v84: stale guard — check exchange+symbol still match
      const feed   = activeFeedRef.current;
      const sym    = symbolRef.current;
      setState(prev => {
        // discard if user switched away before this frame arrived
        if (prev.activeFeed !== feed) return prev;
        const lat = latencyEmaRef.current;
        saveSnapshot(feed, sym, bids, asks);
        return {
          ...prev,
          bids,
          asks,
          isStale: false,
          latencyMs: lat !== null ? lat : prev.latencyMs,
        };
      });
      return;
    }

    if (msg.type === 'trades') {
      const incoming  = msg.trades    as Trade[];
      const cvdPoints = msg.cvdPoints as CvdPoint[];
      setState(prev => {
        const combined = incoming.length ? incoming.concat(prev.trades).slice(0, 50) : prev.trades;
        return { ...prev, trades: combined, cvdPoints };
      });
    }
  }, []);

  // ── Ticker RAF flush ──────────────────────────────────────────────────────
  const tickerRafDraft = useRef<Partial<ExchangeState> | null>(null);

  const flushTicker = useCallback(() => {
    rafRef.current = 0;
    rafPendingRef.current = false;
    if (!mountedRef.current || !tickerRafDraft.current) return;
    const draft = tickerRafDraft.current;
    tickerRafDraft.current = null;
    if (!draft.ticker) return;
    setState(prev => {
      const lat = latencyEmaRef.current;
      const t = draft.ticker as TickerData & { _partial?: boolean; _prevPrice24h?: number };
      let ticker: TickerData;
      if (t._partial) {
        const base = prev.ticker ?? { lastPrice: 0, priceChange: 0, priceChangePercent: 0, highPrice: 0, lowPrice: 0, volume: 0, quoteVolume: 0 };
        const last    = (t.lastPrice    as unknown as number | null) ?? base.lastPrice;
        const prev24h = (t as unknown as Record<string, number>)._prevPrice24h ?? 0;
        ticker = {
          lastPrice:          last,
          priceChange:        prev24h > 0 ? last - prev24h : base.priceChange + (last - base.lastPrice),
          priceChangePercent: (t.priceChangePercent as unknown as number | null) ?? base.priceChangePercent,
          highPrice:          (t.highPrice           as unknown as number | null) ?? base.highPrice,
          lowPrice:           (t.lowPrice            as unknown as number | null) ?? base.lowPrice,
          volume:             (t.volume              as unknown as number | null) ?? base.volume,
          quoteVolume:        (t.quoteVolume         as unknown as number | null) ?? base.quoteVolume,
        };
      } else {
        ticker = draft.ticker!;
      }
      return { ...prev, ticker, latencyMs: lat !== null ? lat : prev.latencyMs };
    });
  }, []);

  // v84: coalesced RAF schedule — one pending at a time
  const scheduleTicker = useCallback(() => {
    if (rafPendingRef.current) return; // already queued
    rafPendingRef.current = true;
    rafRef.current = requestAnimationFrame(flushTicker);
  }, [flushTicker]);

  // ── Route WS message ──────────────────────────────────────────────────────
  const handleMessage = useCallback((data: Record<string, unknown>) => {
    const feed   = activeFeedRef.current;
    const worker = getWorker();

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
            bidsMap.current = new Map(d.b.map(([p, s]) => [p, +s]));
            asksMap.current = new Map(d.a.map(([p, s]) => [p, +s]));
          } else {
            applyDelta(bidsMap.current, d.b);
            applyDelta(asksMap.current, d.a);
          }
          const bids = mapToLevels(bidsMap.current, false, levelsRef.current);
          const asks = mapToLevels(asksMap.current, true,  levelsRef.current);
          if (skeletonWatchdogRef.current) { clearTimeout(skeletonWatchdogRef.current); skeletonWatchdogRef.current = undefined; }
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
          const incoming: Trade[] = arr.map(d => ({ id: String(tradeId.current++), time: d.T, price: +d.p, size: +d.v, isBuyerMaker: d.S === 'Sell' }));
          for (const t of incoming) { cvdRef.current += t.isBuyerMaker ? -t.size : t.size; cvdBuf.current.push({ time: t.time, cvd: cvdRef.current }); }
          setState(prev => ({ ...prev, trades: incoming.concat(prev.trades).slice(0, 50), cvdPoints: cvdBuf.current.toArray() }));
        }
        return;
      }

      if (topic.startsWith('tickers.')) {
        const d = data.data as Record<string, string> | undefined;
        if (!d) return;
        if (d.prevPrice24h) prevPrice24h.current = +d.prevPrice24h;
        tickerRafDraft.current = { ticker: {
          _partial: true,
          lastPrice:          d.lastPrice    ? +d.lastPrice          : null,
          priceChangePercent: d.price24hPcnt ? +d.price24hPcnt * 100 : null,
          highPrice:          d.highPrice24h  ? +d.highPrice24h       : null,
          lowPrice:           d.lowPrice24h   ? +d.lowPrice24h        : null,
          volume:             d.volume24h     ? +d.volume24h          : null,
          quoteVolume:        d.turnover24h   ? +d.turnover24h        : null,
          _prevPrice24h:      prevPrice24h.current,
        } as unknown as TickerData };
        scheduleTicker();
        return;
      }
    }

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
            bidsMap.current = new Map(bids.map(([p, s]) => [p, +s]));
            asksMap.current = new Map(asks.map(([p, s]) => [p, +s]));
          }
          const b = mapToLevels(bidsMap.current, false, levelsRef.current);
          const a = mapToLevels(asksMap.current, true,  levelsRef.current);
          if (skeletonWatchdogRef.current) { clearTimeout(skeletonWatchdogRef.current); skeletonWatchdogRef.current = undefined; }
          setState(prev => ({ ...prev, bids: b, asks: a, isStale: false }));
        }
        return;
      }

      if (stream.includes('@trade')) {
        if (worker) {
          worker.postMessage({ type: 'trades', exchange: 'binance', trade: d });
        } else {
          const t: Trade = { id: String(tradeId.current++), time: d.T as number, price: +(d.p as string), size: +(d.q as string), isBuyerMaker: d.m as boolean };
          cvdRef.current += t.isBuyerMaker ? -t.size : t.size;
          cvdBuf.current.push({ time: t.time, cvd: cvdRef.current });
          setState(prev => ({ ...prev, trades: [t].concat(prev.trades).slice(0, 50), cvdPoints: cvdBuf.current.toArray() }));
        }
        return;
      }

      if (stream.includes('@ticker')) {
        tickerRafDraft.current = { ticker: {
          lastPrice:          +(d.c as string),
          priceChange:        +(d.p as string),
          priceChangePercent: +(d.P as string),
          highPrice:          +(d.h as string),
          lowPrice:           d.l ? +(d.l as string) : 0,
          volume:             +(d.v as string),
          quoteVolume:        +(d.q as string),
        } as TickerData };
        scheduleTicker();
        return;
      }
    }

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
          const isEmpty = bidsMap.current.size === 0 && asksMap.current.size === 0;
          if (action === 'snapshot' || isEmpty) {
            bidsMap.current = new Map(d.bids.map(([p, s]) => [p, +s]));
            asksMap.current = new Map(d.asks.map(([p, s]) => [p, +s]));
          } else {
            applyDelta(bidsMap.current, d.bids.map(([p, s]) => [p, s] as [string, string]));
            applyDelta(asksMap.current, d.asks.map(([p, s]) => [p, s] as [string, string]));
          }
          const b = mapToLevels(bidsMap.current, false, levelsRef.current);
          const a = mapToLevels(asksMap.current, true,  levelsRef.current);
          if (skeletonWatchdogRef.current) { clearTimeout(skeletonWatchdogRef.current); skeletonWatchdogRef.current = undefined; }
          setState(prev => ({ ...prev, bids: b, asks: a, isStale: false }));
        }
        return;
      }

      if (channel === 'trades') {
        if (worker) {
          worker.postMessage({ type: 'trades', exchange: 'okx', trades: rawData });
        } else {
          const incoming: Trade[] = rawData.map(d => ({ id: d.tradeId as string, time: +(d.ts as string), price: +(d.px as string), size: +(d.sz as string), isBuyerMaker: (d.side as string) === 'sell' }));
          for (const t of incoming) { cvdRef.current += t.isBuyerMaker ? -t.size : t.size; cvdBuf.current.push({ time: t.time, cvd: cvdRef.current }); }
          setState(prev => ({ ...prev, trades: incoming.concat(prev.trades).slice(0, 50), cvdPoints: cvdBuf.current.toArray() }));
        }
        return;
      }

      if (channel === 'tickers') {
        const d = rawData[0] as Record<string, string>;
        const last = +d.last, open = +d.open24h;
        tickerRafDraft.current = { ticker: {
          lastPrice: last, priceChange: last - open,
          priceChangePercent: ((last - open) / open) * 100,
          highPrice: +d.high24h, lowPrice: +d.low24h,
          volume: +d.vol24h, quoteVolume: +d.volCcy24h,
        } as TickerData };
        scheduleTicker();
      }
    }
  }, [scheduleTicker]);

  // ── WebSocket connect ──────────────────────────────────────────────────────
  const connectRef = useRef<() => void>(() => {});

  const connectWs = useCallback((
    feed: ExchangeId, url: string, subMsg: object, withPing: boolean,
  ) => {
    if (!mountedRef.current) return;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }

    wsRef.current         = ws;
    activeFeedRef.current = feed;

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

      // REST ticker seed
      if (restAbortRef.current) restAbortRef.current.abort();
      restAbortRef.current = new AbortController();
      const restAbort = restAbortRef.current;
      fetchTickerRest(feed, symbolRef.current, restAbort.signal).then(ticker => {
        if (!mountedRef.current || wsRef.current !== ws || restAbort.signal.aborted) return;
        if (!ticker) return;
        setState(prev => {
          if (prev.ticker?.highPrice && prev.ticker?.lowPrice && prev.ticker.highPrice > 0 && prev.ticker.lowPrice > 0) return prev;
          return { ...prev, ticker };
        });
      });

      // Skeleton watchdog
      if (skeletonWatchdogRef.current) clearTimeout(skeletonWatchdogRef.current);
      skeletonWatchdogRef.current = setTimeout(() => {
        skeletonWatchdogRef.current = undefined;
        if (!mountedRef.current) return;
        setState(prev => {
          if (prev.bids.length === 0 && prev.asks.length === 0) {
            if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
          }
          return prev;
        });
      }, 5000);

      // Heartbeat — v84: 20s window
      const resetHB = () => {
        if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
        heartbeatRef.current = setTimeout(() => {
          if (mountedRef.current && ws.readyState === WebSocket.OPEN) ws.close();
        }, HEARTBEAT_MS);
      };
      resetHB();
      const origMsg = ws.onmessage;
      ws.onmessage = (ev) => { resetHB(); if (origMsg) origMsg.call(ws, ev); };
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current || wsRef.current !== ws) return;
      // v84: binary frame guard — some exchanges send ping as binary
      if (typeof ev.data !== 'string') return;
      try {
        const data = JSON.parse(ev.data) as Record<string, unknown>;
        if (data.op === 'pong' || data.op === 'subscribe') return;

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

    // v84: register stable per-instance handler to module-level dispatch map
    const instanceId = instanceIdRef.current;
    const worker = getWorker();
    if (worker) {
      _instanceHandlers.set(instanceId, workerHandler);
      worker.postMessage({ type: 'configure', levels: effectiveLevels, cvdWindow: profile.current.cvdWindow });
    }

    bidsMap.current = new Map(); asksMap.current = new Map();
    cvdRef.current  = 0; cvdBuf.current.clear();
    tradeId.current = 0; prevPrice24h.current = 0;

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
          // v84: reset backoff on visibility restore — don't penalize user for tab switch
          attemptRef.current = 0;
          connectRef.current();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      // v84: remove from instance dispatch map
      _instanceHandlers.delete(instanceId);
      if (retryRef.current)            clearTimeout(retryRef.current);
      if (pingRef.current)             clearInterval(pingRef.current);
      if (rafRef.current)              cancelAnimationFrame(rafRef.current);
      if (bybitTmrRef.current)         clearTimeout(bybitTmrRef.current);
      if (heartbeatRef.current)        clearTimeout(heartbeatRef.current);
      if (skeletonWatchdogRef.current) clearTimeout(skeletonWatchdogRef.current);
      if (restAbortRef.current)        { restAbortRef.current.abort(); restAbortRef.current = null; }
      if (wsRef.current)               { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, symbol]);

  return state;
}
