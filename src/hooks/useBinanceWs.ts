import { useEffect, useRef, useCallback } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import type { ConnectionStatus } from '@/types/market';

// ── Proxy URL from env ────────────────────────────────────────────────────────
// Set VITE_WS_PROXY in Cloudflare Pages env vars:
//   e.g. https://zero-orderbook-proxy.YOUR.workers.dev
const PROXY_BASE = (import.meta.env.VITE_WS_PROXY as string | undefined)?.replace(/\/$/, '') ?? '';

export function resolveWsUrl(binanceUrl: string): string {
  if (!PROXY_BASE) return binanceUrl;
  const proxyWs = PROXY_BASE.replace(/^https?:\/\//, 'wss://');
  if (binanceUrl.includes('stream.binance.')) {
    const m = binanceUrl.match(/\/ws\/(.+)$/);
    return m ? `${proxyWs}/ws/${m[1]}` : binanceUrl;
  }
  if (binanceUrl.includes('fstream.binance.')) {
    const m = binanceUrl.match(/\/ws\/(.+)$/);
    return m ? `${proxyWs}/fstream/${m[1]}` : binanceUrl;
  }
  return binanceUrl;
}

export function resolveRestUrl(binanceUrl: string): string {
  if (!PROXY_BASE) return binanceUrl;
  if (binanceUrl.includes('api.binance.com/api/')) {
    return binanceUrl.replace('https://api.binance.com', PROXY_BASE);
  }
  if (binanceUrl.includes('fapi.binance.com/fapi/')) {
    return binanceUrl.replace('https://fapi.binance.com', PROXY_BASE);
  }
  if (binanceUrl.includes('fapi.binance.com/futures/data/')) {
    return binanceUrl.replace('https://fapi.binance.com/futures/data/', `${PROXY_BASE}/fdata/`);
  }
  return binanceUrl;
}

interface UseBinanceWsOptions {
  url:             string;
  onMessage:       (data: unknown) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  enabled?:        boolean;
}

export function useBinanceWs({
  url,
  onMessage,
  onStatusChange,
  enabled = true,
}: UseBinanceWsOptions) {
  const wsRef       = useRef<WebSocket | null>(null);
  const mountedRef  = useRef(true);
  const attemptRef  = useRef(0);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>>();
  const onMsgRef    = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);
  const rafRef      = useRef<number>();
  const pendingRef  = useRef<unknown[]>([]);

  onMsgRef.current    = onMessage;
  onStatusRef.current = onStatusChange;

  const flush = useCallback(() => {
    const msgs = pendingRef.current.splice(0);
    for (const m of msgs) onMsgRef.current(m);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = undefined;
      if (mountedRef.current) flush();
    });
  }, [flush]);

  const reconnect = useCallback((attempt: number) => {
    if (!mountedRef.current) return;
    onStatusRef.current?.('reconnecting');
    const delay = getReconnectDelay(attempt);
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) connect(attempt + 1); // eslint-disable-line @typescript-eslint/no-use-before-define
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback((attempt = 0) => {
    if (!mountedRef.current || !enabled) return;
    const resolved = resolveWsUrl(url);
    try {
      const ws = new WebSocket(resolved);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!mountedRef.current) return;
        attemptRef.current = 0;
        onStatusRef.current?.('connected');
      };
      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          pendingRef.current.push(JSON.parse(event.data as string));
          scheduleFlush();
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        onStatusRef.current?.('disconnected');
        reconnect(attempt);
      };
      ws.onerror = () => ws.close();
    } catch {
      reconnect(attempt);
    }
  }, [url, enabled, scheduleFlush, reconnect]);

  const retry = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    connect(0);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect(0);
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled]);

  return { retry };
}
