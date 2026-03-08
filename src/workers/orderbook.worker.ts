/**
 * orderbook.worker.ts — ZERØ ORDER BOOK v69
 *
 * v69: OKX replaces Coinbase
 *
 * Supports:
 *   - Bybit:   { type:'orderbook', exchange:'bybit',   msgType:'snapshot'|'delta', data:{b,a} }
 *   - Binance: { type:'orderbook', exchange:'binance', bids:[p,s][], asks:[p,s][] }
 *   - OKX:     { type:'orderbook', exchange:'okx', action:'snapshot'|'update', bids:[[p,s,_,_]], asks:... }
 *   - Trades bybit:   { type:'trades', exchange:'bybit',   trades:[] }
 *   - Trades binance: { type:'trades', exchange:'binance', trade:{T,p,q,m} }
 *   - Trades okx:     { type:'trades', exchange:'okx',     trades:[{tradeId,px,sz,side,ts}] }
 *   - Reset:   { type:'reset' }
 *   - Configure: { type:'configure', cvdWindow:number, levels:number }
 *
 * rgba() only ✓
 */

type PriceMap = Map<string, number>;

const WHALE_NOTIONAL = 100_000;
let CVD_WINDOW = 200;
let LEVELS     = 50;

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
  let cum = 0;
  return entries.slice(0, levels).map(([price, size]) => {
    cum += size;
    const notional = price * size;
    return { price, size, total: cum, notional, isWhale: notional >= WHALE_NOTIONAL };
  });
}

let bidsMap: PriceMap = new Map();
let asksMap: PriceMap = new Map();
let midPrice   = 0;
let cvdRunning = 0;
const cvdRing  = new RingBuffer<{ time: number; cvd: number }>(CVD_WINDOW);

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as Record<string, unknown>;

  if (msg.type === 'configure') {
    if (msg.cvdWindow) { CVD_WINDOW = msg.cvdWindow as number; cvdRing.resize(CVD_WINDOW); }
    if (msg.levels)    LEVELS = msg.levels as number;
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

  if (msg.type === 'orderbook') {
    const exchange = msg.exchange as string;
    const levels   = (msg.levels as number | undefined) ?? LEVELS;

    if (exchange === 'bybit') {
      const d = msg.data as { b: [string,string][]; a: [string,string][] } | undefined;
      if (!d) return;
      if (msg.msgType === 'snapshot') {
        bidsMap = new Map(d.b.map(([p, s]) => [p, parseFloat(s)]));
        asksMap = new Map(d.a.map(([p, s]) => [p, parseFloat(s)]));
      } else {
        applyDelta(bidsMap, d.b);
        applyDelta(asksMap, d.a);
      }

    } else if (exchange === 'binance') {
      const bids = (msg.bids as [string,string][]) ?? [];
      const asks = (msg.asks as [string,string][]) ?? [];
      if (bids.length > 0 || asks.length > 0) {
        bidsMap = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
        asksMap = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
      }

    } else if (exchange === 'okx') {
      // OKX: bids/asks are [[price, size, liquidated, orders], ...]
      const action = (msg.action as string) ?? 'update';
      const bids   = (msg.bids as [string,string,string,string][]) ?? [];
      const asks   = (msg.asks as [string,string,string,string][]) ?? [];
      if (action === 'snapshot') {
        bidsMap = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
        asksMap = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
      } else {
        applyDelta(bidsMap, bids.map(([p, s]) => [p, s] as [string, string]));
        applyDelta(asksMap, asks.map(([p, s]) => [p, s] as [string, string]));
      }
    }

    const bidsOut = mapToLevels(bidsMap, false, levels);
    const asksOut = mapToLevels(asksMap, true,  levels);
    if (bidsOut.length && asksOut.length) midPrice = (bidsOut[0].price + asksOut[0].price) / 2;
    self.postMessage({ type: 'orderbook', bids: bidsOut, asks: asksOut, mid: midPrice, ts: Date.now() });
    return;
  }

  if (msg.type === 'trades') {
    const exchange = msg.exchange as string;
    let trades: Array<{ id: string; time: number; price: number; size: number; isBuyerMaker: boolean }> = [];

    if (exchange === 'bybit') {
      const raw = (msg.trades as Array<{ i: string; T: number; p: string; v: string; S: 'Buy'|'Sell' }>) ?? [];
      trades = raw.map((d, idx) => ({
        id:           d.i + '_' + idx,
        time:         d.T,
        price:        parseFloat(d.p),
        size:         parseFloat(d.v),
        isBuyerMaker: d.S === 'Sell',
      }));

    } else if (exchange === 'binance') {
      const d = msg.trade as { T: number; p: string; q: string; m: boolean } | undefined;
      if (d) {
        trades = [{
          id:           String(Date.now()),
          time:         d.T,
          price:        parseFloat(d.p),
          size:         parseFloat(d.q),
          isBuyerMaker: d.m,
        }];
      }

    } else if (exchange === 'okx') {
      const raw = (msg.trades as Array<{ tradeId: string; px: string; sz: string; side: string; ts: string }>) ?? [];
      trades = raw.map((d) => ({
        id:           d.tradeId,
        time:         parseInt(d.ts),
        price:        parseFloat(d.px),
        size:         parseFloat(d.sz),
        isBuyerMaker: d.side === 'sell',
      }));
    }

    for (const t of trades) {
      cvdRunning += t.isBuyerMaker ? -t.size : t.size;
      cvdRing.push({ time: t.time, cvd: cvdRunning });
    }

    self.postMessage({ type: 'trades', trades, cvdPoints: cvdRing.toArray() });
  }
};
