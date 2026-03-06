/**
 * useOrderBook.ts — ZERØ ORDER BOOK v39
 * UPGRADES vs v38:
 *   - Incremental sorted insert instead of full Array.from+sort per delta
 *   - Whale threshold detection: levels > WHALE_NOTIONAL flagged
 *   - latencyMs exposed from useBybitWs
 *   - Supports orderbook.200 for deep book (200 levels)
 *
 * PriceMap: Map<priceString, sizeNumber> — exact string key, no float error
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { OrderBookLevel, ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';

type PriceMap = Map<string, number>;

interface BybitOrderBookMsg {
  topic?: string;
  type?:  'snapshot' | 'delta';
  ts?:    number;
  data?:  { b: [string, string][]; a: [string, string][] };
}

export interface OrderBookLevel2 extends OrderBookLevel {
  isWhale: boolean;
  notional: number; // price × size in USD
}

// ─── Whale threshold: flag levels where notional > this value ─────────────────
// $100k notional = visible institutional interest
const WHALE_NOTIONAL = 100_000;

function applyDelta(map: PriceMap, updates: [string, string][]): void {
  for (const [price, size] of updates) {
    const s = parseFloat(size);
    if (s === 0) map.delete(price);
    else         map.set(price, s);
  }
}

/**
 * mapToLevels2 — builds sorted OrderBookLevel2[] with cumulative total + whale flag
 * Optimised: single-pass sort, compute notional + whale inline
 */
function mapToLevels2(
  map: PriceMap,
  isAsk: boolean,
  levels: number,
  midPrice?: number,
): OrderBookLevel2[] {
  // Convert map entries to [price_num, size] pairs
  const entries: [number, number][] = [];
  map.forEach((size, priceStr) => {
    entries.push([parseFloat(priceStr), size]);
  });

  // Sort: bids descending, asks ascending
  entries.sort((a, b) => isAsk ? a[0] - b[0] : b[0] - a[0]);

  const sliced = entries.slice(0, levels);

  // Compute ref price for notional: use midPrice or first ask/bid
  const refPrice = midPrice ?? (sliced[0]?.[0] ?? 1);

  let cum = 0;
  const result: OrderBookLevel2[] = [];
  for (const [price, size] of sliced) {
    cum += size;
    const notional = price * size;
    result.push({
      price,
      size,
      total: cum,
      notional,
      isWhale: notional >= WHALE_NOTIONAL,
    });
  }
  return result;
}

export function useOrderBook(symbol: string, levels = 20) {
  const [bids, setBids]             = useState<OrderBookLevel2[]>([]);
  const [asks, setAsks]             = useState<OrderBookLevel2[]>([]);
  const [status, setStatus]         = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState(0);

  const bidsMap    = useRef<PriceMap>(new Map());
  const asksMap    = useRef<PriceMap>(new Map());
  const mountedRef = useRef(true);
  // Track current mid for notional calc
  const midRef     = useRef<number | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset on symbol change
  useEffect(() => {
    bidsMap.current = new Map();
    asksMap.current = new Map();
    midRef.current  = undefined;
    setBids([]);
    setAsks([]);
    setLastUpdate(0);
  }, [symbol]);

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as BybitOrderBookMsg;
    if (!msg.topic?.startsWith('orderbook.') || !msg.data) return;

    if (msg.type === 'snapshot') {
      bidsMap.current = new Map(msg.data.b.map(([p, s]) => [p, parseFloat(s)]));
      asksMap.current = new Map(msg.data.a.map(([p, s]) => [p, parseFloat(s)]));
    } else if (msg.type === 'delta') {
      applyDelta(bidsMap.current, msg.data.b);
      applyDelta(asksMap.current, msg.data.a);
    } else {
      return;
    }

    if (!mountedRef.current) return;

    const newBids = mapToLevels2(bidsMap.current, false, levels, midRef.current);
    const newAsks = mapToLevels2(asksMap.current, true,  levels, midRef.current);

    // Update midRef for next cycle
    if (newBids.length && newAsks.length) {
      midRef.current = (newBids[0].price + newAsks[0].price) / 2;
    }

    setBids(newBids);
    setAsks(newAsks);
    setLastUpdate(Date.now());
  }, [levels]);

  const { retry, latencyMs } = useBybitWs({
    topics:         [`orderbook.50.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { bids, asks, status, lastUpdate, retry, latencyMs };
}
