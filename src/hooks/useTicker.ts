/**
 * useTicker.ts — ZERØ ORDER BOOK v37
 * MIGRATION: Binance @ticker WS → Bybit tickers WS
 *
 * Bybit spot ticker fields (bisa snapshot atau delta — sebagian field mungkin kosong):
 *   lastPrice     — harga terakhir
 *   prevPrice24h  — harga 24 jam lalu (untuk hitung priceChange absolut)
 *   price24hPcnt  — persentase perubahan 24h, format desimal (e.g. "0.0123" = +1.23%)
 *   highPrice24h  — high 24h
 *   lowPrice24h   — low 24h
 *   volume24h     — volume base 24h
 *   turnover24h   — volume quote 24h
 *
 * Delta: hanya field yang berubah yang dikirim → merge dengan state sebelumnya.
 */
import { useState, useCallback } from 'react';
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

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as BybitTickerMsg;
    if (!msg.topic?.startsWith('tickers.') || !msg.data) return;
    const d = msg.data;

    setTicker((prev) => {
      const base = prev ?? EMPTY_TICKER;

      const lastPrice  = d.lastPrice    ? parseFloat(d.lastPrice)    : base.lastPrice;
      const prev24h    = d.prevPrice24h ? parseFloat(d.prevPrice24h) : 0;

      // priceChange = lastPrice - 24h ago price (hanya update kalau prevPrice24h ada)
      const priceChange = prev24h > 0
        ? lastPrice - prev24h
        : base.priceChange;

      // price24hPcnt dari Bybit sudah desimal → kalikan 100 untuk %
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

  const { retry } = useBybitWs({
    topics:         [`tickers.${symbol.toUpperCase()}`],
    onMessage,
    onStatusChange: setStatus,
  });

  return { ticker, status, retry };
}
