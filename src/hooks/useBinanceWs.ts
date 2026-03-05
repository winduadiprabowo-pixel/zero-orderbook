import { useEffect, useRef, useCallback } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import type { ConnectionStatus } from '@/types/market';

interface UseBinanceWsOptions {
  url: string;
  onMessage: (data: unknown) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  enabled?: boolean;
}

export function useBinanceWs({
  url,
  onMessage,
  onStatusChange,
  enabled = true,
}: UseBinanceWsOptions) {
  const wsRef           = useRef<WebSocket | null>(null);
  const mountedRef      = useRef(true);
  const attemptRef      = useRef(0);
  const timeoutRef      = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef    = useRef(onMessage);
  const onStatusRef     = useRef(onStatusChange);
  const rafRef          = useRef<number>();
  const pendingRef      = useRef<unknown[]>([]);

  onMessageRef.current = onMessage;
  onStatusRef.current  = onStatusChange;

  const flush = useCallback(() => {
    const msgs = pendingRef.current.splice(0);
    for (const m of msgs) onMessageRef.current(m);
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

    try {
      const ws = new WebSocket(url);
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
        } catch { /* ignore parse errors */ }
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
