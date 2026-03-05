export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

export interface Trade {
  id: string;
  time: number;
  price: number;
  size: number;
  isBuyerMaker: boolean;
}

export interface TickerData {
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

export interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export const SYMBOLS = [
  { symbol: 'btcusdt', label: 'BTC/USDT', coingeckoId: 'bitcoin' },
  { symbol: 'ethusdt', label: 'ETH/USDT', coingeckoId: 'ethereum' },
  { symbol: 'solusdt', label: 'SOL/USDT', coingeckoId: 'solana' },
  { symbol: 'bnbusdt', label: 'BNB/USDT', coingeckoId: 'binancecoin' },
  { symbol: 'xrpusdt', label: 'XRP/USDT', coingeckoId: 'ripple' },
  { symbol: 'adausdt', label: 'ADA/USDT', coingeckoId: 'cardano' },
  { symbol: 'avaxusdt', label: 'AVAX/USDT', coingeckoId: 'avalanche-2' },
  { symbol: 'dogeusdt', label: 'DOGE/USDT', coingeckoId: 'dogecoin' },
] as const;

export type SymbolInfo = typeof SYMBOLS[number];
export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type Precision = '0.1' | '0.01' | '0.001';
