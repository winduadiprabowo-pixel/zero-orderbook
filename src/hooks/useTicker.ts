import { useState, useCallback } from 'react';
import { useBinanceWs, resolveWsUrl } from './useBinanceWs';
import type { TickerData, ConnectionStatus } from '@/types/market';

export function useTicker(symbol: string) {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const handleMessage = useCallback((data: unknown) => {
    const d = data as { c: string; p: string; P: string; h: string; l: string; v: string; q: string };
    if (!d.c) return;
    setTicker({
      lastPrice:          parseFloat(d.c),
      priceChange:        parseFloat(d.p),
      priceChangePercent: parseFloat(d.P),
      highPrice:          parseFloat(d.h),
      lowPrice:           parseFloat(d.l),
      volume:             parseFloat(d.v),
      quoteVolume:        parseFloat(d.q),
    });
  }, []);

  // ✅ FIX: tanpa :9443 — proxy gak forward port, pakai standard wss port
  const wsUrl = resolveWsUrl(
    'wss://stream.binance.com/ws/' + symbol.toUpperCase() + '@ticker'
  );

  const { retry } = useBinanceWs({
    url: wsUrl,
    onMessage: handleMessage,
    onStatusChange: setStatus,
  });

  return { ticker, status, retry };
}
