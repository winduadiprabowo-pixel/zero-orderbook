import { useState, useCallback, useRef } from 'react';
import { useBinanceWs } from './useBinanceWs';
import type { OrderBookLevel, ConnectionStatus } from '@/types/market';

interface DepthSnapshot {
  bids: [string, string][];
  asks: [string, string][];
}

function processLevels(raw: [string, string][], isAsk: boolean): OrderBookLevel[] {
  const levels = raw
    .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s), total: 0 }))
    .filter((l) => l.size > 0)
    .sort((a, b) => isAsk ? a.price - b.price : b.price - a.price)
    .slice(0, 20);

  let cumulative = 0;
  for (const level of levels) {
    cumulative += level.size;
    level.total = cumulative;
  }
  return levels;
}

export function useOrderBook(symbol: string) {
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const prevSizesRef = useRef<Map<string, number>>(new Map());

  const handleMessage = useCallback((data: unknown) => {
    const d = data as DepthSnapshot;
    if (!d.bids || !d.asks) return;

    const newBids = processLevels(d.bids, false);
    const newAsks = processLevels(d.asks, true);

    // Track size changes for flash
    const newSizes = new Map<string, number>();
    for (const l of [...newBids, ...newAsks]) {
      newSizes.set(l.price.toString(), l.size);
    }
    prevSizesRef.current = newSizes;

    setBids(newBids);
    setAsks(newAsks);
    setLastUpdate(Date.now());
  }, []);

  const { retry } = useBinanceWs({
    url: `wss://stream.binance.com:9443/ws/${symbol}@depth20@100ms`,
    onMessage: handleMessage,
    onStatusChange: setStatus,
  });

  return { bids, asks, status, lastUpdate, retry };
}
