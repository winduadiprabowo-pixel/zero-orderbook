// OrderBook.tsx — v83 FIX
//
// FIXES vs v82:
//  ✓ [1] Kolom PRICE/SIZE/TOTAL tidak dempet — ganti flex+minWidth ke CSS grid ratio
//  ✓ [2] CSS grid 42%/30%/28% — no overlap di layar 360px manapun
//  ✓ [3] ROW_H 18→22 — IBM Plex Mono butuh breathing room
//  ✓ [4] AsksPanel + VirtualList pakai ResizeObserver — no hardcoded 180px
//  ✓ [5] fontSize 11px→10.5px — muat di layar sempit
//  ✓ [6] padding 0 8px → 0 10px — simetris
//  ✓ [7] ColHeader pakai grid yang sama — header align sempurna dengan rows
//  ✓ [8] tabular-nums + letterSpacing -0.01em — angka tidak bergeser-geser
//
// rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓

import React, {
  useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo, memo,
} from 'react';
import type { OrderBookLevel, Precision } from '@/types/market';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessedLevel {
  price:  number;
  size:   number;
  total:  number;
  pct:    number;
}

interface OrderBookProps {
  bids:               OrderBookLevel[];
  asks:               OrderBookLevel[];
  midPrice?:          number | null;
  prevMidPrice?:      number | null;
  precision?:         Precision;
  onPrecisionChange?: (p: Precision) => void;
  precisionOptions?:  Precision[];
  levels?:            number;
  compact?:           boolean;
  onPriceHover?:      (price: number | null) => void;
  onPriceCopy?:       (price: number) => void;
  className?:         string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H    = 22;   // FIX v83: was 18 — IBM Plex Mono 10.5px butuh min 22px
const OVERSCAN = 3;

const BID_BAR   = 'rgba(0,205,115,0.09)';
const ASK_BAR   = 'rgba(255,60,82,0.09)';
const BID_PRICE = 'rgba(0,205,115,1)';
const ASK_PRICE = 'rgba(255,60,82,1)';
const SIZE_CLR  = 'rgba(130,148,175,0.90)';
const TOT_CLR   = 'rgba(72,88,112,0.80)';

// FIX v83: CSS grid columns — PRICE 42% | SIZE 30% | TOTAL 28%
// Percentage-based = never overflow regardless of screen width
const GRID_COLS = '42% 30% 28%';

// ─── processLevels ────────────────────────────────────────────────────────────

function processLevels(raw: OrderBookLevel[], maxRows: number): ProcessedLevel[] {
  const n   = Math.min(raw.length, maxRows);
  const out = new Array<ProcessedLevel>(n);
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += raw[i].size;
    out[i] = { price: raw[i].price, size: raw[i].size, total: cum, pct: 0 };
  }
  const maxCum = cum || 1;
  for (let i = 0; i < n; i++) out[i].pct = (out[i].total / maxCum) * 100;
  return out;
}

// ─── Hash guard ───────────────────────────────────────────────────────────────

function obHash(levels: ProcessedLevel[]): string {
  let h = '';
  const n = Math.min(levels.length, 3);
  for (let i = 0; i < n; i++) h += `${levels[i].price}:${levels[i].size}|`;
  return h;
}

// ─── OBRow ────────────────────────────────────────────────────────────────────

interface RowProps {
  level:    ProcessedLevel;
  side:     'bid' | 'ask';
  priceDec: number;
  sizeDec:  number;
  onHover?: (price: number | null) => void;
  onCopy?:  (price: number) => void;
}

// FIX v83: display:grid replaces flex+minWidth
const ROW_BASE: React.CSSProperties = {
  position:            'relative',
  height:              ROW_H,
  display:             'grid',
  gridTemplateColumns: GRID_COLS,
  alignItems:          'center',
  padding:             '0 10px',
  fontFamily:          'IBM Plex Mono, monospace',
  fontSize:            '10.5px',
  lineHeight:          `${ROW_H}px`,
  overflow:            'hidden',
  fontVariantNumeric:  'tabular-nums',
  letterSpacing:       '-0.01em',
};

const OBRow = memo(function OBRow({ level, side, priceDec, sizeDec, onHover, onCopy }: RowProps) {
  OBRow.displayName = 'OBRow';
  const isBid = side === 'bid';

  const hoverRef  = useRef(onHover);
  const copyRef   = useRef(onCopy);
  const priceRef  = useRef(level.price);
  hoverRef.current  = onHover;
  copyRef.current   = onCopy;
  priceRef.current  = level.price;

  const handleEnter = useCallback(() => hoverRef.current?.(priceRef.current), []);
  const handleLeave = useCallback(() => hoverRef.current?.(null), []);
  const handleClick = useCallback(() => copyRef.current?.(priceRef.current), []);

  const rowStyle = useMemo<React.CSSProperties>(() => ({
    ...ROW_BASE,
    cursor: onCopy ? 'pointer' : 'default',
  }), [onCopy]);

  const barStyle = useMemo<React.CSSProperties>(() => ({
    position:      'absolute',
    top:           0,
    [isBid ? 'right' : 'left']: 0,
    width:         `${level.pct}%`,
    height:        '100%',
    background:    isBid ? BID_BAR : ASK_BAR,
    pointerEvents: 'none',
  }), [isBid, level.pct]);

  return (
    <div
      style={rowStyle}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div style={barStyle} />
      {/* Col 1: PRICE — left aligned */}
      <span style={{
        color:        isBid ? BID_PRICE : ASK_PRICE,
        zIndex:       1,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {level.price.toFixed(priceDec)}
      </span>
      {/* Col 2: SIZE — right aligned */}
      <span style={{
        color:        SIZE_CLR,
        zIndex:       1,
        textAlign:    'right',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {level.size.toFixed(sizeDec)}
      </span>
      {/* Col 3: TOTAL — right aligned */}
      <span style={{
        color:        TOT_CLR,
        zIndex:       1,
        textAlign:    'right',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {level.total.toFixed(sizeDec)}
      </span>
    </div>
  );
});

// ─── VirtualList ──────────────────────────────────────────────────────────────

interface VirtualListProps {
  levels:   ProcessedLevel[];
  side:     'bid' | 'ask';
  height:   number;
  priceDec: number;
  sizeDec:  number;
  onHover?: (price: number | null) => void;
  onCopy?:  (price: number) => void;
}

const VirtualList = memo(function VirtualList({
  levels, side, height, priceDec, sizeDec, onHover, onCopy,
}: VirtualListProps) {
  VirtualList.displayName = 'VirtualList';

  const scrollRef    = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const prevRowRef   = useRef(-1);
  const [, forceUpdate] = useState(0);

  const onScroll = useCallback(() => {
    const st = scrollRef.current?.scrollTop ?? 0;
    scrollTopRef.current = st;
    const row = Math.floor(st / ROW_H);
    if (row !== prevRowRef.current) {
      prevRowRef.current = row;
      forceUpdate(v => v + 1);
    }
  }, []);

  const totalH   = levels.length * ROW_H;
  const st       = scrollTopRef.current;
  const startIdx = Math.max(0, Math.floor(st / ROW_H) - OVERSCAN);
  const endIdx   = Math.min(levels.length - 1, Math.ceil((st + height) / ROW_H) + OVERSCAN);
  const visible  = useMemo(() => levels.slice(startIdx, endIdx + 1), [levels, startIdx, endIdx]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{ height, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none' as const, position: 'relative' }}
    >
      <div style={{ height: totalH, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIdx * ROW_H, width: '100%' }}>
          {visible.map((lvl) => (
            <OBRow
              key={`${lvl.price}-${startIdx + visible.indexOf(lvl)}`}
              level={lvl}
              side={side}
              priceDec={priceDec}
              sizeDec={sizeDec}
              onHover={onHover}
              onCopy={onCopy}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ─── AsksPanel ────────────────────────────────────────────────────────────────

interface AsksPanelProps {
  levels:   ProcessedLevel[];
  height:   number;
  priceDec: number;
  sizeDec:  number;
  onHover?: (price: number | null) => void;
  onCopy?:  (price: number) => void;
}

const AsksPanel = memo(function AsksPanel({
  levels, height, priceDec, sizeDec, onHover, onCopy,
}: AsksPanelProps) {
  AsksPanel.displayName = 'AsksPanel';
  const scrollRef        = useRef<HTMLDivElement>(null);
  const userScrolledRef  = useRef(false); // v86: don't override manual scroll

  // Auto-scroll to bottom only when user hasn't manually scrolled
  useLayoutEffect(() => {
    if (userScrolledRef.current) return;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [levels]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // If user scrolls up more than 40px from bottom → they want to see levels
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledRef.current = distFromBottom > 40;
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        height, overflowY: 'auto', overflowX: 'hidden',
        scrollbarWidth: 'none' as const,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      {levels.map((lvl, i) => (
        <OBRow
          key={`${lvl.price}-${i}`}
          level={lvl}
          side="ask"
          priceDec={priceDec}
          sizeDec={sizeDec}
          onHover={onHover}
          onCopy={onCopy}
        />
      ))}
    </div>
  );
});

// ─── SpreadRow ────────────────────────────────────────────────────────────────

const SpreadRow = memo(function SpreadRow({
  bestBid, bestAsk, priceDec, midPrice, prevMidPrice,
}: { bestBid: number; bestAsk: number; priceDec: number; midPrice?: number | null; prevMidPrice?: number | null }) {
  SpreadRow.displayName = 'SpreadRow';
  const spread    = bestAsk - bestBid;
  // v86: guard crossed book (spread ≤ 0 during reconnect/delta lag)
  const spreadPct = bestBid > 0 && spread > 0 ? ((spread / bestBid) * 100).toFixed(3) : '—';
  const displayMid = midPrice ?? (bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : null);
  const isUp      = prevMidPrice != null && displayMid != null ? displayMid >= prevMidPrice : null;
  const midColor  = isUp === true ? BID_PRICE : isUp === false ? ASK_PRICE : 'rgba(220,220,240,1)';
  const arrow     = isUp === true ? '▲' : isUp === false ? '▼' : '';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '3px 10px',
      borderTop:    '1px solid rgba(255,255,255,0.05)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      fontFamily:   'IBM Plex Mono, monospace',
      background:   'rgba(255,255,255,0.015)',
      flexShrink:   0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {arrow && <span style={{ color: midColor, fontSize: '9px' }}>{arrow}</span>}
        <span style={{
          color:              midColor,
          fontSize:           '13px',
          fontWeight:         800,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing:      '-0.01em',
        }}>
          {displayMid ? displayMid.toFixed(priceDec) : '—'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', color: 'rgba(120,120,140,0.7)' }}>SPREAD</span>
        <span style={{ fontSize: '10px', color: SIZE_CLR, fontVariantNumeric: 'tabular-nums' }}>
          {spread > 0 ? spread.toFixed(priceDec) : '—'}
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(120,120,140,0.5)' }}>({spreadPct}%)</span>
      </div>
    </div>
  );
});

// ─── ColHeader ────────────────────────────────────────────────────────────────
// FIX v83: display:grid with same GRID_COLS — header perfectly aligns with rows

const ColHeader = memo(function ColHeader({
  precision, precisionOptions, onPrecisionChange,
}: {
  precision?:         Precision;
  precisionOptions?:  Precision[];
  onPrecisionChange?: (p: Precision) => void;
}) {
  ColHeader.displayName = 'ColHeader';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggleOpen = useCallback(() => setOpen(v => !v), []);

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: GRID_COLS,
      alignItems:          'center',
      padding:             '4px 10px',
      fontFamily:          'IBM Plex Mono, monospace',
      fontSize:            '9px',
      color:               'rgba(120,120,140,0.7)',
      borderBottom:        '1px solid rgba(255,255,255,0.05)',
      userSelect:          'none',
      flexShrink:          0,
    }}>
      <span>PRICE</span>
      <span style={{ textAlign: 'right' }}>SIZE</span>
      <div ref={ref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', position: 'relative' }}>
        <span>TOTAL</span>
        {precision && precisionOptions && onPrecisionChange && (
          <>
            <button
              style={{
                background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
                fontFamily: 'IBM Plex Mono, monospace', fontSize: '8px',
                color: 'rgba(200,200,210,0.8)', padding: '1px 5px', borderRadius: '2px',
                flexShrink: 0,
              }}
              onClick={toggleOpen}
            >
              {precision}
            </button>
            {open && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 2px)',
                background: 'rgba(18,21,32,0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px', padding: '3px',
                display: 'flex', flexDirection: 'column', gap: '1px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.6)', minWidth: '72px', zIndex: 1200,
              }}>
                {precisionOptions.map((p) => (
                  <button
                    key={p}
                    style={{
                      background: p === precision ? 'rgba(242,142,44,0.14)' : 'transparent',
                      color:      p === precision ? 'rgba(242,142,44,1)'    : 'rgba(200,200,210,0.7)',
                      border: 'none', cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono, monospace', fontSize: '9px',
                      padding: '3px 8px', borderRadius: '2px', textAlign: 'left',
                    }}
                    onClick={() => { onPrecisionChange(p); setOpen(false); }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

// ─── PressureBar ──────────────────────────────────────────────────────────────

export const PressureBar = memo(function PressureBar({ bidPercent }: { bidPercent: number }) {
  PressureBar.displayName = 'PressureBar';
  const askPercent = 100 - bidPercent;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(10,11,20,1)',
      fontFamily: 'IBM Plex Mono, monospace', fontSize: '9px',
      flexShrink: 0,
    }}>
      <span style={{ color: 'rgba(38,166,154,0.85)', minWidth: '34px' }}>
        {bidPercent.toFixed(1)}%
      </span>
      <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          width: `${bidPercent}%`, height: '100%',
          background: 'linear-gradient(90deg, rgba(38,166,154,0.8), rgba(38,166,154,0.5))',
          borderRadius: '3px', transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ color: 'rgba(239,83,80,0.85)', minWidth: '34px', textAlign: 'right' }}>
        {askPercent.toFixed(1)}%
      </span>
    </div>
  );
});

// ─── Main OrderBook ───────────────────────────────────────────────────────────
// FIX v83: Responsive height via ResizeObserver on flex wrappers.
// AsksPanel + VirtualList each sit in a flex:1/minHeight:0 div.
// ResizeObserver measures actual pixel height and passes to the scroll containers.
// This replaces the old hardcoded listH = compact ? 140 : 180.

const OrderBook = memo(function OrderBook({
  bids, asks,
  midPrice, prevMidPrice,
  precision, onPrecisionChange, precisionOptions,
  levels    = 50,
  compact   = false,
  onPriceHover,
  onPriceCopy,
}: OrderBookProps) {
  OrderBook.displayName = 'OrderBook';

  const priceDec = useMemo(() => {
    if (!precision) return 2;
    const p = parseFloat(precision);
    if (p >= 1) return 0;
    return precision.split('.')[1]?.length ?? 2;
  }, [precision]);

  const sizeDec = 4;

  // ── RAF double-buffer + hash guard ────────────────────────────────────────
  const pendingBids = useRef<OrderBookLevel[]>(bids);
  const pendingAsks = useRef<OrderBookLevel[]>(asks);
  const rafRef      = useRef<number>(0);
  const prevHashRef = useRef('');

  const [proc, setProc] = useState<{ bids: ProcessedLevel[]; asks: ProcessedLevel[] }>(() => ({
    bids: processLevels(bids, levels),
    asks: processLevels(asks, levels),
  }));

  const flush = useCallback(() => {
    const newBids = processLevels(pendingBids.current, levels);
    const newAsks = processLevels(pendingAsks.current, levels);
    const newHash = obHash(newBids) + '|' + obHash(newAsks);
    if (newHash === prevHashRef.current) return;
    prevHashRef.current = newHash;
    setProc({ bids: newBids, asks: newAsks });
  }, [levels]);

  useEffect(() => {
    pendingBids.current = bids;
    pendingAsks.current = asks;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bids, asks, flush]);

  const bestBid = proc.bids[0]?.price ?? 0;
  const bestAsk = proc.asks[0]?.price ?? 0;

  // FIX v83: measure actual height of flex wrappers via ResizeObserver
  const asksWrapRef = useRef<HTMLDivElement>(null);
  const bidsWrapRef = useRef<HTMLDivElement>(null);
  const fallback    = compact ? 130 : 160;
  const [asksH, setAsksH] = useState(fallback);
  const [bidsH, setBidsH] = useState(fallback);

  useEffect(() => {
    const asksEl = asksWrapRef.current;
    const bidsEl = bidsWrapRef.current;
    if (!asksEl || !bidsEl) return;
    const ro = new ResizeObserver(() => {
      if (asksEl.clientHeight > 0) setAsksH(asksEl.clientHeight);
      if (bidsEl.clientHeight > 0) setBidsH(bidsEl.clientHeight);
    });
    ro.observe(asksEl);
    ro.observe(bidsEl);
    // immediate measure on mount
    if (asksEl.clientHeight > 0) setAsksH(asksEl.clientHeight);
    if (bidsEl.clientHeight > 0) setBidsH(bidsEl.clientHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'rgba(10,10,14,1)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'IBM Plex Mono, monospace',
      overflow: 'hidden',
    }}>
      <ColHeader
        precision={precision}
        precisionOptions={precisionOptions}
        onPrecisionChange={onPrecisionChange}
      />

      {/* FIX v83: flex:1 wrapper → asks fills half the available space */}
      <div ref={asksWrapRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <AsksPanel
          levels={proc.asks}
          height={asksH}
          priceDec={priceDec}
          sizeDec={sizeDec}
          onHover={onPriceHover}
          onCopy={onPriceCopy}
        />
      </div>

      <SpreadRow
        bestBid={bestBid}
        bestAsk={bestAsk}
        priceDec={priceDec}
        midPrice={midPrice}
        prevMidPrice={prevMidPrice}
      />

      {/* FIX v83: flex:1 wrapper → bids fills the other half */}
      <div ref={bidsWrapRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <VirtualList
          levels={proc.bids}
          side="bid"
          height={bidsH}
          priceDec={priceDec}
          sizeDec={sizeDec}
          onHover={onPriceHover}
          onCopy={onPriceCopy}
        />
      </div>
    </div>
  );
});

export default OrderBook;
