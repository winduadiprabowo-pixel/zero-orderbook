import { useState, useCallback } from 'react';
import { useBinanceWs } from './useBinanceWs';
import type { TickerData, ConnectionStatus } from '@/types/market';

export function useTicker(symbol: string) {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const handleMessage = useCallback((data: unknown) => {
    const d = data as { c: string; p: string; P: string; h: string; l: string; v: string; q: string };
    if (!d.c) return;
    setTicker({
      lastPrice:           parseFloat(d.c),
      priceChange:         parseFloat(d.p),
      priceChangePercent:  parseFloat(d.P),
      highPrice:           parseFloat(d.h),
      lowPrice:            parseFloat(d.l),
      volume:              parseFloat(d.v),
      quoteVolume:         parseFloat(d.q),
    });
  }, []);

  const { retry } = useBinanceWs({
    url: `wss://stream.binance.com:9443/ws/${symbol}@ticker`,
    onMessage: handleMessage,
    onStatusChange: setStatus,
  });

  return { ticker, status, retry };
}
