/**
 * useBybitWs.ts — ZERØ ORDER BOOK v39
 * UPGRADES:
 *   - Feed latency tracking: Bybit `ts` field vs Date.now()
 *   - Expose latencyMs via returned object
 *   - Re-subscribe + reconnect waktu topics berubah (symbol ganti)
 *   - Ping setiap 20s agar koneksi tidak disconnect
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */
import { useEffect, useRef, useCallback, useState } from 'react';
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

export interface UseBybitWsReturn {
  retry:     () => void;
  latencyMs: number | null;
}

export function useBybitWs({
  category = 'spot',
  topics,
  onMessage,
  onStatusChange,
  enabled = true,
}: UseBybitWsOptions): UseBybitWsReturn {
  const wsRef       = useRef<WebSocket | null>(null);
  const mountedRef  = useRef(true);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>>();
  const pingRef     = useRef<ReturnType<typeof setInterval>>();
  const onMsgRef    = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);
  const rafRef      = useRef<number>();
  const pendingRef  = useRef<unknown[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const latencyCountRef = useRef(0);

  const topicsKey = topics.join(',');
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

  const teardown = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pingRef.current)    clearInterval(pingRef.current);
    if (rafRef.current)     cancelAnimationFrame(rafRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    pendingRef.current = [];
  }, []);

  const connect = useCallback((attempt = 0, currentTopics: string[]) => {
    if (!mountedRef.current || !enabled) return;
    const wsUrl = resolveBybitWsUrl(category);
    onStatusRef.current?.('reconnecting');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!mountedRef.current) return;
        onStatusRef.current?.('connected');
        ws.send(JSON.stringify({ op: 'subscribe', args: currentTopics }));
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
        }, 20_000);
      };
      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          if (data.op === 'pong' || data.op === 'subscribe') return;
          // Sample feed latency every 10 messages
          if (typeof data.ts === 'number') {
            latencyCountRef.current++;
            if (latencyCountRef.current % 10 === 0) {
              const lat = Date.now() - data.ts;
              if (lat >= 0 && lat < 5000) setLatencyMs(lat);
            }
          }
          pendingRef.current.push(data);
          scheduleFlush();
        } catch { /* malformed */ }
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        if (pingRef.current) clearInterval(pingRef.current);
        onStatusRef.current?.('disconnected');
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connect(attempt + 1, currentTopics);
        }, getReconnectDelay(attempt));
      };
      ws.onerror = () => ws.close();
    } catch {
      timeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connect(attempt + 1, currentTopics);
      }, getReconnectDelay(attempt));
    }
  }, [category, enabled, scheduleFlush, teardown]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    teardown();
    connect(0, topics);
  }, [teardown, connect, topics]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      teardown();
      connect(0, topics);
    }
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [topicsKey, category, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { retry, latencyMs };
}
