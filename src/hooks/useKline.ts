import { useState, useCallback, useRef, useEffect } from 'react';
import { useBinanceWs } from './useBinanceWs';
import type { KlineData, ConnectionStatus, Interval } from '@/types/market';

export function useKline(symbol: string, interval: Interval) {
  const [candles, setCandles] = useState<KlineData[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const prevSymRef = useRef(symbol);
  const prevIntvRef = useRef(interval);

  // Fetch historical candles on symbol/interval change
  useEffect(() => {
    const controller = new AbortController();
    setCandles([]);

    (async () => {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=200`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        const klines: KlineData[] = data.map((k: unknown[]) => ({
          time: (k[0] as number) / 1000,
          open: parseFloat(k[1] as string),
          high: parseFloat(k[2] as string),
          low: parseFloat(k[3] as string),
          close: parseFloat(k[4] as string),
          volume: parseFloat(k[5] as string),
        }));
        setCandles(klines);
      } catch {
        // ignore
      }
    })();

    prevSymRef.current = symbol;
    prevIntvRef.current = interval;

    return () => controller.abort();
  }, [symbol, interval]);

  const handleMessage = useCallback((data: unknown) => {
    const d = data as { k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean } };
    if (!d.k) return;
    const candle: KlineData = {
      time: d.k.t / 1000,
      open: parseFloat(d.k.o),
      high: parseFloat(d.k.h),
      low: parseFloat(d.k.l),
      close: parseFloat(d.k.c),
      volume: parseFloat(d.k.v),
    };
    setCandles((prev) => {
      if (prev.length === 0) return [candle];
      const last = prev[prev.length - 1];
      if (last.time === candle.time) {
        return [...prev.slice(0, -1), candle];
      }
      return [...prev, candle];
    });
  }, []);

  const { retry } = useBinanceWs({
    url: `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`,
    onMessage: handleMessage,
    onStatusChange: setStatus,
  });

  return { candles, status, retry };
}
