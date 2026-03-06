import { useState, useCallback, useRef } from 'react';
import { useBinanceWs, resolveWsUrl } from './useBinanceWs';
import type { Trade, ConnectionStatus } from '@/types/market';

const MAX_TRADES = 50;

export function useTrades(symbol: string) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const idRef = useRef(0);

  const handleMessage = useCallback((data: unknown) => {
    const d = data as { t: number; p: string; q: string; m: boolean; T: number };
    if (!d.p) return;
    const trade: Trade = {
      id:           String(idRef.current++),
      time:         d.T || Date.now(),
      price:        parseFloat(d.p),
      size:         parseFloat(d.q),
      isBuyerMaker: d.m,
    };
    setTrades((prev) => [trade, ...prev].slice(0, MAX_TRADES));
  }, []);

  // ✅ FIX: tanpa :9443
  const wsUrl = resolveWsUrl(
    'wss://stream.binance.com/ws/' + symbol.toUpperCase() + '@trade'
  );

  const { retry } = useBinanceWs({
    url: wsUrl,
    onMessage: handleMessage,
    onStatusChange: setStatus,
  });

  return { trades, status, retry };
}
