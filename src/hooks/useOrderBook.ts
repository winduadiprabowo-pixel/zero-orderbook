import { useState, useCallback } from 'react';
import { useBinanceWs } from './useBinanceWs';
import type { OrderBookLevel, ConnectionStatus } from '@/types/market';

interface DepthSnapshot {
  bids: [string, string][];
  asks: [string, string][];
}

function processLevels(raw: [string, string][], isAsk: boolean, levels: number): OrderBookLevel[] {
  const result = raw
    .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s), total: 0 }))
    .filter((l) => l.size > 0)
    .sort((a, b) => isAsk ? a.price - b.price : b.price - a.price)
    .slice(0, levels);

  let cumulative = 0;
  for (const lvl of result) {
    cumulative += lvl.size;
    lvl.total = cumulative;
  }
  return result;
}

export function useOrderBook(symbol: string, levels = 20) {
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState(0);

  const handleMessage = useCallback((data: unknown) => {
    const d = data as DepthSnapshot;
    if (!d.bids || !d.asks) return;
    setBids(processLevels(d.bids, false, levels));
    setAsks(processLevels(d.asks, true, levels));
    setLastUpdate(Date.now());
  }, [levels]);

  const { retry } = useBinanceWs({
    url: `wss://stream.binance.com:9443/ws/${symbol}@depth20@100ms`,
    onMessage: handleMessage,
    onStatusChange: setStatus,
  });

  return { bids, asks, status, lastUpdate, retry };
}
