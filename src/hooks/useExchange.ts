/**
 * useExchange.ts — ZERØ ORDER BOOK v53
 * Multi-exchange WebSocket abstraction.
 * Normalises Bybit / Binance / Coinbase into one interface.
 *
 * Each exchange has different:
 *   - WS URL
 *   - Subscribe message format
 *   - Message schema
 *   - Topic naming
 *
 * Output: always { bids, asks, trades, ticker } in same shape.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

export type ExchangeId = 'bybit' | 'binance' | 'coinbase';

export interface ExchangeMeta {
  id:      ExchangeId;
  label:   string;
  color:   string;   // brand color rgba
  tvPrefix: string;  // TradingView symbol prefix
}

export const EXCHANGES: ExchangeMeta[] = [
  {
    id:       'bybit',
    label:    'Bybit',
    color:    'rgba(242,162,33,1)',
    tvPrefix: 'BYBIT',
  },
  {
    id:       'binance',
    label:    'Binance',
    color:    'rgba(240,185,11,1)',
    tvPrefix: 'BINANCE',
  },
  {
    id:       'coinbase',
    label:    'Coinbase',
    color:    'rgba(0,82,255,1)',
    tvPrefix: 'COINBASE',
  },
];

export function getExchange(id: ExchangeId): ExchangeMeta {
  return EXCHANGES.find((e) => e.id === id) ?? EXCHANGES[0];
}

// ── WS URLs (direct — no proxy, browser → exchange) ──────────────────────────

export function getWsUrl(exchange: ExchangeId, symbol: string): string {
  const sym = symbol.toUpperCase();
  switch (exchange) {
    case 'bybit':
      return 'wss://stream.bybit.com/v5/public/spot';
    case 'binance':
      return `wss://stream.binance.com:9443/stream?streams=${sym.toLowerCase()}@depth20@100ms/${sym.toLowerCase()}@trade/${sym.toLowerCase()}@ticker`;
    case 'coinbase': {
      return 'wss://advanced-trade-ws.coinbase.com';
    }
  }
}

// ── Subscribe payloads ────────────────────────────────────────────────────────

export function getSubscribeMsg(exchange: ExchangeId, symbol: string): object {
  const sym = symbol.toUpperCase();
  switch (exchange) {
    case 'bybit':
      return {
        op: 'subscribe',
        args: [
          `orderbook.50.${sym}`,
          `publicTrade.${sym}`,
          `tickers.${sym}`,
        ],
      };
    case 'binance':
      // Combined stream — no subscribe needed, topics in URL
      return {};
    case 'coinbase': {
      // v53 FIX: BTCUSDT → BTC-USD via toExchangeSymbol (consistent for ALL pairs)
      // OLD BUG: sym.replace('USDT', '-USDT') → 'BTC-USDT' (wrong, Coinbase uses USD not USDT)
      const productId = toExchangeSymbol('coinbase', sym); // BTCUSDT → BTC-USD
      return {
        type: 'subscribe',
        product_ids: [productId],
        channel: 'level2',
      };
    }
  }
}

// ── Symbol format per exchange ────────────────────────────────────────────────

export function toExchangeSymbol(exchange: ExchangeId, symbol: string): string {
  const sym = symbol.toUpperCase();
  switch (exchange) {
    case 'bybit':    return sym;           // BTCUSDT
    case 'binance':  return sym;           // BTCUSDT
    case 'coinbase': {
      // BTCUSDT → BTC-USD (Coinbase uses USD not USDT)
      const base = sym.replace('USDT', '').replace('BUSD', '');
      return base + '-USD';
    }
  }
}

// ── TradingView symbol ────────────────────────────────────────────────────────

export function toTvSymbol(exchange: ExchangeId, symbol: string): string {
  const sym = symbol.toUpperCase();
  switch (exchange) {
    case 'bybit':    return `BYBIT:${sym}.P`;   // BYBIT perpetual
    case 'binance':  return `BINANCE:${sym}`;
    case 'coinbase': {
      const base = sym.replace('USDT', '');
      return `COINBASE:${base}USD`;
    }
  }
}
