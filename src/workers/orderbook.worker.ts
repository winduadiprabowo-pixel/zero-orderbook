/**
 * orderbook.worker.ts — ZERØ ORDER BOOK v52
 *
 * FIX v52:
 *   CVD history: shift() O(n) → ring buffer O(1).
 *   CVD_WINDOW configurable via 'configure' message.
 *
 * Main thread cuma render. Zero jank. rgba() only ✓
 */

type PriceMap = Map<string, number>;

const WHALE_NOTIONAL = 100_000;
let CVD_WINDOW = 200;

// ── Ring buffer — O(1) push ───────────────────────────────────────────────────
class RingBuffer<T> {
  private buf: T[];
  private idx  = 0;
  private full = false;
  constructor(private cap: number) { this.buf = new Array<T>(cap); }
  push(item: T): void {
    this.buf[this.idx] = item;
    this.idx = (this.idx + 1) % this.cap;
    if (this.idx === 0) this.full = true;
  }
  toArray(): T[] {
    return this.full
      ? [...this.buf.slice(this.idx), ...this.buf.slice(0, this.idx)]
      : this.buf.slice(0, this.idx);
  }
  clear(): void { this.buf = new Array<T>(this.cap); this.idx = 0; this.full = false; }
  resize(newCap: number): void { this.cap = newCap; this.clear(); }
}

function applyDelta(map: PriceMap, updates: [string, string][]): void {
  for (const [price, size] of updates) {
    const s = parseFloat(size);
    if (s === 0) map.delete(price);
    else         map.set(price, s);
  }
}

function mapToLevels(map: PriceMap, isAsk: boolean, levels: number) {
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

// CVD — ring buffer
let cvdRunning = 0;
const cvdRing = new RingBuffer<{ time: number; cvd: number }>(CVD_WINDOW);

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as {
    type:     'orderbook' | 'trades' | 'reset' | 'configure';
    symbol?:  string;
    msgType?: 'snapshot' | 'delta';
    data?:    { b: [string,string][]; a: [string,string][] };
    trades?:  Array<{ i: string; T: number; p: string; v: string; S: 'Buy'|'Sell' }>;
    levels?:  number;
    cvdWindow?: number;
  };

  if (msg.type === 'configure') {
    if (msg.cvdWindow) { CVD_WINDOW = msg.cvdWindow; cvdRing.resize(CVD_WINDOW); }
    return;
  }

  if (msg.type === 'reset') {
    bidsMap    = new Map();
    asksMap    = new Map();
    midPrice   = 0;
    cvdRunning = 0;
    cvdRing.clear();
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
    const bids = mapToLevels(bidsMap, false, levels);
    const asks = mapToLevels(asksMap, true,  levels);
    if (bids.length && asks.length) midPrice = (bids[0].price + asks[0].price) / 2;
    self.postMessage({ type: 'orderbook', bids, asks, mid: midPrice, ts: Date.now() });
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
      cvdRing.push({ time: t.time, cvd: cvdRunning });
    }
    self.postMessage({ type: 'trades', trades, cvdPoints: cvdRing.toArray() });
  }
};
