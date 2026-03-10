/**
 * orderbook.worker.ts — ZERØ ORDER BOOK v82
 *
 * PERF OVERHAUL:
 *   1. Number keys on PriceMap — zero parseFloat on hot path
 *   2. Throttled postMessage ~16ms — skip if top-of-book hash unchanged
 *   3. Trades batched per tick — 1 postMessage per flush vs per trade
 *   4. For-loop replaces forEach on hot paths — V8 JIT friendly
 *   5. Snapshot uses direct Map construction — no intermediate array
 *
 * rgba() only ✓
 */

type PriceMap = Map<number, number>;

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
  for (let i = 0; i < updates.length; i++) {
    const price = +updates[i][0];
    const size  = +updates[i][1];
    if (size === 0) map.delete(price);
    else            map.set(price, size);
  }
}

function mapToLevels(map: PriceMap, isAsk: boolean, levels: number) {
  const pairs: [number, number][] = [];
  map.forEach((size, price) => pairs.push([price, size]));
  pairs.sort(isAsk ? (a, b) => a[0] - b[0] : (a, b) => b[0] - a[0]);
  let cum = 0;
  const n   = Math.min(pairs.length, levels);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [price, size] = pairs[i];
    cum += size;
    const notional = price * size;
    out.push({ price, size, total: cum, notional, isWhale: notional >= WHALE_NOTIONAL });
  }
  return out;
}

let bidsMap: PriceMap = new Map();
let asksMap: PriceMap = new Map();
let midPrice   = 0;
let cvdRunning = 0;
const cvdRing  = new RingBuffer<{ time: number; cvd: number }>(CVD_WINDOW);

// ── Throttle: ~16ms OB flush + hash guard ────────────────────────────────────
let _obDirty      = false;
let _obTimerId    = 0;
let _lastObHash   = '';
let _tradesBatch: Array<{ id: string; time: number; price: number; size: number; isBuyerMaker: boolean }> = [];
let _tradesTimerId = 0;

function scheduleObFlush(): void {
  if (_obDirty) return;
  _obDirty = true;
  _obTimerId = setTimeout(flushOb, 16) as unknown as number;
}

function flushOb(): void {
  _obDirty = false;
  const bidsOut = mapToLevels(bidsMap, false, LEVELS);
  const asksOut = mapToLevels(asksMap, true,  LEVELS);
  if (!bidsOut.length || !asksOut.length) return;
  const newHash = `${bidsOut[0].price}|${asksOut[0].price}|${bidsOut[0].size}|${asksOut[0].size}`;
  if (newHash === _lastObHash) return;
  _lastObHash = newHash;
  midPrice = (bidsOut[0].price + asksOut[0].price) / 2;
  self.postMessage({ type: 'orderbook', bids: bidsOut, asks: asksOut, mid: midPrice, ts: Date.now() });
}

function scheduleTradesFlush(): void {
  if (_tradesTimerId) return;
  _tradesTimerId = setTimeout(flushTrades, 16) as unknown as number;
}

function flushTrades(): void {
  _tradesTimerId = 0;
  if (!_tradesBatch.length) return;
  const trades = _tradesBatch.splice(0);
  self.postMessage({ type: 'trades', trades, cvdPoints: cvdRing.toArray() });
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as Record<string, unknown>;

  if (msg.type === 'configure') {
    if (msg.cvdWindow) { CVD_WINDOW = msg.cvdWindow as number; cvdRing.resize(CVD_WINDOW); }
    if (msg.levels)    LEVELS = msg.levels as number;
    return;
  }

  if (msg.type === 'reset') {
    bidsMap = new Map(); asksMap = new Map();
    midPrice = 0; cvdRunning = 0; cvdRing.clear();
    _lastObHash = ''; _obDirty = false; _tradesBatch = [];
    clearTimeout(_obTimerId); clearTimeout(_tradesTimerId);
    _tradesTimerId = 0;
    return;
  }

  if (msg.type === 'orderbook') {
    const exchange = msg.exchange as string;

    if (exchange === 'bybit') {
      const d = msg.data as { b: [string,string][]; a: [string,string][] } | undefined;
      if (!d) return;
      if (msg.msgType === 'snapshot') {
        bidsMap = new Map(); asksMap = new Map();
        for (let i = 0; i < d.b.length; i++) bidsMap.set(+d.b[i][0], +d.b[i][1]);
        for (let i = 0; i < d.a.length; i++) asksMap.set(+d.a[i][0], +d.a[i][1]);
      } else {
        applyDelta(bidsMap, d.b);
        applyDelta(asksMap, d.a);
      }
    } else if (exchange === 'binance') {
      const bids = (msg.bids as [string,string][]) ?? [];
      const asks = (msg.asks as [string,string][]) ?? [];
      if (bids.length || asks.length) {
        bidsMap = new Map(); asksMap = new Map();
        for (let i = 0; i < bids.length; i++) bidsMap.set(+bids[i][0], +bids[i][1]);
        for (let i = 0; i < asks.length; i++) asksMap.set(+asks[i][0], +asks[i][1]);
      }
    } else if (exchange === 'okx') {
      const action = (msg.action as string) ?? 'update';
      const bids   = (msg.bids as [string,string,string,string][]) ?? [];
      const asks   = (msg.asks as [string,string,string,string][]) ?? [];
      const isEmpty = bidsMap.size === 0 && asksMap.size === 0;
      if (action === 'snapshot' || isEmpty) {
        bidsMap = new Map(); asksMap = new Map();
        for (let i = 0; i < bids.length; i++) bidsMap.set(+bids[i][0], +bids[i][1]);
        for (let i = 0; i < asks.length; i++) asksMap.set(+asks[i][0], +asks[i][1]);
      } else {
        applyDelta(bidsMap, bids.map(([p, s]) => [p, s]));
        applyDelta(asksMap, asks.map(([p, s]) => [p, s]));
      }
    }

    scheduleObFlush();
    return;
  }

  if (msg.type === 'trades') {
    const exchange = msg.exchange as string;

    if (exchange === 'bybit') {
      const raw = (msg.trades as Array<{ i: string; T: number; p: string; v: string; S: 'Buy'|'Sell' }>) ?? [];
      for (let i = 0; i < raw.length; i++) {
        const d = raw[i]; const size = +d.v;
        cvdRunning += d.S === 'Sell' ? -size : size;
        cvdRing.push({ time: d.T, cvd: cvdRunning });
        _tradesBatch.push({ id: d.i, time: d.T, price: +d.p, size, isBuyerMaker: d.S === 'Sell' });
      }
    } else if (exchange === 'binance') {
      const d = msg.trade as { T: number; p: string; q: string; m: boolean } | undefined;
      if (d) {
        const size = +d.q;
        cvdRunning += d.m ? -size : size;
        cvdRing.push({ time: d.T, cvd: cvdRunning });
        _tradesBatch.push({ id: String(d.T), time: d.T, price: +d.p, size, isBuyerMaker: d.m });
      }
    } else if (exchange === 'okx') {
      const raw = (msg.trades as Array<{ tradeId: string; px: string; sz: string; side: string; ts: string }>) ?? [];
      for (let i = 0; i < raw.length; i++) {
        const d = raw[i]; const size = +d.sz; const time = +d.ts;
        cvdRunning += d.side === 'sell' ? -size : size;
        cvdRing.push({ time, cvd: cvdRunning });
        _tradesBatch.push({ id: d.tradeId, time, price: +d.px, size, isBuyerMaker: d.side === 'sell' });
      }
    }

    scheduleTradesFlush();
  }
};
