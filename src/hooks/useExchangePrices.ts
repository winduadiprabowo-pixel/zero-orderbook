/**
 * useExchangePrices.ts — ZERØ ORDER BOOK v78 (NEW)
 *
 * Per-exchange BTC/ETH price + 24h change via REST polling.
 * Purpose: Home Dashboard exchange cards now show REAL prices per exchange,
 * not the same Bybit feed for all three.
 *
 * Strategy:
 *   Bybit   → CF Worker proxy /bybit-api/v5/market/tickers
 *   Binance → CF Worker proxy /api/v3/ticker/24hr
 *   OKX     → Direct public REST (no auth, no proxy needed)
 *
 * Poll every 10s (not WS — exchange cards don't need sub-100ms updates).
 * rgba() only ✓ · mountedRef ✓ · AbortController ✓
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ExchangeId } from './useExchange';
import { PROXY_BASE } from './useBybitWs';

export interface ExchangePrice {
  lastPrice:   number;
  changePct:   number;
  volume24h:   number;
  loading:     boolean;
}

export type ExchangePriceMap = Record<ExchangeId, ExchangePrice>;

const DEFAULT_PRICE: ExchangePrice = { lastPrice: 0, changePct: 0, volume24h: 0, loading: true };

const DEFAULT_MAP: ExchangePriceMap = {
  binance: { ...DEFAULT_PRICE },
  bybit:   { ...DEFAULT_PRICE },
  okx:     { ...DEFAULT_PRICE },
};

async function fetchBybit(symbol: string, signal: AbortSignal): Promise<ExchangePrice | null> {
  try {
    const url = `${PROXY_BASE}/bybit-api/v5/market/tickers?category=spot&symbol=${symbol}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.retCode !== 0 || !json.result?.list?.length) return null;
    const d = json.result.list[0];
    return {
      lastPrice: parseFloat(d.lastPrice),
      changePct: parseFloat(d.price24hPcnt) * 100,
      volume24h: parseFloat(d.turnover24h),
      loading: false,
    };
  } catch { return null; }
}

async function fetchBinance(symbol: string, signal: AbortSignal): Promise<ExchangePrice | null> {
  try {
    const url = `${PROXY_BASE}/api/v3/ticker/24hr?symbol=${symbol}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      lastPrice: parseFloat(d.lastPrice),
      changePct: parseFloat(d.priceChangePercent),
      volume24h: parseFloat(d.quoteVolume),
      loading: false,
    };
  } catch { return null; }
}

async function fetchOkx(symbol: string, signal: AbortSignal): Promise<ExchangePrice | null> {
  try {
    const base = symbol.replace('USDT', '');
    const instId = `${base}-USDT-SWAP`;
    const url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data?.length) return null;
    const d = json.data[0];
    const last = parseFloat(d.last);
    const open = parseFloat(d.open24h);
    const pct  = open > 0 ? ((last - open) / open) * 100 : 0;
    return {
      lastPrice: last,
      changePct: pct,
      volume24h: parseFloat(d.volCcy24h),
      loading: false,
    };
  } catch { return null; }
}

export function useExchangePrices(
  symbol     = 'BTCUSDT',
  intervalMs = 10_000,
): ExchangePriceMap {
  const [prices, setPrices] = useState<ExchangePriceMap>(DEFAULT_MAP);
  const mountedRef = useRef(true);
  const abortRef   = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async () => {
    if (!mountedRef.current) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const [bybit, binance, okx] = await Promise.allSettled([
      fetchBybit(symbol,   ctrl.signal),
      fetchBinance(symbol, ctrl.signal),
      fetchOkx(symbol,     ctrl.signal),
    ]);

    if (!mountedRef.current || ctrl.signal.aborted) return;

    setPrices(prev => ({
      bybit:   (bybit.status   === 'fulfilled' && bybit.value)   ? bybit.value   : { ...prev.bybit,   loading: false },
      binance: (binance.status === 'fulfilled' && binance.value) ? binance.value : { ...prev.binance, loading: false },
      okx:     (okx.status     === 'fulfilled' && okx.value)     ? okx.value     : { ...prev.okx,     loading: false },
    }));
  }, [symbol]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const id = setInterval(fetchAll, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchAll, intervalMs]);

  return prices;
}
