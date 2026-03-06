/**
 * useOrderBook.ts — ZERØ ORDER BOOK
 * REST snapshot dulu via proxy, lalu WS stream update.
 * FIX: WS stream symbol LOWERCASE (btcusdt bukan BTCUSDT)
 * REST tetap UPPERCASE
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import type { OrderBookLevel, ConnectionStatus } from '@/types/market';

const PROXY_REST = 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';
const PROXY_WS   = 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

function processLevels(raw: [string, string][], isAsk: boolean, levels: number): OrderBookLevel[] {
  const result = raw
    .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s), total: 0 }))
    .filter((l) => l.size > 0)
    .sort((a, b) => isAsk ? a.price - b.price : b.price - a.price)
    .slice(0, levels);
  let cum = 0;
  for (const lvl of result) { cum += lvl.size; lvl.total = cum; }
  return result;
}

export function useOrderBook(symbol: string, levels = 20) {
  const [bids, setBids]         = useState<OrderBookLevel[]>([]);
  const [asks, setAsks]         = useState<OrderBookLevel[]>([]);
  const [status, setStatus]     = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState(0);

  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSnapshot = useCallback(async (signal: AbortSignal) => {
    try {
      // REST: UPPERCASE
      const res = await fetch(
        PROXY_REST + '/api/v3/depth?symbol=' + symbol.toUpperCase() + '&limit=' + levels,
        { signal }
      );
      if (!res.ok) return;
      const d = await res.json() as { bids: [string,string][]; asks: [string,string][] };
      if (!mountedRef.current) return;
      setBids(processLevels(d.bids, false, levels));
      setAsks(processLevels(d.asks, true,  levels));
      setLastUpdate(Date.now());
    } catch { /* aborted */ }
  }, [symbol, levels]);

  const connect = useCallback((attempt = 0) => {
    if (!mountedRef.current) return;
    // WS stream: LOWERCASE — Binance requires lowercase for stream names
    const wsUrl = PROXY_WS + '/ws/' + symbol.toLowerCase() + '@depth20@500ms';
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
          const d = JSON.parse(event.data as string) as { bids: [string,string][]; asks: [string,string][] };
          if (!d.bids || !d.asks) return;
          setBids(processLevels(d.bids, false, levels));
          setAsks(processLevels(d.asks, true,  levels));
          setLastUpdate(Date.now());
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
  }, [symbol, levels]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    fetchSnapshot(controller.signal);
    connect(0);
    return () => {
      mountedRef.current = false;
      controller.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [fetchSnapshot, connect]);

  const retry = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    const controller = new AbortController();
    fetchSnapshot(controller.signal);
    connect(0);
  }, [fetchSnapshot, connect]);

  return { bids, asks, status, lastUpdate, retry };
}
