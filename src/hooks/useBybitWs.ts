/**
 * useBybitWs.ts — ZERØ ORDER BOOK v43
 *
 * ROOT CAUSE v39-v42: CF Worker proxy → Bybit WS = BLOCKED by Bybit.
 * Bybit blocks datacenter IPs (Cloudflare range).
 *
 * FIX v43: Browser connects DIRECTLY to wss://stream.bybit.com
 * No proxy for WS. CF Worker only used for REST (license, ticker REST).
 *
 * Architecture:
 *   Browser WS → wss://stream.bybit.com/v5/public/:category  (direct)
 *   Browser REST → CF Worker → api.bybit.com                 (proxied)
 *
 * Shared multiplexer: 1 WS per category, fan-out by topic.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import type { ConnectionStatus } from '@/types/market';

// ── Direct Bybit WS URLs (browser → Bybit, bypasses CF Worker) ───────────────
const BYBIT_WS: Record<string, string> = {
  spot:    'wss://stream.bybit.com/v5/public/spot',
  linear:  'wss://stream.bybit.com/v5/public/linear',
};

// CF Worker still used for REST only
const PROXY_BASE = (import.meta.env.VITE_WS_PROXY as string | undefined)?.replace(/\/$/, '')
  ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

export { PROXY_BASE };

export function resolveBybitWsUrl(category: 'spot' | 'linear' = 'spot'): string {
  return BYBIT_WS[category] ?? BYBIT_WS.spot;
}

export function resolveBybitRestUrl(path: string): string {
  return `${PROXY_BASE}/bybit-api${path}`;
}

// ── Shared WS Manager (module-level singleton per category) ───────────────────

type MsgHandler    = (data: unknown) => void;
type StatusHandler = (s: ConnectionStatus) => void;

interface SharedConn {
  ws:           WebSocket | null;
  topics:       Set<string>;
  handlers:     Map<string, MsgHandler>;
  statusCbs:    Map<string, StatusHandler>;
  status:       ConnectionStatus;
  latencyMs:    number | null;
  latencyCnt:   number;
  pingTimer:    ReturnType<typeof setInterval> | null;
  retryTimer:   ReturnType<typeof setTimeout> | null;
  attempt:      number;
  rafId:        number | null;
  pending:      unknown[];
}

const _conns = new Map<string, SharedConn>();

function getConn(cat: string): SharedConn {
  if (!_conns.has(cat)) {
    _conns.set(cat, {
      ws: null, topics: new Set(),
      handlers: new Map(), statusCbs: new Map(),
      status: 'disconnected', latencyMs: null, latencyCnt: 0,
      pingTimer: null, retryTimer: null, attempt: 0,
      rafId: null, pending: [],
    });
  }
  return _conns.get(cat)!;
}

function broadcastStatus(c: SharedConn, s: ConnectionStatus): void {
  c.status = s;
  c.statusCbs.forEach((cb) => cb(s));
}

function flush(c: SharedConn): void {
  const msgs = c.pending.splice(0);
  for (const m of msgs) c.handlers.forEach((h) => h(m));
}

function scheduleFlush(c: SharedConn): void {
  if (c.rafId) return;
  c.rafId = requestAnimationFrame(() => { c.rafId = null; flush(c); });
}

function doConnect(c: SharedConn, cat: string): void {
  if (c.ws && c.ws.readyState <= WebSocket.OPEN) return;
  const url = resolveBybitWsUrl(cat as 'spot' | 'linear');
  broadcastStatus(c, 'reconnecting');
  try {
    const ws = new WebSocket(url);
    c.ws = ws;
    ws.onopen = () => {
      c.attempt = 0;
      broadcastStatus(c, 'connected');
      if (c.topics.size > 0) {
        ws.send(JSON.stringify({ op: 'subscribe', args: [...c.topics] }));
      }
      c.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
      }, 20_000);
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (data.op === 'pong' || data.op === 'subscribe') return;
        if (typeof data.ts === 'number') {
          c.latencyCnt++;
          if (c.latencyCnt % 10 === 0) {
            const lat = Date.now() - (data.ts as number);
            if (lat >= 0 && lat < 5000) c.latencyMs = lat;
          }
        }
        c.pending.push(data);
        scheduleFlush(c);
      } catch { /* malformed */ }
    };
    ws.onclose = () => {
      if (c.pingTimer) { clearInterval(c.pingTimer); c.pingTimer = null; }
      broadcastStatus(c, 'disconnected');
      if (c.handlers.size > 0) {
        c.retryTimer = setTimeout(() => {
          c.attempt++;
          doConnect(c, cat);
        }, getReconnectDelay(c.attempt));
      }
    };
    ws.onerror = () => ws.close();
  } catch {
    c.retryTimer = setTimeout(() => {
      c.attempt++; doConnect(c, cat);
    }, getReconnectDelay(c.attempt));
  }
}

function ensureConnected(c: SharedConn, cat: string): void {
  if (!c.ws || c.ws.readyState === WebSocket.CLOSED || c.ws.readyState === WebSocket.CLOSING) {
    doConnect(c, cat);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

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

let _hid = 0;

export function useBybitWs({
  category = 'spot',
  topics,
  onMessage,
  onStatusChange,
  enabled = true,
}: UseBybitWsOptions): UseBybitWsReturn {
  const hidRef      = useRef<string>(`h${_hid++}`);
  const onMsgRef    = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);
  const topicsKey   = topics.join(',');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval>>();

  onMsgRef.current    = onMessage;
  onStatusRef.current = onStatusChange;

  useEffect(() => {
    const c = getConn(category);
    pollRef.current = setInterval(() => setLatencyMs(c.latencyMs), 500);
    return () => clearInterval(pollRef.current);
  }, [category]);

  useEffect(() => {
    if (!enabled) return;
    const hid = hidRef.current;
    const c   = getConn(category);

    c.handlers.set(hid, (data) => onMsgRef.current(data));
    c.statusCbs.set(hid, (s) => onStatusRef.current?.(s));
    onStatusRef.current?.(c.status);

    for (const t of topics) c.topics.add(t);

    ensureConnected(c, category);
    if (c.ws?.readyState === WebSocket.OPEN && topics.length > 0) {
      c.ws.send(JSON.stringify({ op: 'subscribe', args: topics }));
    }

    return () => {
      c.handlers.delete(hid);
      c.statusCbs.delete(hid);
      for (const t of topics) c.topics.delete(t);
      if (c.handlers.size === 0) {
        if (c.ws) { c.ws.onclose = null; c.ws.close(); c.ws = null; }
        if (c.pingTimer)  { clearInterval(c.pingTimer);  c.pingTimer  = null; }
        if (c.retryTimer) { clearTimeout(c.retryTimer);  c.retryTimer = null; }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsKey, category, enabled]);

  const retry = useCallback(() => {
    const c = getConn(category);
    if (c.retryTimer) clearTimeout(c.retryTimer);
    if (c.ws) { c.ws.onclose = null; c.ws.close(); c.ws = null; }
    if (c.pingTimer) { clearInterval(c.pingTimer); c.pingTimer = null; }
    c.attempt = 0;
    doConnect(c, category);
  }, [category]);

  return { retry, latencyMs };
}
