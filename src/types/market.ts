// ─── Order Book ───────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  size:  number;
  total: number;
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export interface Trade {
  id:           string;
  time:         number;
  price:        number;
  size:         number;
  isBuyerMaker: boolean;
}

// ─── Ticker ───────────────────────────────────────────────────────────────────

export interface TickerData {
  lastPrice:          number;
  priceChange:        number;
  priceChangePercent: number;
  highPrice:          number;
  lowPrice:           number;
  volume:             number;
  quoteVolume:        number;
}

// ─── Kline / Candle ───────────────────────────────────────────────────────────

export interface KlineData {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// ─── Funding / OI ────────────────────────────────────────────────────────────

export interface FuturesData {
  fundingRate:     number;
  markPrice:       number;
  openInterest:    number;
  openInterestUsd: number;
  longShortRatio:  number;
  longPct:         number;
  shortPct:        number;
  nextFundingTime: number;
}

// ─── Liquidations ─────────────────────────────────────────────────────────────

export interface LiquidationEvent {
  id:              string;
  symbol:          string;
  side:            'BUY' | 'SELL';
  price:           number;
  origQty:         number;
  lastFilledQty:   number;
  lastFilledPrice: number;
  usdValue:        number;
  timestamp:       number;
  isMajor:         boolean;
  isWhale:         boolean;
}

export interface LiquidationStats {
  totalLongLiqUsd:  number;
  totalShortLiqUsd: number;
  largestEvent:     LiquidationEvent | null;
  eventsPerMinute:  number;
}

// ─── Global Market Stats ──────────────────────────────────────────────────────

export interface GlobalStats {
  totalMarketCap:     number;
  totalVolume24h:     number;
  btcDominance:       number;
  ethDominance:       number;
  activeCryptos:      number;
  marketCapChange24h: number;
  fearGreedValue:     number;
  fearGreedLabel:     string;
  loading:            boolean;
}

// ─── Connection ───────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// ─── Symbol metadata ─────────────────────────────────────────────────────────

export interface SymbolInfo {
  symbol:        string;
  label:         string;
  base:          string;
  quote:         string;
  futuresSymbol: string;
  priceDec:      number;
  sizeDec:       number;
  isFutures:     boolean;
  volume24h?:    number;
  coingeckoId?:  string; // v90: untuk useMarketCap — fix MKT CAP N/A
}

// ─── Binance REST types ───────────────────────────────────────────────────────

export interface BinanceExchangeSymbol {
  symbol:             string;
  status:             string;
  baseAsset:          string;
  quoteAsset:         string;
  pricePrecision?:    number;
  quantityPrecision?: number;
  filters?:           unknown[];
}

// ─── Pinned / featured symbols (always shown as quick-access tabs) ────────────

export const PINNED_SYMBOLS: readonly SymbolInfo[] = [
  { symbol: 'btcusdt',   label: 'BTC/USDT',   base: 'BTC',   quote: 'USDT', futuresSymbol: 'BTCUSDT',   priceDec: 2, sizeDec: 5, isFutures: true, coingeckoId: 'bitcoin' },
  { symbol: 'ethusdt',   label: 'ETH/USDT',   base: 'ETH',   quote: 'USDT', futuresSymbol: 'ETHUSDT',   priceDec: 2, sizeDec: 4, isFutures: true, coingeckoId: 'ethereum' },
  { symbol: 'solusdt',   label: 'SOL/USDT',   base: 'SOL',   quote: 'USDT', futuresSymbol: 'SOLUSDT',   priceDec: 3, sizeDec: 2, isFutures: true, coingeckoId: 'solana' },
  { symbol: 'bnbusdt',   label: 'BNB/USDT',   base: 'BNB',   quote: 'USDT', futuresSymbol: 'BNBUSDT',   priceDec: 2, sizeDec: 3, isFutures: true, coingeckoId: 'binancecoin' },
  { symbol: 'xrpusdt',   label: 'XRP/USDT',   base: 'XRP',   quote: 'USDT', futuresSymbol: 'XRPUSDT',   priceDec: 4, sizeDec: 1, isFutures: true, coingeckoId: 'ripple' },
  { symbol: 'adausdt',   label: 'ADA/USDT',   base: 'ADA',   quote: 'USDT', futuresSymbol: 'ADAUSDT',   priceDec: 4, sizeDec: 1, isFutures: true, coingeckoId: 'cardano' },
  { symbol: 'avaxusdt',  label: 'AVAX/USDT',  base: 'AVAX',  quote: 'USDT', futuresSymbol: 'AVAXUSDT',  priceDec: 3, sizeDec: 2, isFutures: true, coingeckoId: 'avalanche-2' },
  { symbol: 'dogeusdt',  label: 'DOGE/USDT',  base: 'DOGE',  quote: 'USDT', futuresSymbol: 'DOGEUSDT',  priceDec: 5, sizeDec: 0, isFutures: true, coingeckoId: 'dogecoin' },
  { symbol: 'shibusdt',  label: 'SHIB/USDT',  base: 'SHIB',  quote: 'USDT', futuresSymbol: 'SHIBUSDT',  priceDec: 8, sizeDec: 0, isFutures: true, coingeckoId: 'shiba-inu' },
  { symbol: 'pepeusdt',  label: 'PEPE/USDT',  base: 'PEPE',  quote: 'USDT', futuresSymbol: 'PEPEUSDT',  priceDec: 8, sizeDec: 0, isFutures: true, coingeckoId: 'pepe' },
  { symbol: 'wifusdt',   label: 'WIF/USDT',   base: 'WIF',   quote: 'USDT', futuresSymbol: 'WIFUSDT',   priceDec: 4, sizeDec: 1, isFutures: true, coingeckoId: 'dogwifcoin' },
  { symbol: 'trxusdt',   label: 'TRX/USDT',   base: 'TRX',   quote: 'USDT', futuresSymbol: 'TRXUSDT',   priceDec: 5, sizeDec: 1, isFutures: true, coingeckoId: 'tron' },
] as const;

// ─── Smart precision from live price ─────────────────────────────────────────

export function getSmartPriceDec(price: number): number {
  if (price >= 10_000) return 2;
  if (price >= 1_000)  return 2;
  if (price >= 100)    return 3;
  if (price >= 10)     return 4;
  if (price >= 1)      return 4;
  if (price >= 0.1)    return 5;
  if (price >= 0.01)   return 6;
  if (price >= 0.001)  return 7;
  return 8;
}

// ─── Legacy alias used by existing imports ────────────────────────────────────

export const SYMBOLS = PINNED_SYMBOLS;

// ─── Interval / Precision ────────────────────────────────────────────────────

export type Interval  = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type Precision = '100' | '10' | '1' | '0.1' | '0.01' | '0.001' | '0.0001' | '0.00001' | '0.000001' | '0.00000001';
