import { useState, useCallback, useRef, useEffect } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import type { TickerData, ConnectionStatus } from '@/types/market';

const PROXY_WS = 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

export function useTicker(symbol: string) {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback((attempt = 0) => {
    if (!mountedRef.current) return;
    const wsUrl = PROXY_WS + '/ws/' + symbol.toUpperCase() + '@ticker';
    setStatus('reconnecting');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { if (!mountedRef.current) return; attemptRef.current = 0; setStatus('connected'); };
      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const d = JSON.parse(event.data as string) as { c: string; p: string; P: string; h: string; l: string; v: string; q: string };
          if (!d.c) return;
          setTicker({
            lastPrice: parseFloat(d.c),
            priceChange: parseFloat(d.p),
            priceChangePercent: parseFloat(d.P),
            highPrice: parseFloat(d.h),
            lowPrice: parseFloat(d.l),
            volume: parseFloat(d.v),
            quoteVolume: parseFloat(d.q),
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
  }, [symbol]);

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

  return { ticker, status, retry };
}
