/**
 * useTrades.ts — ZERØ ORDER BOOK v37
 * MIGRATION: Binance @trade WS → Bybit publicTrade WS
 *
 * Bybit trade fields:
 *   i  — trade ID
 *   T  — timestamp ms
 *   p  — price (string)
 *   v  — size/volume (string)
 *   S  — side: "Buy" (taker buy) | "Sell" (taker sell)
 *
 * Mapping isBuyerMaker:
 *   S:"Buy"  → taker was buyer  → price up   → green → isBuyerMaker: false
 *   S:"Sell" → taker was seller → price down → red   → isBuyerMaker: true
 */
import { useState, useCallback, useRef } from 'react';
import type { Trade, ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';

const MAX_TRADES = 50;

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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const idRef = useRef(0);

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

    setTrades((prev) => [...incoming, ...prev].slice(0, MAX_TRADES));
  }, []);

  const { retry } = useBybitWs({
    topics:         [`publicTrade.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { trades, status, retry };
}
