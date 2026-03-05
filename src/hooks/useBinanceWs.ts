import { useEffect, useRef, useCallback } from 'react';
import type { ConnectionStatus } from '@/types/market';

interface UseBinanceWsOptions {
  url: string;
  onMessage: (data: unknown) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  enabled?: boolean;
}

export function useBinanceWs({ url, onMessage, onStatusChange, enabled = true }: UseBinanceWsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);
  const rafRef = useRef<number>();
  const pendingDataRef = useRef<unknown[]>([]);

  onMessageRef.current = onMessage;
  onStatusRef.current = onStatusChange;

  const processMessages = useCallback(() => {
    const msgs = pendingDataRef.current;
    pendingDataRef.current = [];
    for (const msg of msgs) {
      onMessageRef.current(msg);
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retriesRef.current = 0;
        onStatusRef.current?.('connected');
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          pendingDataRef.current.push(data);
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = undefined;
              if (mountedRef.current) processMessages();
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        reconnect();
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        ws.close();
      };
    } catch {
      reconnect();
    }
  }, [url, enabled, processMessages]);

  const reconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const retries = retriesRef.current;
    if (retries >= 3) {
      onStatusRef.current?.('disconnected');
      return;
    }
    onStatusRef.current?.('reconnecting');
    retriesRef.current = retries + 1;
    const delay = Math.min(1000 * Math.pow(2, retries), 30000);
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  const retry = useCallback(() => {
    retriesRef.current = 0;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();

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
