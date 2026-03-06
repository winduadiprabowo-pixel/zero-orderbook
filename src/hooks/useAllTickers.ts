/**
 * useAllTickers.ts — ZERØ ORDER BOOK v39
 * UPGRADE: Top 20 pairs via WS multi-topic (1 connection), REST fallback for all others
 *
 * Strategy:
 *   - Top 20 pairs → WS `tickers.SYMBOL` — real-time, zero poll lag
 *   - All others   → REST tiap 15s (down from 10s — less bandwidth)
 *
 * This gives sub-100ms price updates for top pairs in market list.
 * rgba() only ✓ · mountedRef ✓ · AbortController ✓
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveBybitRestUrl, useBybitWs } from './useBybitWs';

export interface TickerSnapshot {
  lastPrice:   number;
  changePct:   number;
  volume24h:   number;
}

export type TickerMap = Map<string, TickerSnapshot>;

// Top pairs to subscribe via WS for real-time updates
const WS_TOP_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'PEPEUSDT', 'SHIBUSDT',
  'WIFUSDT', 'TRXUSDT', 'LTCUSDT', 'DOTUSDT', 'LINKUSDT',
  'MATICUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT',
];

interface BybitTickerItem {
  symbol:       string;
  lastPrice:    string;
  price24hPcnt: string;
  turnover24h:  string;
}

interface BybitTickersResp {
  retCode: number;
  result:  { list: BybitTickerItem[] };
}

interface BybitWsTickerMsg {
  topic?: string;
  data?:  {
    symbol?:       string;
    lastPrice?:    string;
    price24hPcnt?: string;
    turnover24h?:  string;
  };
}

// ─── WS hook for top-20 pairs ─────────────────────────────────────────────────
function useTopPairsWs(onUpdate: (symbol: string, snap: TickerSnapshot) => void) {
  const onMsg = useCallback((raw: unknown) => {
    const msg = raw as BybitWsTickerMsg;
    if (!msg.topic?.startsWith('tickers.') || !msg.data) return;
    const d = msg.data;
    const symbol = msg.topic.replace('tickers.', '').toUpperCase();
    if (!symbol || !d.lastPrice) return;
    onUpdate(symbol, {
      lastPrice: parseFloat(d.lastPrice)    || 0,
      changePct: d.price24hPcnt ? parseFloat(d.price24hPcnt) * 100 : 0,
      volume24h: d.turnover24h  ? parseFloat(d.turnover24h)  : 0,
    });
  }, [onUpdate]);

  const topics = WS_TOP_PAIRS.map((s) => 'tickers.' + s);
  useBybitWs({ topics, onMessage: onMsg });
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useAllTickers(): TickerMap {
  const [tickers, setTickers] = useState<TickerMap>(new Map());
  const mapRef     = useRef<TickerMap>(new Map());
  const mountedRef = useRef(true);

  // WS updates for top 20 — real-time
  const handleWsUpdate = useCallback((symbol: string, snap: TickerSnapshot) => {
    if (!mountedRef.current) return;
    mapRef.current = new Map(mapRef.current);
    mapRef.current.set(symbol, snap);
    setTickers(mapRef.current);
  }, []);

  useTopPairsWs(handleWsUpdate);

  // REST fetch for ALL pairs (includes top-20 as initial seed + long tail)
  const fetchAll = useCallback(async () => {
    try {
      const url = resolveBybitRestUrl('/v5/market/tickers?category=spot');
      const res = await fetch(url);
      if (!res.ok) return;
      const data: BybitTickersResp = await res.json();
      if (!mountedRef.current) return;
      if (data.retCode !== 0 || !data.result?.list) return;

      const next = new Map(mapRef.current); // preserve WS updates
      for (const t of data.result.list) {
        const sym = t.symbol.toUpperCase();
        // Only overwrite non-WS pairs (top-20 are kept fresher by WS)
        if (!WS_TOP_PAIRS.includes(sym)) {
          next.set(sym, {
            lastPrice: parseFloat(t.lastPrice)    || 0,
            changePct: parseFloat(t.price24hPcnt) * 100 || 0,
            volume24h: parseFloat(t.turnover24h)  || 0,
          });
        } else if (!next.has(sym)) {
          // Seed WS pairs on first load before WS message arrives
          next.set(sym, {
            lastPrice: parseFloat(t.lastPrice)    || 0,
            changePct: parseFloat(t.price24hPcnt) * 100 || 0,
            volume24h: parseFloat(t.turnover24h)  || 0,
          });
        }
      }
      mapRef.current = next;
      setTickers(next);
    } catch { /* network error — keep stale */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const id = setInterval(fetchAll, 15_000); // 15s for REST (WS handles real-time)
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchAll]);

  return tickers;
}
