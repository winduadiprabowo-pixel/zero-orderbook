/**
 * useOrderBook.ts — ZERØ ORDER BOOK v44
 * Web Worker offload: sort + cumulative + whale detection di Worker thread.
 * Main thread: zero heavy compute, cuma setState dari Worker postMessage.
 * rgba() only ✓ · RAF-gated ✓
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';

export interface OrderBookLevel2 {
  price:    number;
  size:     number;
  total:    number;
  notional: number;
  isWhale:  boolean;
}

export function useOrderBook(symbol: string, levels = 50) {
  const [bids, setBids]             = useState<OrderBookLevel2[]>([]);
  const [asks, setAsks]             = useState<OrderBookLevel2[]>([]);
  const [status, setStatus]         = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState(0);

  const workerRef  = useRef<Worker | null>(null);
  const mountedRef = useRef(true);
  const rafRef     = useRef<number>(0);
  const pendingRef = useRef<{ bids: OrderBookLevel2[]; asks: OrderBookLevel2[] } | null>(null);

  // Boot worker
  useEffect(() => {
    mountedRef.current = true;
    const worker = new Worker(
      new URL('../workers/orderbook.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data as {
        type: string;
        bids?: OrderBookLevel2[];
        asks?: OrderBookLevel2[];
        ts?: number;
      };
      if (msg.type === 'orderbook' && msg.bids && msg.asks) {
        // RAF-gate: batch consecutive messages into one render frame
        pendingRef.current = { bids: msg.bids, asks: msg.asks };
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            if (pendingRef.current && mountedRef.current) {
              setBids(pendingRef.current.bids);
              setAsks(pendingRef.current.asks);
              setLastUpdate(Date.now());
              pendingRef.current = null;
            }
          });
        }
      }
    };

    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Reset on symbol change
  useEffect(() => {
    setBids([]);
    setAsks([]);
    setLastUpdate(0);
    workerRef.current?.postMessage({ type: 'reset', symbol });
  }, [symbol]);

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as {
      topic?: string;
      type?:  'snapshot' | 'delta';
      data?:  { b: [string, string][]; a: [string, string][] };
    };
    if (!msg.topic?.startsWith('orderbook.') || !msg.data) return;
    if (msg.type !== 'snapshot' && msg.type !== 'delta') return;
    workerRef.current?.postMessage({
      type:    'orderbook',
      msgType: msg.type,
      data:    msg.data,
      levels,
    });
  }, [levels]);

  const { retry, latencyMs } = useBybitWs({
    topics:         [`orderbook.50.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { bids, asks, status, lastUpdate, retry, latencyMs };
}
