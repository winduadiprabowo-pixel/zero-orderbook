/**
 * circularBuffer.ts — ZERØ ORDER BOOK v51
 * O(1) push — replaces cvdHist.shift() O(n) pattern
 */
export class CircularBuffer<T> {
  private buf: T[];
  private idx  = 0;
  private full = false;

  constructor(private cap: number) {
    this.buf = new Array<T>(cap);
  }

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

  clear(): void {
    this.buf  = new Array<T>(this.cap);
    this.idx  = 0;
    this.full = false;
  }

  get length(): number { return this.full ? this.cap : this.idx; }
}
