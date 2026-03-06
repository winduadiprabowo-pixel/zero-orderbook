/**
 * useTrades.ts — ZERØ ORDER BOOK v36
 * FIX: pakai PROXY_BASE dari useBinanceWs — no hardcode duplikasi
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import { PROXY_BASE } from './useBinanceWs';
import type { Trade, ConnectionStatus } from '@/types/market';

const MAX_TRADES = 50;

export function useTrades(symbol: string) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const idRef      = useRef(0);
  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback((attempt = 0) => {
    if (!mountedRef.current) return;
    const proxyWs = PROXY_BASE.replace(/^https?:\/\//, 'wss://');
    const wsUrl   = proxyWs + '/ws/' + symbol.toLowerCase() + '@trade';
    setStatus('reconnecting');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!mountedRef.current) return;
        attemptRef.current = 0;
        setStatus('connected');
      };
      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const d = JSON.parse(event.data as string) as {
            t: number; p: string; q: string; m: boolean; T: number;
          };
          if (!d.p) return;
          const trade: Trade = {
            id:           String(idRef.current++),
            time:         d.T || Date.now(),
            price:        parseFloat(d.p),
            size:         parseFloat(d.q),
            isBuyerMaker: d.m,
          };
          setTrades((prev) => [trade, ...prev].slice(0, MAX_TRADES));
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus('disconnected');
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connect(attempt + 1);
        }, getReconnectDelay(attempt));
      };
      ws.onerror = () => ws.close();
    } catch {
      timeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connect(attempt + 1);
      }, getReconnectDelay(attempt));
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

  return { trades, status, retry };
}
