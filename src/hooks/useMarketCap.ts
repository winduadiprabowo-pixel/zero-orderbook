/**
 * useMarketCap.ts — ZERØ ORDER BOOK v89
 * v89: CoinGecko via CF Worker proxy — fix rate limit 429
 * rgba() only ✓ · mountedRef ✓
 */
import { useState, useEffect, useRef } from 'react';

const PROXY = (import.meta.env.VITE_PROXY_URL as string | undefined)
  ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

export function useMarketCap(coingeckoId: string) {
  const [marketCap, setMarketCap] = useState<number | null>(null);
  const [error, setError]         = useState(false);
  const mountedRef                = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller   = new AbortController();

    const fetch_ = async () => {
      try {
        // v89: via proxy — bukan direct coingecko.com
        const res = await fetch(
          `${PROXY}/coingecko/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_market_cap=true`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('fail');
        const data = await res.json() as Record<string, { usd_market_cap?: number }>;
        if (mountedRef.current && data[coingeckoId]) {
          setMarketCap(data[coingeckoId].usd_market_cap ?? null);
          setError(false);
        }
      } catch {
        if (mountedRef.current) setError(true);
      }
    };

    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => {
      mountedRef.current = false;
      controller.abort();
      clearInterval(id);
    };
  }, [coingeckoId]);

  return { marketCap, error };
}
