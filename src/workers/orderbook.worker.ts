/**
 * orderbook.worker.ts — ZERØ ORDER BOOK v44
 * Web Worker: semua heavy compute off main thread
 *   - PriceMap sort + cumulative
 *   - Whale detection
 *   - CVD accumulation
 * Main thread cuma render. Zero jank.
 */

type PriceMap = Map<string, number>;

const WHALE_NOTIONAL = 100_000;

function applyDelta(map: PriceMap, updates: [string, string][]): void {
  for (const [price, size] of updates) {
    const s = parseFloat(size);
    if (s === 0) map.delete(price);
    else         map.set(price, s);
  }
}

function mapToLevels(map: PriceMap, isAsk: boolean, levels: number, mid: number) {
  const entries: [number, number][] = [];
  map.forEach((size, priceStr) => entries.push([parseFloat(priceStr), size]));
  entries.sort((a, b) => isAsk ? a[0] - b[0] : b[0] - a[0]);
  const sliced = entries.slice(0, levels);
  let cum = 0;
  return sliced.map(([price, size]) => {
    cum += size;
    const notional = price * size;
    return { price, size, total: cum, notional, isWhale: notional >= WHALE_NOTIONAL };
  });
}

// State per symbol
let bidsMap: PriceMap = new Map();
let asksMap: PriceMap = new Map();
let midPrice = 0;
let currentSymbol = '';

// CVD state
let cvdRunning = 0;
const cvdHistory: { time: number; cvd: number }[] = [];
const CVD_WINDOW = 200;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as {
    type: 'orderbook' | 'trades' | 'reset';
    symbol?: string;
    topic?: string;
    msgType?: 'snapshot' | 'delta';
    data?: { b: [string,string][]; a: [string,string][] };
    trades?: Array<{ i: string; T: number; p: string; v: string; S: 'Buy'|'Sell' }>;
    levels?: number;
  };

  if (msg.type === 'reset') {
    bidsMap = new Map();
    asksMap = new Map();
    midPrice = 0;
    cvdRunning = 0;
    cvdHistory.length = 0;
    currentSymbol = msg.symbol ?? '';
    return;
  }

  if (msg.type === 'orderbook' && msg.data) {
    const levels = msg.levels ?? 50;
    if (msg.msgType === 'snapshot') {
      bidsMap = new Map(msg.data.b.map(([p, s]) => [p, parseFloat(s)]));
      asksMap = new Map(msg.data.a.map(([p, s]) => [p, parseFloat(s)]));
    } else if (msg.msgType === 'delta') {
      applyDelta(bidsMap, msg.data.b);
      applyDelta(asksMap, msg.data.a);
    }
    const bids = mapToLevels(bidsMap, false, levels, midPrice);
    const asks = mapToLevels(asksMap, true,  levels, midPrice);
    if (bids.length && asks.length) midPrice = (bids[0].price + asks[0].price) / 2;
    self.postMessage({ type: 'orderbook', bids, asks, ts: Date.now() });
    return;
  }

  if (msg.type === 'trades' && msg.trades) {
    const trades = msg.trades.map((d, idx) => ({
      id:           d.i + '_' + idx,
      time:         d.T,
      price:        parseFloat(d.p),
      size:         parseFloat(d.v),
      isBuyerMaker: d.S === 'Sell',
    }));
    for (const t of trades) {
      cvdRunning += t.isBuyerMaker ? -t.size : t.size;
      cvdHistory.push({ time: t.time, cvd: cvdRunning });
      if (cvdHistory.length > CVD_WINDOW) cvdHistory.shift();
    }
    self.postMessage({ type: 'trades', trades, cvdPoints: [...cvdHistory] });
  }
};
