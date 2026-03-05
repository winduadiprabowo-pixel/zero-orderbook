import { useState, useEffect, useRef } from 'react';

interface FundingData {
  fundingRate: string;
  markPrice: string;
}

export function useFunding(symbol: string) {
  const [funding, setFunding] = useState<FundingData | null>(null);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    const fetchFunding = async () => {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol.toUpperCase()}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        if (mountedRef.current) {
          setFunding({ fundingRate: data.lastFundingRate, markPrice: data.markPrice });
          setError(false);
        }
      } catch {
        if (mountedRef.current) setError(true);
      }
    };

    fetchFunding();
    const id = setInterval(fetchFunding, 30000);

    return () => {
      mountedRef.current = false;
      controller.abort();
      clearInterval(id);
    };
  }, [symbol]);

  return { funding, error, retry: () => { setError(false); } };
}
