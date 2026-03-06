/**
 * useTicker.ts — ZERØ ORDER BOOK v39
 * FIX: priceChange delta logic — approximate delta when prevPrice24h absent
 * FIX: cache prevPrice24h in ref so delta is always accurate
 *
 * Bybit spot ticker fields:
 *   lastPrice     — harga terakhir
 *   prevPrice24h  — harga 24 jam lalu
 *   price24hPcnt  — persentase desimal (e.g. "0.0123" = +1.23%)
 *   highPrice24h  — high 24h
 *   lowPrice24h   — low 24h
 *   volume24h     — volume base 24h
 *   turnover24h   — volume quote 24h
 */
import { useState, useCallback, useRef } from 'react';
import type { TickerData, ConnectionStatus } from '@/types/market';
import { useBybitWs } from './useBybitWs';

interface BybitTickerMsg {
  topic?: string;
  data?:  {
    lastPrice?:    string;
    prevPrice24h?: string;
    price24hPcnt?: string;
    highPrice24h?: string;
    lowPrice24h?:  string;
    volume24h?:    string;
    turnover24h?:  string;
  };
}

const EMPTY_TICKER: TickerData = {
  lastPrice:          0,
  priceChange:        0,
  priceChangePercent: 0,
  highPrice:          0,
  lowPrice:           0,
  volume:             0,
  quoteVolume:        0,
};

export function useTicker(symbol: string) {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  // FIX: cache prevPrice24h in ref so it's always available even on partial delta
  const prevPrice24hRef = useRef<number>(0);

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as BybitTickerMsg;
    if (!msg.topic?.startsWith('tickers.') || !msg.data) return;
    const d = msg.data;

    // Update cached prevPrice24h when Bybit sends it
    if (d.prevPrice24h) {
      const p = parseFloat(d.prevPrice24h);
      if (p > 0) prevPrice24hRef.current = p;
    }

    setTicker((prev) => {
      const base = prev ?? EMPTY_TICKER;

      const lastPrice = d.lastPrice ? parseFloat(d.lastPrice) : base.lastPrice;

      // FIX: priceChange uses cached prevPrice24h ref, not just current msg
      const prev24h = prevPrice24hRef.current;
      const priceChange = prev24h > 0
        ? lastPrice - prev24h
        // Fallback: approximate using previous priceChange + price movement
        : base.priceChange + (lastPrice - base.lastPrice);

      // price24hPcnt from Bybit is decimal → multiply by 100
      const priceChangePercent = d.price24hPcnt
        ? parseFloat(d.price24hPcnt) * 100
        : base.priceChangePercent;

      return {
        lastPrice,
        priceChange,
        priceChangePercent,
        highPrice:   d.highPrice24h ? parseFloat(d.highPrice24h) : base.highPrice,
        lowPrice:    d.lowPrice24h  ? parseFloat(d.lowPrice24h)  : base.lowPrice,
        volume:      d.volume24h    ? parseFloat(d.volume24h)    : base.volume,
        quoteVolume: d.turnover24h  ? parseFloat(d.turnover24h)  : base.quoteVolume,
      };
    });
  }, []);

  const { retry, latencyMs } = useBybitWs({
    topics:         [`tickers.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { ticker, status, retry, latencyMs };
}
