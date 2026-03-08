/**
 * useExchange.ts — ZERØ ORDER BOOK v69
 * Multi-exchange WebSocket abstraction.
 * Normalises Bybit / Binance / OKX into one interface.
 *
 * v69: Coinbase → OKX
 *   - Coinbase WS blocked from CF datacenter (CF can't proxy it)
 *   - OKX: public WS, no auth, fast, CF-proxy friendly
 *   - OKX WS: wss://ws.okx.com:8443/ws/v5/public
 *   - OKX orderbook: books5 channel (5-level, 100ms) or books (full depth)
 *
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

export type ExchangeId = 'bybit' | 'binance' | 'okx';

export interface ExchangeMeta {
  id:       ExchangeId;
  label:    string;
  color:    string;
  tvPrefix: string;
}

export const EXCHANGES: ExchangeMeta[] = [
  { id: 'bybit',   label: 'Bybit',   color: 'rgba(242,162,33,1)',  tvPrefix: 'BYBIT'   },
  { id: 'binance', label: 'Binance', color: 'rgba(240,185,11,1)',  tvPrefix: 'BINANCE' },
  { id: 'okx',     label: 'OKX',     color: 'rgba(0,200,255,1)',   tvPrefix: 'OKX'     },
];

export function getExchange(id: ExchangeId): ExchangeMeta {
  return EXCHANGES.find((e) => e.id === id) ?? EXCHANGES[0];
}

const PROXY_WS = import.meta.env.VITE_PROXY_URL
  ? import.meta.env.VITE_PROXY_URL.replace('https://', 'wss://')
  : 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

export function getWsUrl(exchange: ExchangeId, _symbol: string): string {
  switch (exchange) {
    case 'bybit':
      return `${PROXY_WS}/bybit/linear`;
    case 'binance':
      return `${PROXY_WS}/ws/stream`;
    case 'okx':
      // v69: OKX via CF proxy — /okx → wss://ws.okx.com:8443/ws/v5/public
      return `${PROXY_WS}/okx`;
  }
}

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
      return {};
    case 'okx': {
      // OKX instId: BTCUSDT → BTC-USDT-SWAP (perpetual) or BTC-USDT (spot)
      // Use SWAP for perpetual — more volume, has funding rate
      const instId = toExchangeSymbol('okx', sym);
      return {
        op: 'subscribe',
        args: [
          { channel: 'books',       instId },
          { channel: 'trades',      instId },
          { channel: 'tickers',     instId },
        ],
      };
    }
  }
}

export function toExchangeSymbol(exchange: ExchangeId, symbol: string): string {
  const sym = symbol.toUpperCase();
  switch (exchange) {
    case 'bybit':   return sym;
    case 'binance': return sym;
    case 'okx': {
      // BTCUSDT → BTC-USDT-SWAP
      const base  = sym.replace('USDT', '');
      return `${base}-USDT-SWAP`;
    }
  }
}

export function toTvSymbol(exchange: ExchangeId, symbol: string): string {
  const sym = symbol.toUpperCase();
  switch (exchange) {
    case 'bybit':   return `BYBIT:${sym}.P`;
    case 'binance': return `BINANCE:${sym}`;
    case 'okx': {
      const base = sym.replace('USDT', '');
      return `OKX:${base}USDT.P`;
    }
  }
}
