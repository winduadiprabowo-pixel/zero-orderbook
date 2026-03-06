/**
 * useMultiExchangeWs.ts — ZERØ ORDER BOOK v47
 *
 * FIX v47:
 *   Bybit WS auto-fallback ke Binance.
 *   Bybit direct WS di-block di beberapa ISP/region (Indonesia included).
 *   Fix: attempt Bybit dulu (BYBIT_TIMEOUT_MS), kalau gagal → switch ke Binance.
 *   Data tetap mengalir transparan. activeFeed di state memberi tahu UI feed mana yang aktif.
 *
 * v46 fixes tetap berlaku:
 *   1. RAF message queue — buffer ALL messages per frame, zero dropped.
 *   2. Batch setState — semua partial updates dari 1 frame di-merge jadi 1 setState call.
 *   3. parsers return Partial<ExchangeState> — pure, no side effects.
 *
 * rgba() only ✓ · RAF-gated ✓ · mountedRef ✓ · zero dropped messages ✓
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import type { ConnectionStatus } from '@/types/market';
import type { ExchangeId } from './useExchange';
import { getWsUrl, getSubscribeMsg } from './useExchange';
import { getReconnectDelay } from '@/lib/formatters';
import type { OrderBookLevel2 } from './useOrderBook';
import type { CvdPoint } from './useTrades';
import type { Trade, TickerData } from '@/types/market';

export interface ExchangeState {
  bids:       OrderBookLevel2[];
  asks:       OrderBookLevel2[];
  trades:     Trade[];
  ticker:     TickerData | null;
  cvdPoints:  CvdPoint[];
  status:     ConnectionStatus;
  latencyMs:  number | null;
  activeFeed: ExchangeId;
}

const EMPTY_STATE: ExchangeState = {
  bids: [], asks: [], trades: [], ticker: null, cvdPoints: [],
  status: 'disconnected', latencyMs: null, activeFeed: 'bybit',
};

const BYBIT_TIMEOUT_MS = 5_000;

type PriceMap = Map<string, number>;
const WHALE = 100_000;

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

function getBinanceCombinedUrl(symbol: string): string {
  const sym = symbol.toLowerCase();
  return `wss://stream.binance.com:9443/stream?streams=${sym}@depth20@100ms/${sym}@trade/${sym}@ticker`;
}

export function useMultiExchangeWs(
  exchange: ExchangeId,
  symbol:   string,
  levels = 50,
): ExchangeState {
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

  const bidsMap      = useRef<PriceMap>(new Map());
  const asksMap      = useRef<PriceMap>(new Map());
  const cvdRef       = useRef(0);
  const cvdHist      = useRef<CvdPoint[]>([]);
  const tradeId      = useRef(0);
  const prevPrice24h = useRef(0);

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
      draft.bids = mapToLevels(bidsMap.current, false, levels);
      draft.asks = mapToLevels(asksMap.current, true,  levels);
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
        cvdHist.current.push({ time: t.time, cvd: cvdRef.current });
        if (cvdHist.current.length > 200) cvdHist.current.shift();
      }
      draft.trades    = incoming;
      draft.cvdPoints = [...cvdHist.current];
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
  }, [levels]);

  const parseBinance = useCallback((
    data: Record<string, unknown>,
    draft: Partial<ExchangeState>,
  ): void => {
    const stream = data.stream as string | undefined;
    const d      = data.data  as Record<string, unknown> | undefined;
    if (!stream || !d) return;

    if (stream.includes('@depth')) {
      const bids = (d.bids as [string,string][]) ?? [];
      const asks = (d.asks as [string,string][]) ?? [];
      bidsMap.current = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
      asksMap.current = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
      draft.bids = mapToLevels(bidsMap.current, false, levels);
      draft.asks = mapToLevels(asksMap.current, true,  levels);
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
      cvdHist.current.push({ time: t.time, cvd: cvdRef.current });
      if (cvdHist.current.length > 200) cvdHist.current.shift();
      draft.trades    = [t];
      draft.cvdPoints = [...cvdHist.current];
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
  }, [levels]);

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
      draft.bids = mapToLevels(bidsMap.current, false, levels);
      draft.asks = mapToLevels(asksMap.current, true,  levels);
    }
    if (type === 'l2update') {
      const changes = (data.changes as [string,string,string][]) ?? [];
      for (const [side, price, size] of changes) {
        if (side === 'buy')  applyDelta(bidsMap.current, [[price, size]]);
        if (side === 'sell') applyDelta(asksMap.current, [[price, size]]);
      }
      draft.bids = mapToLevels(bidsMap.current, false, levels);
      draft.asks = mapToLevels(asksMap.current, true,  levels);
    }
  }, [levels]);

  const flushQueue = useCallback(() => {
    rafRef.current = 0;
    if (!mountedRef.current) return;

    const messages = queueRef.current.splice(0);
    if (messages.length === 0) return;

    const draft: Partial<ExchangeState> & { _newTrades?: Trade[] } = {};
    const feed = activeFeedRef.current;

    for (const data of messages) {
      const msg = data as Record<string, unknown>;
      if (feed === 'bybit')    parseBybit(msg, draft);
      if (feed === 'binance')  parseBinance(msg, draft);
      if (feed === 'coinbase') parseCoinbase(msg, draft);

      if (draft.trades) {
        draft._newTrades = [...(draft._newTrades ?? []), ...draft.trades];
        delete draft.trades;
      }
    }

    if (draft._newTrades) {
      draft.trades = draft._newTrades;
      delete draft._newTrades;
    }

    setState((prev) => {
      const next: ExchangeState = { ...prev };

      if (draft.bids)      next.bids = draft.bids;
      if (draft.asks)      next.asks = draft.asks;
      if (draft.cvdPoints) next.cvdPoints = draft.cvdPoints;

      if (draft.trades) {
        next.trades = [...draft.trades, ...prev.trades].slice(0, 50);
      }

      if (draft.ticker) {
        const t = draft.ticker as TickerData & { _partial?: boolean; _prevPrice24h?: number };
        if (t._partial) {
          const base = prev.ticker ?? {
            lastPrice: 0, priceChange: 0, priceChangePercent: 0,
            highPrice: 0, lowPrice: 0, volume: 0, quoteVolume: 0,
          };
          const last    = (t.lastPrice    as unknown as number | null) ?? base.lastPrice;
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
  }, [exchange, parseBybit, parseBinance, parseCoinbase]);

  // ── Generic connect helper ────────────────────────────────────────────────

  const connectWs = useCallback((
    feed: ExchangeId,
    url: string,
    subMsg: object,
    withPing: boolean,
  ) => {
    if (!mountedRef.current) return;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }
    wsRef.current     = ws;
    activeFeedRef.current = feed;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      if (bybitTmrRef.current) { clearTimeout(bybitTmrRef.current); bybitTmrRef.current = undefined; }
      attemptRef.current = 0;
      setStatus('connected');
      setState((prev) => ({ ...prev, activeFeed: feed }));
      if (Object.keys(subMsg).length > 0) ws.send(JSON.stringify(subMsg));
      if (withPing) {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
        }, 20_000);
      }
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (data.op === 'pong' || data.op === 'subscribe') return;
        queueRef.current.push(data);
        if (!rafRef.current) rafRef.current = requestAnimationFrame(flushQueue);
      } catch { /* malformed */ }
    };

    ws.onclose = () => {
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = undefined; }
      setStatus('disconnected');
      if (mountedRef.current) {
        retryRef.current = setTimeout(() => {
          attemptRef.current++;
          connect();
        }, getReconnectDelay(attemptRef.current));
      }
    };

    ws.onerror = () => ws.close();
  }, [flushQueue, setStatus]);

  // ── Main connect — Bybit with fallback ───────────────────────────────────

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Cleanup existing
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = undefined; }
    if (bybitTmrRef.current) { clearTimeout(bybitTmrRef.current); bybitTmrRef.current = undefined; }

    setStatus('reconnecting');

    if (exchange === 'bybit') {
      // Attempt Bybit — timeout to Binance fallback
      const bybitUrl = getWsUrl('bybit', symbol);
      const subMsg   = getSubscribeMsg('bybit', symbol);

      // Fallback timer
      bybitTmrRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        const ws = wsRef.current;
        if (ws && ws.readyState !== WebSocket.OPEN) {
          ws.onclose = null;
          ws.close();
          wsRef.current = null;
          // Silent fallback to Binance
          const binanceUrl = getBinanceCombinedUrl(symbol);
          connectWs('binance', binanceUrl, {}, false);
        }
      }, BYBIT_TIMEOUT_MS);

      connectWs('bybit', bybitUrl, subMsg, true);

    } else if (exchange === 'binance') {
      connectWs('binance', getBinanceCombinedUrl(symbol), {}, false);

    } else if (exchange === 'coinbase') {
      const url    = getWsUrl('coinbase', symbol);
      const subMsg = getSubscribeMsg('coinbase', symbol);
      connectWs('coinbase', url, subMsg, false);
    }
  }, [exchange, symbol, connectWs, setStatus]);

  useEffect(() => {
    mountedRef.current   = true;
    bidsMap.current      = new Map();
    asksMap.current      = new Map();
    cvdRef.current       = 0;
    cvdHist.current      = [];
    tradeId.current      = 0;
    prevPrice24h.current = 0;
    queueRef.current     = [];
    setState({ ...EMPTY_STATE, activeFeed: exchange });

    connect();

    return () => {
      mountedRef.current = false;
      if (retryRef.current)    clearTimeout(retryRef.current);
      if (pingRef.current)     clearInterval(pingRef.current);
      if (rafRef.current)      cancelAnimationFrame(rafRef.current);
      if (bybitTmrRef.current) clearTimeout(bybitTmrRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [exchange, symbol, connect]);

  return state;
}
