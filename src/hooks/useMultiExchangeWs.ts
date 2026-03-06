/**
 * useMultiExchangeWs.ts — ZERØ ORDER BOOK v45
 * Universal WS hook: Bybit / Binance / Coinbase → same normalised output.
 *
 * Handles per-exchange quirks:
 *   Bybit:   { op, args } subscribe, snapshot+delta orderbook
 *   Binance: combined stream URL, no subscribe needed, stream key in data
 *   Coinbase: { type: subscribe }, incremental l2update
 *
 * rgba() only ✓ · RAF-gated ✓ · mountedRef ✓
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import type { ConnectionStatus } from '@/types/market';
import type { ExchangeId } from './useExchange';
import { getWsUrl, getSubscribeMsg, toExchangeSymbol } from './useExchange';
import { getReconnectDelay } from '@/lib/formatters';
import type { OrderBookLevel2 } from './useOrderBook';
import type { CvdPoint } from './useTrades';
import type { Trade, TickerData } from '@/types/market';

// ── Normalised output ─────────────────────────────────────────────────────────

export interface ExchangeState {
  bids:       OrderBookLevel2[];
  asks:       OrderBookLevel2[];
  trades:     Trade[];
  ticker:     TickerData | null;
  cvdPoints:  CvdPoint[];
  status:     ConnectionStatus;
  latencyMs:  number | null;
}

const EMPTY_STATE: ExchangeState = {
  bids: [], asks: [], trades: [], ticker: null, cvdPoints: [], status: 'disconnected', latencyMs: null,
};

// ── PriceMap helpers (inline — no Worker for multi-exchange to keep it simple) ──

type PriceMap = Map<string, number>;
const WHALE = 100_000;

function applyDelta(map: PriceMap, updates: [string,string][]): void {
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMultiExchangeWs(
  exchange: ExchangeId,
  symbol:   string,
  levels = 50,
): ExchangeState {
  const [state, setState] = useState<ExchangeState>({ ...EMPTY_STATE });

  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const retryRef   = useRef<ReturnType<typeof setTimeout>>();
  const pingRef    = useRef<ReturnType<typeof setInterval>>();
  const rafRef     = useRef(0);

  // Per-symbol state (mutable refs — avoid closure stale issues)
  const bidsMap  = useRef<PriceMap>(new Map());
  const asksMap  = useRef<PriceMap>(new Map());
  const cvdRef   = useRef(0);
  const cvdHist  = useRef<CvdPoint[]>([]);
  const tradeId  = useRef(0);
  const prevPrice24h = useRef(0);

  const setStatus = useCallback((s: ConnectionStatus) => {
    setState((prev) => prev.status === s ? prev : { ...prev, status: s });
  }, []);

  // ── Message parsers ────────────────────────────────────────────────────────

  const parseBybit = useCallback((data: Record<string, unknown>) => {
    const topic = data.topic as string | undefined;
    if (!topic) return;

    // OrderBook
    if (topic.startsWith('orderbook.')) {
      const d = data.data as { b: [string,string][]; a: [string,string][] } | undefined;
      if (!d) return;
      if (data.type === 'snapshot') {
        bidsMap.current = new Map(d.b.map(([p,s]) => [p, parseFloat(s)]));
        asksMap.current = new Map(d.a.map(([p,s]) => [p, parseFloat(s)]));
      } else if (data.type === 'delta') {
        applyDelta(bidsMap.current, d.b);
        applyDelta(asksMap.current, d.a);
      }
      const bids = mapToLevels(bidsMap.current, false, levels);
      const asks = mapToLevels(asksMap.current, true, levels);
      setState((prev) => ({ ...prev, bids, asks }));
    }

    // Trades
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
      setState((prev) => ({
        ...prev,
        trades: [...incoming, ...prev.trades].slice(0, 50),
        cvdPoints: [...cvdHist.current],
      }));
    }

    // Ticker
    if (topic.startsWith('tickers.')) {
      const d = data.data as Record<string, string> | undefined;
      if (!d) return;
      if (d.prevPrice24h) prevPrice24h.current = parseFloat(d.prevPrice24h);
      setState((prev) => {
        const base   = prev.ticker ?? { lastPrice:0,priceChange:0,priceChangePercent:0,highPrice:0,lowPrice:0,volume:0,quoteVolume:0 };
        const last   = d.lastPrice ? parseFloat(d.lastPrice) : base.lastPrice;
        const prev24 = prevPrice24h.current;
        return {
          ...prev,
          ticker: {
            lastPrice:          last,
            priceChange:        prev24 > 0 ? last - prev24 : base.priceChange,
            priceChangePercent: d.price24hPcnt ? parseFloat(d.price24hPcnt) * 100 : base.priceChangePercent,
            highPrice:          d.highPrice24h ? parseFloat(d.highPrice24h) : base.highPrice,
            lowPrice:           d.lowPrice24h  ? parseFloat(d.lowPrice24h)  : base.lowPrice,
            volume:             d.volume24h    ? parseFloat(d.volume24h)    : base.volume,
            quoteVolume:        d.turnover24h  ? parseFloat(d.turnover24h)  : base.quoteVolume,
          },
        };
      });
    }
  }, [levels]);

  const parseBinance = useCallback((data: Record<string, unknown>) => {
    // Combined stream: { stream: "btcusdt@depth20@100ms", data: {...} }
    const stream = data.stream as string | undefined;
    const d      = data.data as Record<string, unknown> | undefined;
    if (!stream || !d) return;

    if (stream.includes('@depth')) {
      const bids = (d.bids as [string,string][]) ?? [];
      const asks = (d.asks as [string,string][]) ?? [];
      // depth20 = snapshot every time
      bidsMap.current = new Map(bids.map(([p,s]) => [p, parseFloat(s)]));
      asksMap.current = new Map(asks.map(([p,s]) => [p, parseFloat(s)]));
      setState((prev) => ({
        ...prev,
        bids: mapToLevels(bidsMap.current, false, levels),
        asks: mapToLevels(asksMap.current, true,  levels),
      }));
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
      setState((prev) => ({
        ...prev,
        trades: [t, ...prev.trades].slice(0, 50),
        cvdPoints: [...cvdHist.current],
      }));
    }

    if (stream.includes('@ticker')) {
      setState((prev) => ({
        ...prev,
        ticker: {
          lastPrice:          parseFloat(d.c as string),
          priceChange:        parseFloat(d.p as string),
          priceChangePercent: parseFloat(d.P as string),
          highPrice:          parseFloat(d.h as string),
          lowPrice:           d.l ? parseFloat(d.l as string) : 0,
          volume:             parseFloat(d.v as string),
          quoteVolume:        parseFloat(d.q as string),
        },
      }));
    }
  }, [levels]);

  const parseCoinbase = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string | undefined;
    if (type === 'snapshot') {
      const bids = (data.bids as [string,string][]) ?? [];
      const asks = (data.asks as [string,string][]) ?? [];
      bidsMap.current = new Map(bids.map(([p,s]) => [p, parseFloat(s)]));
      asksMap.current = new Map(asks.map(([p,s]) => [p, parseFloat(s)]));
      setState((prev) => ({
        ...prev,
        bids: mapToLevels(bidsMap.current, false, levels),
        asks: mapToLevels(asksMap.current, true,  levels),
      }));
    }
    if (type === 'l2update') {
      const changes = (data.changes as [string,string,string][]) ?? [];
      for (const [side, price, size] of changes) {
        if (side === 'buy')  applyDelta(bidsMap.current, [[price, size]]);
        if (side === 'sell') applyDelta(asksMap.current, [[price, size]]);
      }
      setState((prev) => ({
        ...prev,
        bids: mapToLevels(bidsMap.current, false, levels),
        asks: mapToLevels(asksMap.current, true,  levels),
      }));
    }
  }, [levels]);

  // ── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    setStatus('reconnecting');

    const sym = toExchangeSymbol(exchange, symbol);
    const url = getWsUrl(exchange, symbol);
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setStatus('connected');
      const sub = getSubscribeMsg(exchange, symbol);
      if (Object.keys(sub).length > 0) {
        ws.send(JSON.stringify(sub));
      }
      // Bybit ping
      if (exchange === 'bybit') {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
        }, 20_000);
      }
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (rafRef.current) return; // skip if already scheduled
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          if (!mountedRef.current) return;
          if (exchange === 'bybit')    parseBybit(data);
          if (exchange === 'binance')  parseBinance(data);
          if (exchange === 'coinbase') parseCoinbase(data);
        });
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
  }, [exchange, symbol, levels, parseBybit, parseBinance, parseCoinbase, setStatus]);

  // ── Mount / exchange+symbol change ────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    // Reset state
    bidsMap.current = new Map();
    asksMap.current = new Map();
    cvdRef.current  = 0;
    cvdHist.current = [];
    tradeId.current = 0;
    prevPrice24h.current = 0;
    setState({ ...EMPTY_STATE });

    connect();

    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (pingRef.current)  clearInterval(pingRef.current);
      if (rafRef.current)   cancelAnimationFrame(rafRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [exchange, symbol, connect]);

  return state;
}
