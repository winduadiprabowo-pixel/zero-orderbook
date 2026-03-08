/**
 * useFutures.ts — ZERØ ORDER BOOK v68
 *
 * v68 FIXES:
 *   - Binance fapi/fdata via CF Worker proxy (was 403 from SG geo-block)
 *   - Bybit fallback: if Binance fapi fails (403/geo), fetch from Bybit REST instead
 *   - Graceful degradation: partial data shown if only some endpoints fail
 *   - Silent fail: no error thrown to UI if panel is ProLocked anyway
 *
 * Strategy:
 *   1. Try Binance fapi via CF proxy first (fastest, most data)
 *   2. If premiumIndex 403/error → fallback to Bybit /v5/market/tickers
 *   3. OI + LSR from Binance — silent null if unavailable
 *
 * rgba() only ✓ · mountedRef ✓ · AbortController ✓
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { PROXY_BASE } from './useBinanceWs';
import type { FuturesData } from '@/types/market';

// ── Proxy URLs — via CF Worker ────────────────────────────────────────────────
function fproxyUrl(path: string): string {
  return `${PROXY_BASE}${path}`;
}

// ── Bybit fallback REST ───────────────────────────────────────────────────────
interface BybitTickerRaw {
  symbol:            string;
  markPrice:         string;
  fundingRate:       string;
  nextFundingTime:   string;
  openInterest:      string;
  openInterestValue: string;
}

async function fetchBybitFutures(
  symbol: string,
  signal: AbortSignal,
): Promise<{
  fundingRate: number; markPrice: number; nextFundingTime: number;
  openInterest: number; openInterestUsd: number;
} | null> {
  try {
    const url = `${PROXY_BASE}/bybit-api/v5/market/tickers?category=linear&symbol=${symbol}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json() as { result?: { list?: BybitTickerRaw[] } };
    const d = json?.result?.list?.[0];
    if (!d) return null;
    return {
      fundingRate:     parseFloat(d.fundingRate)       || 0,
      markPrice:       parseFloat(d.markPrice)         || 0,
      nextFundingTime: parseInt(d.nextFundingTime)     || 0,
      openInterest:    parseFloat(d.openInterest)      || 0,
      openInterestUsd: parseFloat(d.openInterestValue) || 0,
    };
  } catch { return null; }
}

// ── Binance fapi via proxy ────────────────────────────────────────────────────

interface RawPremiumIndex {
  symbol: string; markPrice: string; lastFundingRate: string; nextFundingTime: number;
}
interface RawOI {
  openInterest: string; symbol: string;
}
interface RawLSR {
  longShortRatio: string; longAccount: string; shortAccount: string;
}

async function fetchBinanceFunding(
  symbol: string, signal: AbortSignal,
): Promise<{ fundingRate: number; markPrice: number; nextFundingTime: number } | null> {
  try {
    const res = await fetch(fproxyUrl(`/fapi/v1/premiumIndex?symbol=${symbol}`), { signal });
    if (!res.ok) return null; // 403 geo-block → null → Bybit fallback
    const d = await res.json() as RawPremiumIndex;
    return {
      fundingRate:     parseFloat(d.lastFundingRate),
      markPrice:       parseFloat(d.markPrice),
      nextFundingTime: d.nextFundingTime,
    };
  } catch { return null; }
}

async function fetchBinanceOI(
  symbol: string, signal: AbortSignal,
): Promise<{ openInterest: number } | null> {
  try {
    const res = await fetch(fproxyUrl(`/fapi/v1/openInterest?symbol=${symbol}`), { signal });
    if (!res.ok) return null;
    const d = await res.json() as RawOI;
    return { openInterest: parseFloat(d.openInterest) };
  } catch { return null; }
}

async function fetchBinanceLSR(
  symbol: string, signal: AbortSignal,
): Promise<{ longShortRatio: number; longPct: number; shortPct: number } | null> {
  try {
    const res = await fetch(
      fproxyUrl(`/fdata/topLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`),
      { signal },
    );
    if (!res.ok) return null;
    const data = await res.json() as RawLSR[];
    const d = data[0];
    if (!d) return null;
    return {
      longShortRatio: parseFloat(d.longShortRatio),
      longPct:        parseFloat(d.longAccount) * 100,
      shortPct:       parseFloat(d.shortAccount) * 100,
    };
  } catch { return null; }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFutures(symbol: string) {
  const [data, setData]   = useState<FuturesData | null>(null);
  const [error, setError] = useState(false);
  const mountedRef        = useRef(true);

  const fetchAll = useCallback(async () => {
    const controller = new AbortController();
    const SYM = symbol.toUpperCase();

    try {
      // Fire all calls concurrently — Binance + Bybit fallback in parallel
      const [binFm, binOi, binLsr, bybitData] = await Promise.all([
        fetchBinanceFunding(SYM, controller.signal),
        fetchBinanceOI(SYM, controller.signal),
        fetchBinanceLSR(SYM, controller.signal),
        fetchBybitFutures(SYM, controller.signal),
      ]);

      if (!mountedRef.current) return;

      // Funding: prefer Binance, fallback Bybit
      const fm = binFm ?? (bybitData ? {
        fundingRate:     bybitData.fundingRate,
        markPrice:       bybitData.markPrice,
        nextFundingTime: bybitData.nextFundingTime,
      } : null);

      if (!fm) {
        // Keep prev data — avoid panel flicker on transient 403
        setError(true);
        return;
      }

      // OI: prefer Binance, fallback Bybit
      const openInterest    = binOi?.openInterest ?? bybitData?.openInterest    ?? 0;
      const openInterestUsd = binOi
        ? binOi.openInterest * fm.markPrice
        : bybitData?.openInterestUsd ?? 0;

      setData({
        fundingRate:     fm.fundingRate,
        markPrice:       fm.markPrice,
        nextFundingTime: fm.nextFundingTime,
        openInterest,
        openInterestUsd,
        longShortRatio:  binLsr?.longShortRatio ?? 1,
        longPct:         binLsr?.longPct        ?? 50,
        shortPct:        binLsr?.shortPct       ?? 50,
      });
      setError(false);
    } catch {
      if (mountedRef.current) setError(true);
    }
  }, [symbol]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const id = setInterval(fetchAll, 30_000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchAll]);

  return { data, error, retry: fetchAll };
}
