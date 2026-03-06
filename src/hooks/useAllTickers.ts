/**
 * useAllTickers.ts — ZERØ ORDER BOOK v37
 * Fetches ALL Bybit spot tickers via REST every 10s.
 * Used to power live price + 24h change in market list.
 *
 * Bybit GET /v5/market/tickers?category=spot
 * Returns full snapshot — no WS needed for list view.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveBybitRestUrl } from './useBybitWs';

export interface TickerSnapshot {
  lastPrice:   number;
  changePct:   number;  // e.g. -4.84
  volume24h:   number;  // quote volume
}

export type TickerMap = Map<string, TickerSnapshot>; // key: uppercase symbol e.g. "BTCUSDT"

interface BybitTickerItem {
  symbol:       string;
  lastPrice:    string;
  price24hPcnt: string; // decimal, e.g. "-0.0484"
  turnover24h:  string;
}

interface BybitTickersResp {
  retCode: number;
  result:  { list: BybitTickerItem[] };
}

export function useAllTickers() {
  const [tickers, setTickers] = useState<TickerMap>(new Map());
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    try {
      const url = resolveBybitRestUrl('/v5/market/tickers?category=spot');
      const res = await fetch(url);
      if (!res.ok) return;
      const data: BybitTickersResp = await res.json();
      if (!mountedRef.current) return;
      if (data.retCode !== 0 || !data.result?.list) return;

      const map: TickerMap = new Map();
      for (const t of data.result.list) {
        map.set(t.symbol, {
          lastPrice: parseFloat(t.lastPrice)    || 0,
          changePct: parseFloat(t.price24hPcnt) * 100 || 0,
          volume24h: parseFloat(t.turnover24h)  || 0,
        });
      }
      setTickers(map);
    } catch { /* network error — keep stale data */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchAll]);

  return tickers;
}
