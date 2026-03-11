/**
 * useGlobalStats.ts — ZERØ ORDER BOOK v89
 * v89: CoinGecko + FNG via CF Worker proxy — fix $0 MKT CAP / BTC.D bug
 * Direct coingecko.com dari browser kena rate limit 429 → semua stats kosong
 * Sekarang semua lewat proxy + CF edge cache 60s → zero 429
 * React Query with staleTime caching. mountedRef pattern.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GlobalStats } from '@/types/market';

const PROXY = (import.meta.env.VITE_PROXY_URL as string | undefined)
  ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

// v89: lewat CF proxy — bukan direct coingecko.com
const CG_GLOBAL = `${PROXY}/coingecko/api/v3/global`;
const FNG_URL   = `${PROXY}/fng/fng/?limit=1`;
const REFRESH_MS = 60_000;

function safeNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

type CGGlobalResponse = {
  data: {
    total_market_cap:                       Record<string, number>;
    total_volume:                           Record<string, number>;
    market_cap_percentage:                  Record<string, number>;
    active_cryptocurrencies:                number;
    market_cap_change_percentage_24h_usd:   number;
  };
};

type FNGResponse = {
  data: { value: string; value_classification: string }[];
};

export function useGlobalStats(): GlobalStats {
  const cgQuery = useQuery<CGGlobalResponse>({
    queryKey:        ['zero-global-stats'],
    queryFn:         async ({ signal }) => {
      const res = await fetch(CG_GLOBAL, { signal });
      if (!res.ok) throw new Error('global stats failed');
      return res.json() as Promise<CGGlobalResponse>;
    },
    staleTime:       REFRESH_MS,
    refetchInterval: REFRESH_MS,
    retry:           3,
    retryDelay:      (i) => Math.min(1000 * 2 ** i, 30_000),
  });

  const fngQuery = useQuery<FNGResponse>({
    queryKey:        ['zero-fear-greed'],
    queryFn:         async ({ signal }) => {
      const res = await fetch(FNG_URL, { signal });
      if (!res.ok) throw new Error('fng failed');
      return res.json() as Promise<FNGResponse>;
    },
    staleTime:       5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry:           2,
    retryDelay:      (i) => Math.min(1000 * 2 ** i, 30_000),
  });

  return useMemo((): GlobalStats => {
    const d   = cgQuery.data?.data;
    const fng = fngQuery.data?.data?.[0];
    return {
      totalMarketCap:     safeNum(d?.total_market_cap?.usd),
      totalVolume24h:     safeNum(d?.total_volume?.usd),
      btcDominance:       safeNum(d?.market_cap_percentage?.btc),
      ethDominance:       safeNum(d?.market_cap_percentage?.eth),
      activeCryptos:      safeNum(d?.active_cryptocurrencies),
      marketCapChange24h: safeNum(d?.market_cap_change_percentage_24h_usd),
      fearGreedValue:     fng ? safeNum(fng.value) : 50,
      fearGreedLabel:     fng?.value_classification ?? 'Neutral',
      loading:            cgQuery.isLoading || fngQuery.isLoading,
    };
  }, [cgQuery.data, cgQuery.isLoading, fngQuery.data, fngQuery.isLoading]);
}
