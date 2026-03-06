import { useState, useCallback, useEffect, useRef } from 'react';
import { resolveRestUrl } from './useBinanceWs';
import { getReconnectDelay } from '@/lib/formatters';
import type { KlineData, ConnectionStatus, Interval } from '@/types/market';

const PROXY_WS = 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

export function useKline(symbol: string, interval: Interval) {
  const [candles, setCandles] = useState<KlineData[]>([]);
  const [status, setStatus]   = useState<ConnectionStatus>('disconnected');
  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const controller = new AbortController();
    setCandles([]);
    (async () => {
      try {
        const raw = 'https://api.binance.com/api/v3/klines?symbol=' + symbol.toUpperCase() + '&interval=' + interval + '&limit=300';
        const res = await fetch(resolveRestUrl(raw), { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json() as unknown[][];
        const klines: KlineData[] = data.map((k) => ({
          time: (k[0] as number) / 1000,
          open: parseFloat(k[1] as string),
          high: parseFloat(k[2] as string),
          low: parseFloat(k[3] as string),
          close: parseFloat(k[4] as string),
          volume: parseFloat(k[5] as string),
        }));
        setCandles(klines);
      } catch { /* aborted */ }
    })();
    return () => controller.abort();
  }, [symbol, interval]);

  const connect = useCallback((attempt = 0) => {
    if (!mountedRef.current) return;
    const wsUrl = PROXY_WS + '/ws/' + symbol.toUpperCase() + '@kline_' + interval;
    setStatus('reconnecting');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { if (!mountedRef.current) return; attemptRef.current = 0; setStatus('connected'); };
      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const d = JSON.parse(event.data as string) as { k: { t: number; o: string; h: string; l: string; c: string; v: string } };
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
            if (!prev.length) return [candle];
            const last = prev[prev.length - 1];
            if (last.time === candle.time) return [...prev.slice(0, -1), candle];
            return [...prev, candle];
          });
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus('disconnected');
        timeoutRef.current = setTimeout(() => { if (mountedRef.current) connect(attempt + 1); }, getReconnectDelay(attempt));
      };
      ws.onerror = () => ws.close();
    } catch {
      timeoutRef.current = setTimeout(() => { if (mountedRef.current) connect(attempt + 1); }, getReconnectDelay(attempt));
    }
  }, [symbol, interval]);

  useEffect(() => {
    mountedRef.current = true;
    connect(0);
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [connect]);

  const retry = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    connect(0);
  }, [connect]);

  return { candles, status, retry };
}
