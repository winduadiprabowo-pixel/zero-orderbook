/**
 * useFutures.ts — ZERØ ORDER BOOK
 * Real Binance Futures endpoints — proxied via CF Worker when VITE_WS_PROXY is set.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveRestUrl } from './useBinanceWs';
import type { FuturesData } from '@/types/market';

const FAPI = 'https://fapi.binance.com/fapi/v1';

interface RawPremiumIndex {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}
interface RawOI {
  openInterest: string;
  symbol: string;
}
interface RawLSR {
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
}

async function fetchFundingAndMark(symbol: string, signal: AbortSignal) {
  const url = resolveRestUrl(`${FAPI}/premiumIndex?symbol=${symbol}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('premiumIndex failed');
  const d = await res.json() as RawPremiumIndex;
  return {
    fundingRate:     parseFloat(d.lastFundingRate),
    markPrice:       parseFloat(d.markPrice),
    nextFundingTime: d.nextFundingTime,
  };
}

async function fetchOI(symbol: string, signal: AbortSignal) {
  const url = resolveRestUrl(`${FAPI}/openInterest?symbol=${symbol}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('openInterest failed');
  const d = await res.json() as RawOI;
  return { openInterest: parseFloat(d.openInterest), openInterestUsd: 0 };
}

async function fetchLSR(symbol: string, signal: AbortSignal) {
  const raw = `https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`;
  const res = await fetch(resolveRestUrl(raw), { signal });
  if (!res.ok) throw new Error('LSR failed');
  const data = await res.json() as RawLSR[];
  const d = data[0];
  if (!d) throw new Error('LSR empty');
  return {
    longShortRatio: parseFloat(d.longShortRatio),
    longPct:        parseFloat(d.longAccount) * 100,
    shortPct:       parseFloat(d.shortAccount) * 100,
  };
}

export function useFutures(symbol: string) {
  const [data, setData]   = useState<FuturesData | null>(null);
  const [error, setError] = useState(false);
  const mountedRef        = useRef(true);

  const fetchAll = useCallback(async () => {
    const controller = new AbortController();
    const SYM = symbol.toUpperCase();
    try {
      const [fmResult, oiResult, lsrResult] = await Promise.allSettled([
        fetchFundingAndMark(SYM, controller.signal),
        fetchOI(SYM, controller.signal),
        fetchLSR(SYM, controller.signal),
      ]);
      if (!mountedRef.current) return;
      const fm  = fmResult.status  === 'fulfilled' ? fmResult.value  : null;
      const oi  = oiResult.status  === 'fulfilled' ? oiResult.value  : null;
      const lsr = lsrResult.status === 'fulfilled' ? lsrResult.value : null;
      if (!fm) { setError(true); return; }
      setData({
        fundingRate:     fm.fundingRate,
        markPrice:       fm.markPrice,
        nextFundingTime: fm.nextFundingTime,
        openInterest:    oi?.openInterest    ?? 0,
        openInterestUsd: oi ? oi.openInterest * fm.markPrice : 0,
        longShortRatio:  lsr?.longShortRatio ?? 1,
        longPct:         lsr?.longPct        ?? 50,
        shortPct:        lsr?.shortPct       ?? 50,
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
