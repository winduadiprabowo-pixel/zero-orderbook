/**
 * useLiquidations.ts — ZERØ ORDER BOOK v36
 * FIX: pakai PROXY_BASE dari useBinanceWs — no hardcode duplikasi
 */

import { useEffect, useRef, useCallback, useReducer, useMemo } from 'react';
import { getReconnectDelay } from '@/lib/formatters';
import { PROXY_BASE } from './useBinanceWs';
import type { LiquidationEvent, LiquidationStats } from '@/types/market';

const MAX_EVENTS = 200;
let _idSeq = 0;

function buildWsUrl(): string {
  const proxyWs = PROXY_BASE.replace(/^https?:\/\//, 'wss://');
  return proxyWs + '/fstream/!forceOrder@arr';
}

function computeStats(events: LiquidationEvent[]): LiquidationStats {
  if (!events.length) return { totalLongLiqUsd: 0, totalShortLiqUsd: 0, largestEvent: null, eventsPerMinute: 0 };
  const oneMinAgo = Date.now() - 60_000;
  let totalLongLiqUsd = 0, totalShortLiqUsd = 0, largestUsd = 0, eventsPerMinute = 0;
  let largestEvent: LiquidationEvent | null = null;
  for (const e of events) {
    if (e.side === 'SELL') totalLongLiqUsd += e.usdValue; else totalShortLiqUsd += e.usdValue;
    if (e.usdValue > largestUsd) { largestUsd = e.usdValue; largestEvent = e; }
    if (e.timestamp >= oneMinAgo) eventsPerMinute++;
  }
  return { totalLongLiqUsd, totalShortLiqUsd, largestEvent, eventsPerMinute };
}

type Action = { type: 'ADD'; events: LiquidationEvent[] } | { type: 'STATUS'; status: 'connected' | 'disconnected' | 'reconnecting' };
interface State { events: LiquidationEvent[]; wsStatus: 'connected' | 'disconnected' | 'reconnecting'; }

function reducer(state: State, action: Action): State {
  if (action.type === 'ADD') return { ...state, events: [...action.events, ...state.events].slice(0, MAX_EVENTS) };
  if (action.type === 'STATUS') return { ...state, wsStatus: action.status };
  return state;
}

export function useLiquidations() {
  const [state, dispatch] = useReducer(reducer, { events: [], wsStatus: 'disconnected' as const });
  const mountedRef   = useRef(true);
  const wsRef        = useRef<WebSocket | null>(null);
  const attemptRef   = useRef(0);
  const rafRef       = useRef(0);
  const pendingBatch = useRef<LiquidationEvent[]>([]);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout>>();

  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!mountedRef.current || !pendingBatch.current.length) return;
      dispatch({ type: 'ADD', events: pendingBatch.current.splice(0) });
    });
  }, []);

  const connectWS = useCallback(() => {
    if (!mountedRef.current) return;
    dispatch({ type: 'STATUS', status: 'reconnecting' });
    const wsUrl = buildWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      attemptRef.current = 0;
      dispatch({ type: 'STATUS', status: 'connected' });
    };
    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const raw = JSON.parse(event.data as string);
        const items = Array.isArray(raw) ? raw : [raw];
        for (const item of items) {
          const o = item.o ?? item;
          if (!o?.s) continue;
          const lastFilledQty   = parseFloat(o.l ?? '0');
          const lastFilledPrice = parseFloat(o.ap ?? o.p ?? '0');
          const usdValue        = lastFilledQty * lastFilledPrice;
          pendingBatch.current.push({
            id:             o.s + '_' + (o.T ?? Date.now()) + '_' + (++_idSeq),
            symbol:         o.s as string,
            side:           (o.S === 'BUY' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
            price:          parseFloat(o.p ?? '0'),
            origQty:        parseFloat(o.q ?? '0'),
            lastFilledQty, lastFilledPrice, usdValue,
            timestamp:      o.T ?? Date.now(),
            isMajor:        usdValue >= 100_000,
            isWhale:        usdValue >= 1_000_000,
          });
        }
        if (pendingBatch.current.length) scheduleFlush();
      } catch { /* malformed */ }
    };
    ws.onclose = () => {
      if (!mountedRef.current) return;
      dispatch({ type: 'STATUS', status: 'disconnected' });
      timeoutRef.current = setTimeout(connectWS, getReconnectDelay(attemptRef.current++));
    };
    ws.onerror = () => ws.close();
  }, [scheduleFlush]);

  useEffect(() => {
    mountedRef.current = true;
    connectWS();
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
      pendingBatch.current = [];
    };
  }, [connectWS]);

  const stats = useMemo(() => computeStats(state.events), [state.events]);
  return { events: state.events, stats, wsStatus: state.wsStatus };
}
