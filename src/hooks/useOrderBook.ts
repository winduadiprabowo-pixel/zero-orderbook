/**
 * useOrderBook.ts — ZERØ ORDER BOOK v37
 * MIGRATION: Binance depth WS → Bybit orderbook WS
 *
 * Bybit kirim dua tipe event:
 *   type:"snapshot" → replace full book
 *   type:"delta"    → merge: size=0 berarti hapus level, size>0 berarti update
 *
 * PriceMap: Map<priceString, sizeNumber> — key tetap string biar exact match
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { OrderBookLevel, ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';

// ─── internal types ──────────────────────────────────────────────────────────

type PriceMap = Map<string, number>;

interface BybitOrderBookMsg {
  topic?: string;
  type?:  'snapshot' | 'delta';
  data?:  { b: [string, string][]; a: [string, string][] };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function applyDelta(map: PriceMap, updates: [string, string][]): void {
  for (const [price, size] of updates) {
    const s = parseFloat(size);
    if (s === 0) map.delete(price);
    else         map.set(price, s);
  }
}

function mapToLevels(map: PriceMap, isAsk: boolean, levels: number): OrderBookLevel[] {
  const sorted = Array.from(map.entries())
    .map(([p, s]) => ({ price: parseFloat(p), size: s, total: 0 }))
    .sort((a, b) => isAsk ? a.price - b.price : b.price - a.price)
    .slice(0, levels);
  let cum = 0;
  for (const lvl of sorted) { cum += lvl.size; lvl.total = cum; }
  return sorted;
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useOrderBook(symbol: string, levels = 20) {
  const [bids, setBids]             = useState<OrderBookLevel[]>([]);
  const [asks, setAsks]             = useState<OrderBookLevel[]>([]);
  const [status, setStatus]         = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState(0);

  const bidsMap    = useRef<PriceMap>(new Map());
  const asksMap    = useRef<PriceMap>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset maps on symbol change
  useEffect(() => {
    bidsMap.current = new Map();
    asksMap.current = new Map();
    setBids([]);
    setAsks([]);
    setLastUpdate(0);
  }, [symbol]);

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as BybitOrderBookMsg;
    if (!msg.topic?.startsWith('orderbook.') || !msg.data) return;

    if (msg.type === 'snapshot') {
      // Full replace
      bidsMap.current = new Map(msg.data.b.map(([p, s]) => [p, parseFloat(s)]));
      asksMap.current = new Map(msg.data.a.map(([p, s]) => [p, parseFloat(s)]));
    } else if (msg.type === 'delta') {
      // Incremental merge
      applyDelta(bidsMap.current, msg.data.b);
      applyDelta(asksMap.current, msg.data.a);
    } else {
      return;
    }

    if (!mountedRef.current) return;
    setBids(mapToLevels(bidsMap.current, false, levels));
    setAsks(mapToLevels(asksMap.current, true,  levels));
    setLastUpdate(Date.now());
  }, [levels]);

  // Bybit depth 50 — cukup untuk tampilkan 20 levels di UI
  const { retry } = useBybitWs({
    topics:         [`orderbook.50.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { bids, asks, status, lastUpdate, retry };
}
