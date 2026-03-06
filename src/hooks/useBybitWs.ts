/**
 * useBybitWs.ts — ZERØ ORDER BOOK v37
 * Base hook untuk semua Bybit WebSocket connections.
 * Bybit pakai subscribe pattern: kirim {"op":"subscribe","args":[...topics]}
 * Ping setiap 20s agar koneksi tidak disconnect.
 */
import { useEffect, useRef, useCallback } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import type { ConnectionStatus } from '@/types/market';

const PROXY_BASE = (import.meta.env.VITE_WS_PROXY as string | undefined)?.replace(/\/$/, '')
  ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

export { PROXY_BASE };

export function resolveBybitWsUrl(category: 'spot' | 'linear' = 'spot'): string {
  const proxyWs = PROXY_BASE.replace(/^https?:\/\//, 'wss://');
  return `${proxyWs}/bybit/${category}`;
}

export function resolveBybitRestUrl(path: string): string {
  return `${PROXY_BASE}/bybit-api${path}`;
}

interface UseBybitWsOptions {
  category?:       'spot' | 'linear';
  topics:          string[];
  onMessage:       (data: unknown) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  enabled?:        boolean;
}

export function useBybitWs({
  category = 'spot',
  topics,
  onMessage,
  onStatusChange,
  enabled = true,
}: UseBybitWsOptions) {
  const wsRef       = useRef<WebSocket | null>(null);
  const mountedRef  = useRef(true);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>>();
  const pingRef     = useRef<ReturnType<typeof setInterval>>();
  const onMsgRef    = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);
  const topicsRef   = useRef(topics);
  const rafRef      = useRef<number>();
  const pendingRef  = useRef<unknown[]>([]);

  onMsgRef.current    = onMessage;
  onStatusRef.current = onStatusChange;
  topicsRef.current   = topics;

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

  const connect = useCallback((attempt = 0) => {
    if (!mountedRef.current || !enabled) return;
    const wsUrl = resolveBybitWsUrl(category);
    onStatusRef.current?.('reconnecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        onStatusRef.current?.('connected');
        // Subscribe to requested topics
        ws.send(JSON.stringify({ op: 'subscribe', args: topicsRef.current }));
        // Bybit drops idle connections — ping every 20s
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, 20_000);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          // Skip control frames — pong + subscription confirmations
          if (data.op === 'pong' || data.op === 'subscribe') return;
          pendingRef.current.push(data);
          scheduleFlush();
        } catch { /* malformed frame — ignore */ }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        if (pingRef.current) clearInterval(pingRef.current);
        onStatusRef.current?.('disconnected');
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
  }, [category, enabled, scheduleFlush]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    if (timeoutRef.current)  clearTimeout(timeoutRef.current);
    if (pingRef.current)     clearInterval(pingRef.current);
    if (rafRef.current)      cancelAnimationFrame(rafRef.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    connect(0);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect(0);
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
      if (pingRef.current)     clearInterval(pingRef.current);
      if (rafRef.current)      cancelAnimationFrame(rafRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled]);

  return { retry };
}
