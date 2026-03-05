// ─── Order Book ───────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export interface Trade {
  id: string;
  time: number;
  price: number;
  size: number;
  isBuyerMaker: boolean;
}

// ─── Ticker ───────────────────────────────────────────────────────────────────

export interface TickerData {
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

// ─── Kline / Candle ───────────────────────────────────────────────────────────

export interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Funding / OI ────────────────────────────────────────────────────────────

export interface FuturesData {
  fundingRate: number;
  markPrice: number;
  openInterest: number;       // in base currency
  openInterestUsd: number;    // in USD
  longShortRatio: number;     // top trader LSR (> 1 means more longs)
  longPct: number;
  shortPct: number;
  nextFundingTime: number;    // ms epoch
}

// ─── Liquidations ─────────────────────────────────────────────────────────────

export interface LiquidationEvent {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL'; // BUY = short liq'd; SELL = long liq'd
  price: number;
  origQty: number;
  lastFilledQty: number;
  lastFilledPrice: number;
  usdValue: number;
  timestamp: number;
  isMajor: boolean;  // > $100K
  isWhale: boolean;  // > $1M
}

export interface LiquidationStats {
  totalLongLiqUsd: number;
  totalShortLiqUsd: number;
  largestEvent: LiquidationEvent | null;
  eventsPerMinute: number;
}

// ─── Global Market Stats ──────────────────────────────────────────────────────

export interface GlobalStats {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
  activeCryptos: number;
  marketCapChange24h: number;
  fearGreedValue: number;
  fearGreedLabel: string;
  loading: boolean;
}

// ─── Connection ───────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// ─── Symbol metadata ─────────────────────────────────────────────────────────

export const SYMBOLS = [
  { symbol: 'btcusdt',  label: 'BTC/USDT',  coingeckoId: 'bitcoin',       futuresSymbol: 'BTCUSDT'  },
  { symbol: 'ethusdt',  label: 'ETH/USDT',  coingeckoId: 'ethereum',      futuresSymbol: 'ETHUSDT'  },
  { symbol: 'solusdt',  label: 'SOL/USDT',  coingeckoId: 'solana',        futuresSymbol: 'SOLUSDT'  },
  { symbol: 'bnbusdt',  label: 'BNB/USDT',  coingeckoId: 'binancecoin',   futuresSymbol: 'BNBUSDT'  },
  { symbol: 'xrpusdt',  label: 'XRP/USDT',  coingeckoId: 'ripple',        futuresSymbol: 'XRPUSDT'  },
  { symbol: 'adausdt',  label: 'ADA/USDT',  coingeckoId: 'cardano',       futuresSymbol: 'ADAUSDT'  },
  { symbol: 'avaxusdt', label: 'AVAX/USDT', coingeckoId: 'avalanche-2',   futuresSymbol: 'AVAXUSDT' },
  { symbol: 'dogeusdt', label: 'DOGE/USDT', coingeckoId: 'dogecoin',      futuresSymbol: 'DOGEUSDT' },
] as const;

export type SymbolInfo = typeof SYMBOLS[number];
export type Interval   = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type Precision  = '0.1' | '0.01' | '0.001';
