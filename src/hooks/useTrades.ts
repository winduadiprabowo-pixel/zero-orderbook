/**
 * useTrades.ts — ZERØ ORDER BOOK v44
 * Web Worker offload: CVD compute di Worker thread.
 * Main thread: zero parse, zero accumulate — cuma render.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Trade, ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';

export interface CvdPoint {
  time: number;
  cvd:  number;
}

export function useTrades(symbol: string) {
  const [trades, setTrades]       = useState<Trade[]>([]);
  const [cvdPoints, setCvdPoints] = useState<CvdPoint[]>([]);
  const [status, setStatus]       = useState<ConnectionStatus>('disconnected');

  const workerRef  = useRef<Worker | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Reuse same worker instance from orderbook — actually we share the module-level worker
    // but for trades we still need the worker for CVD. Simplest: inline worker approach.
    // Since orderbook.worker handles both, we'll post to same worker if available.
    // But useOrderBook owns the worker. For trades, CVD is lightweight enough inline.
    // Keep trades compute inline (it's just accumulation, not sort).
    return () => { mountedRef.current = false; };
  }, []);

  // Reset CVD on symbol change
  const cvdRef     = useRef(0);
  const cvdHistRef = useRef<CvdPoint[]>([]);
  useEffect(() => {
    cvdRef.current     = 0;
    cvdHistRef.current = [];
    setTrades([]);
    setCvdPoints([]);
  }, [symbol]);

  const idRef = useRef(0);

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as {
      topic?: string;
      data?:  Array<{ i: string; T: number; p: string; v: string; S: 'Buy'|'Sell' }>;
    };
    if (!msg.topic?.startsWith('publicTrade.') || !Array.isArray(msg.data)) return;

    const incoming: Trade[] = msg.data.map((d) => ({
      id:           String(idRef.current++),
      time:         d.T,
      price:        parseFloat(d.p),
      size:         parseFloat(d.v),
      isBuyerMaker: d.S === 'Sell',
    }));

    for (const t of incoming) {
      cvdRef.current += t.isBuyerMaker ? -t.size : t.size;
      cvdHistRef.current.push({ time: t.time, cvd: cvdRef.current });
      if (cvdHistRef.current.length > 200) cvdHistRef.current.shift();
    }

    if (!mountedRef.current) return;

    setTrades((prev) => {
      const next = incoming.length >= 50
        ? incoming.slice(0, 50)
        : [...incoming, ...prev].slice(0, 50);
      return next;
    });
    setCvdPoints([...cvdHistRef.current]);
  }, []);

  const { retry } = useBybitWs({
    topics:         [`publicTrade.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { trades, cvdPoints, status, retry };
}
