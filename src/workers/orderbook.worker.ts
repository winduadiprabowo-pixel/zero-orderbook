/**
 * orderbook.worker.ts — ZERØ ORDER BOOK v68
 *
 * v68: WIRED to useMultiExchangeWs — off-main-thread parsing for all 3 exchanges
 *
 * Supports:
 *   - Bybit:   { type:'orderbook', exchange:'bybit',   msgType:'snapshot'|'delta', data:{b,a} }
 *   - Binance: { type:'orderbook', exchange:'binance', bids:[p,s][], asks:[p,s][] }
 *   - Coinbase:{ type:'orderbook', exchange:'coinbase', cbType:'snapshot'|'l2update', changes?, bids?, asks? }
 *   - Trades:  { type:'trades', exchange:'bybit'|'binance'|'coinbase', trades:[] }
 *   - Reset:   { type:'reset' }
 *   - Configure: { type:'configure', cvdWindow:number, levels:number }
 *
 * Main thread: WS recv → postMessage to worker → worker parses → postMessage back → setState
 * Zero jank on main thread. rgba() only ✓
 */

type PriceMap = Map<string, number>;

const WHALE_NOTIONAL = 100_000;
let CVD_WINDOW = 200;
let LEVELS     = 50;

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
  let cum = 0;
  return entries.slice(0, levels).map(([price, size]) => {
    cum += size;
    const notional = price * size;
    return { price, size, total: cum, notional, isWhale: notional >= WHALE_NOTIONAL };
  });
}

// ── State ─────────────────────────────────────────────────────────────────────
let bidsMap: PriceMap = new Map();
let asksMap: PriceMap = new Map();
let midPrice = 0;
let cvdRunning = 0;
const cvdRing = new RingBuffer<{ time: number; cvd: number }>(CVD_WINDOW);

// ── Message handler ───────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const msg = e.data as Record<string, unknown>;

  // ── Configure ──────────────────────────────────────────────────────────────
  if (msg.type === 'configure') {
    if (msg.cvdWindow) { CVD_WINDOW = msg.cvdWindow as number; cvdRing.resize(CVD_WINDOW); }
    if (msg.levels)    LEVELS = msg.levels as number;
    return;
  }

  // ── Reset on symbol/exchange switch ────────────────────────────────────────
  if (msg.type === 'reset') {
    bidsMap    = new Map();
    asksMap    = new Map();
    midPrice   = 0;
    cvdRunning = 0;
    cvdRing.clear();
    return;
  }

  // ── Orderbook parsing — per exchange format ────────────────────────────────
  if (msg.type === 'orderbook') {
    const exchange = msg.exchange as string;
    const levels   = (msg.levels as number | undefined) ?? LEVELS;

    if (exchange === 'bybit') {
      // Bybit: { msgType:'snapshot'|'delta', data:{ b:[p,s][], a:[p,s][] } }
      const d = msg.data as { b: [string,string][]; a: [string,string][] } | undefined;
      if (!d) return;
      if (msg.msgType === 'snapshot') {
        bidsMap = new Map(d.b.map(([p, s]) => [p, parseFloat(s)]));
        asksMap = new Map(d.a.map(([p, s]) => [p, parseFloat(s)]));
      } else if (msg.msgType === 'delta') {
        applyDelta(bidsMap, d.b);
        applyDelta(asksMap, d.a);
      }

    } else if (exchange === 'binance') {
      // Binance depth20@100ms: always full snapshot — bids/asks arrays
      const bids = (msg.bids as [string,string][]) ?? [];
      const asks = (msg.asks as [string,string][]) ?? [];
      if (bids.length > 0 || asks.length > 0) {
        bidsMap = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
        asksMap = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
      }

    } else if (exchange === 'coinbase') {
      // Coinbase: snapshot (bids/asks arrays) or l2update (changes array)
      const cbType = msg.cbType as string;
      if (cbType === 'snapshot') {
        const bids = (msg.bids as [string,string][]) ?? [];
        const asks = (msg.asks as [string,string][]) ?? [];
        bidsMap = new Map(bids.map(([p, s]) => [p, parseFloat(s)]));
        asksMap = new Map(asks.map(([p, s]) => [p, parseFloat(s)]));
      } else if (cbType === 'l2update') {
        const changes = (msg.changes as [string,string,string][]) ?? [];
        for (const [side, price, size] of changes) {
          if (side === 'buy')  applyDelta(bidsMap, [[price, size]]);
          if (side === 'sell') applyDelta(asksMap, [[price, size]]);
        }
      }
    }

    const bids = mapToLevels(bidsMap, false, levels);
    const asks = mapToLevels(asksMap, true,  levels);
    if (bids.length && asks.length) midPrice = (bids[0].price + asks[0].price) / 2;
    self.postMessage({ type: 'orderbook', bids, asks, mid: midPrice, ts: Date.now() });
    return;
  }

  // ── Trades + CVD — per exchange ────────────────────────────────────────────
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
      // Binance single trade from @trade stream
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
    }
    // Coinbase: no trade stream in level2 channel — trades come from ticker if available
    // skip for now, CVD still works from bybit/binance

    for (const t of trades) {
      cvdRunning += t.isBuyerMaker ? -t.size : t.size;
      cvdRing.push({ time: t.time, cvd: cvdRunning });
    }

    self.postMessage({ type: 'trades', trades, cvdPoints: cvdRing.toArray() });
  }
};
