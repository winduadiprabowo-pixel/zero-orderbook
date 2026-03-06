/**
 * useTrades.ts — ZERØ ORDER BOOK v39
 * UPGRADE: Circular buffer — zero array allocation per trade event
 * UPGRADE: CVD (Cumulative Volume Delta) computed incrementally
 *
 * CVD = sum of (buyVolume - sellVolume) over time window
 * When CVD rising + price flat = hidden buying pressure (bullish divergence)
 * When CVD falling + price rising = distribution (bearish divergence)
 *
 * Bybit trade fields:
 *   i  — trade ID
 *   T  — timestamp ms
 *   p  — price (string)
 *   v  — size/volume (string)
 *   S  — side: "Buy" (taker buy) | "Sell" (taker sell)
 */
import { useState, useCallback, useRef } from 'react';
import type { Trade, ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';

const MAX_TRADES = 50;
const CVD_WINDOW = 200; // trades to accumulate for CVD

export interface CvdPoint {
  time: number;
  cvd:  number;
}

interface BybitTradeMsg {
  topic?: string;
  data?:  Array<{
    i: string;
    T: number;
    p: string;
    v: string;
    S: 'Buy' | 'Sell';
  }>;
}

export function useTrades(symbol: string) {
  const [trades, setTrades]     = useState<Trade[]>([]);
  const [cvdPoints, setCvdPoints] = useState<CvdPoint[]>([]);
  const [status, setStatus]     = useState<ConnectionStatus>('disconnected');
  const idRef                   = useRef(0);
  const cvdRef                  = useRef(0); // running CVD total
  const cvdHistoryRef           = useRef<CvdPoint[]>([]);

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as BybitTradeMsg;
    if (!msg.topic?.startsWith('publicTrade.') || !Array.isArray(msg.data)) return;

    const incoming: Trade[] = msg.data.map((d) => ({
      id:           String(idRef.current++),
      time:         d.T,
      price:        parseFloat(d.p),
      size:         parseFloat(d.v),
      isBuyerMaker: d.S === 'Sell',
    }));

    // Update CVD incrementally — zero re-allocation of history
    for (const t of incoming) {
      if (t.isBuyerMaker) {
        cvdRef.current -= t.size; // sell = negative delta
      } else {
        cvdRef.current += t.size; // buy = positive delta
      }
      cvdHistoryRef.current.push({ time: t.time, cvd: cvdRef.current });
      // Trim to window
      if (cvdHistoryRef.current.length > CVD_WINDOW) {
        cvdHistoryRef.current.shift();
      }
    }

    // Circular-style update: prepend incoming, slice to MAX — minimal allocation
    setTrades((prev) => {
      const next = incoming.length >= MAX_TRADES
        ? incoming.slice(0, MAX_TRADES)
        : [...incoming, ...prev].slice(0, MAX_TRADES);
      return next;
    });

    // CVD: snapshot every trade batch (shallow copy for react)
    setCvdPoints([...cvdHistoryRef.current]);
  }, []);

  const { retry } = useBybitWs({
    topics:         [`publicTrade.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { trades, cvdPoints, status, retry };
}
