/**
 * useTrades.ts — ZERØ ORDER BOOK v52
 *
 * FIX v52:
 *   CircularBuffer replaces cvdHistRef.shift() — O(1) push, zero array realloc.
 *   Device profile drives cvdWindow (50/200/500).
 *
 * rgba() only ✓ · mountedRef ✓ · zero mock data ✓
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Trade, ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';
import { CircularBuffer } from '@/utils/circularBuffer';
import { detectDeviceProfile } from '@/utils/deviceProfiler';

export interface CvdPoint {
  time: number;
  cvd:  number;
}

export function useTrades(symbol: string) {
  const [trades,    setTrades]    = useState<Trade[]>([]);
  const [cvdPoints, setCvdPoints] = useState<CvdPoint[]>([]);
  const [status,    setStatus]    = useState<ConnectionStatus>('disconnected');

  const mountedRef = useRef(true);
  const cvdRef     = useRef(0);
  const idRef      = useRef(0);

  // v52: CircularBuffer — window from device profile
  const profile    = useRef(detectDeviceProfile());
  const cvdBuf     = useRef(new CircularBuffer<CvdPoint>(profile.current.cvdWindow));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset CVD on symbol change
  useEffect(() => {
    cvdRef.current = 0;
    cvdBuf.current.clear();
    setTrades([]);
    setCvdPoints([]);
  }, [symbol]);

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
      cvdBuf.current.push({ time: t.time, cvd: cvdRef.current });
    }

    if (!mountedRef.current) return;

    setTrades((prev) => {
      return incoming.length >= 50
        ? incoming.slice(0, 50)
        : [...incoming, ...prev].slice(0, 50);
    });
    setCvdPoints(cvdBuf.current.toArray());
  }, []);

  const { retry } = useBybitWs({
    topics:         [`publicTrade.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { trades, cvdPoints, status, retry };
}
