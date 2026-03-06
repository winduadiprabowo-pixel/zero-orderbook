import { useState, useCallback, useRef, useEffect } from 'react';
import { resolveWsUrl } from './useBinanceWs';
import type { OrderBookLevel, ConnectionStatus } from '@/types/market';
import { getReconnectDelay } from '@/lib/formatters';

interface DepthSnapshot {
  bids: [string, string][];
  asks: [string, string][];
}

function processLevels(raw: [string, string][], isAsk: boolean, levels: number): OrderBookLevel[] {
  const result = raw
    .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s), total: 0 }))
    .filter((l) => l.size > 0)
    .sort((a, b) => isAsk ? a.price - b.price : b.price - a.price)
    .slice(0, levels);
  let cumulative = 0;
  for (const lvl of result) { cumulative += lvl.size; lvl.total = cumulative; }
  return result;
}

export function useOrderBook(symbol: string, levels = 20) {
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState(0);

  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback((attempt = 0) => {
    if (!mountedRef.current) return;
    // ✅ Hardcode URL proxy langsung — tidak depend on env var
    const PROXY = 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';
    const wsUrl = PROXY + '/ws/' + symbol.toUpperCase() + '@depth20@500ms';

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
          const d = JSON.parse(event.data as string) as DepthSnapshot;
          if (!d.bids || !d.asks) return;
          setBids(processLevels(d.bids, false, levels));
          setAsks(processLevels(d.asks, true, levels));
          setLastUpdate(Date.now());
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus('disconnected');
        const delay = getReconnectDelay(attempt);
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connect(attempt + 1);
        }, delay);
      };
      ws.onerror = () => ws.close();
    } catch {
      const delay = getReconnectDelay(attempt);
      timeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connect(attempt + 1);
      }, delay);
    }
  }, [symbol, levels]);

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

  return { bids, asks, status, lastUpdate, retry };
}
