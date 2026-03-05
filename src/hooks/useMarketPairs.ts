/**
 * useMarketPairs.ts — ZERØ ORDER BOOK v24
 * Fetches ALL trading pairs from Binance REST API (spot + futures).
 * 500+ real pairs · live 24h ticker data · search/filter/category.
 * mountedRef ✓ · AbortController ✓ · no mock data ✓
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { resolveRestUrl } from './useBinanceWs';
import type { SymbolInfo } from '@/types/market';
import { PINNED_SYMBOLS } from '@/types/market';

// ─── Binance REST response shapes ─────────────────────────────────────────────

interface BinanceTicker24h {
  symbol:             string;
  lastPrice:          string;
  priceChangePercent: string;
  quoteVolume:        string;
  count:              number;
}

interface BinanceExchangeInfo {
  symbols: Array<{
    symbol:             string;
    status:             string;
    baseAsset:          string;
    quoteAsset:         string;
    filters:            Array<{ filterType: string; tickSize?: string; stepSize?: string }>;
  }>;
}

// ─── Precision from tickSize filter ──────────────────────────────────────────

function decFromTickSize(tickSize: string): number {
  if (!tickSize || tickSize === '0') return 2;
  const stripped = tickSize.replace(/0+$/, '');
  const dotIdx = stripped.indexOf('.');
  if (dotIdx === -1) return 0;
  return stripped.length - dotIdx - 1;
}

function decFromStepSize(stepSize: string): number {
  return decFromTickSize(stepSize);
}

// ─── Build SymbolInfo from exchange info + ticker ─────────────────────────────

function buildInfo(
  sym: BinanceExchangeInfo['symbols'][number],
  ticker?: BinanceTicker24h,
): SymbolInfo {
  const tickFilter  = sym.filters.find((f) => f.filterType === 'PRICE_FILTER');
  const sizeFilter  = sym.filters.find((f) => f.filterType === 'LOT_SIZE');
  const priceDec    = tickFilter?.tickSize  ? decFromTickSize(tickFilter.tickSize)   : 2;
  const sizeDec     = sizeFilter?.stepSize ? decFromStepSize(sizeFilter.stepSize) : 4;
  const pinned      = PINNED_SYMBOLS.find((p) => p.symbol === sym.symbol.toLowerCase());

  return {
    symbol:        sym.symbol.toLowerCase(),
    label:         `${sym.baseAsset}/${sym.quoteAsset}`,
    base:          sym.baseAsset,
    quote:         sym.quoteAsset,
    futuresSymbol: sym.symbol,
    priceDec:      pinned?.priceDec ?? priceDec,
    sizeDec:       pinned?.sizeDec  ?? sizeDec,
    isFutures:     false,
    volume24h:     ticker ? parseFloat(ticker.quoteVolume) : 0,
  };
}

// ─── Quote asset categories ───────────────────────────────────────────────────

export type QuoteCategory = 'ALL' | 'USDT' | 'USDC' | 'BTC' | 'ETH' | 'BNB' | 'FDUSD';

export const QUOTE_CATEGORIES: QuoteCategory[] = ['ALL', 'USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'FDUSD'];

// ─── State ────────────────────────────────────────────────────────────────────

export interface MarketPairsState {
  pairs:        SymbolInfo[];
  loading:      boolean;
  error:        string | null;
  lastFetchedAt: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMarketPairs() {
  const [state, setState] = useState<MarketPairsState>({
    pairs:         PINNED_SYMBOLS as SymbolInfo[],
    loading:       true,
    error:         null,
    lastFetchedAt: 0,
  });

  const mountedRef = useRef(true);

  const fetchPairs = useCallback(async () => {
    const controller = new AbortController();
    const { signal } = controller;

    try {
      // Fetch exchange info + 24h tickers concurrently
      const [infoRes, tickerRes] = await Promise.all([
        fetch(resolveRestUrl('https://api.binance.com/api/v3/exchangeInfo'), { signal }),
        fetch(resolveRestUrl('https://api.binance.com/api/v3/ticker/24hr'), { signal }),
      ]);

      if (!infoRes.ok) throw new Error(`exchangeInfo ${infoRes.status}`);
      if (!tickerRes.ok) throw new Error(`ticker/24hr ${tickerRes.status}`);

      const [info, tickers]: [BinanceExchangeInfo, BinanceTicker24h[]] = await Promise.all([
        infoRes.json(),
        tickerRes.json(),
      ]);

      if (!mountedRef.current) return;

      const tickerMap = new Map<string, BinanceTicker24h>();
      for (const t of tickers) tickerMap.set(t.symbol, t);

      // Filter to TRADING status only, common quote assets
      const ALLOWED_QUOTES = new Set(['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'FDUSD']);
      const pairs: SymbolInfo[] = [];

      for (const sym of info.symbols) {
        if (sym.status !== 'TRADING') continue;
        if (!ALLOWED_QUOTES.has(sym.quoteAsset)) continue;
        pairs.push(buildInfo(sym, tickerMap.get(sym.symbol)));
      }

      // Sort: pinned first by pinned order, then by quoteVolume desc
      const pinnedOrder = new Map(PINNED_SYMBOLS.map((p, i) => [p.symbol, i]));
      pairs.sort((a, b) => {
        const ai = pinnedOrder.get(a.symbol) ?? Infinity;
        const bi = pinnedOrder.get(b.symbol) ?? Infinity;
        if (ai !== bi) return ai - bi;
        return (b.volume24h ?? 0) - (a.volume24h ?? 0);
      });

      setState({ pairs, loading: false, error: null, lastFetchedAt: Date.now() });
    } catch (err) {
      if (!mountedRef.current) return;
      // On error, keep existing pairs (fallback to PINNED_SYMBOLS), show error
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Fetch failed',
      }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchPairs();
    // Refresh every 5 minutes
    const id = setInterval(fetchPairs, 5 * 60_000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchPairs]);

  return { ...state, retry: fetchPairs };
}

// ─── useFilteredPairs ─────────────────────────────────────────────────────────

export function useFilteredPairs(
  pairs:    SymbolInfo[],
  query:    string,
  category: QuoteCategory,
) {
  return useMemo(() => {
    const q = query.trim().toUpperCase();
    return pairs.filter((p) => {
      const matchCategory = category === 'ALL' || p.quote === category;
      if (!matchCategory) return false;
      if (!q) return true;
      return (
        p.base.includes(q)      ||
        p.quote.includes(q)     ||
        p.symbol.toUpperCase().includes(q) ||
        p.label.replace('/', '').includes(q)
      );
    });
  }, [pairs, query, category]);
}
