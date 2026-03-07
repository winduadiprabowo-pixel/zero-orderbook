/**
 * OrderBook.tsx — ZERØ ORDER BOOK v60
 * FIX: Ask side terpotong — both ask/bid containers now flex:1 + minHeight:0
 * heatmap intensity, electric colors, virtual list, flash via DOM classList
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import type { Precision } from '@/types/market';
import type { OrderBookLevel2 } from '@/hooks/useOrderBook';
import { formatSize } from '@/lib/formatters';

const ROW_H = 18; // px — fixed row height for virtual list

function precisionToDecimals(p: string): number {
  const stripped = p.replace(/0+$/, '');
  const dotIdx   = stripped.indexOf('.');
  return dotIdx === -1 ? 0 : stripped.length - dotIdx - 1;
}

interface OrderBookProps {
  bids:              OrderBookLevel2[];
  asks:              OrderBookLevel2[];
  midPrice:          number | null;
  prevMidPrice:      number | null;
  precision:         Precision;
  onPrecisionChange: (p: Precision) => void;
  precisionOptions?: Precision[];
  compact?:          boolean;
  levels?:           number;
}

const DEFAULT_PRECISION_OPTIONS: Precision[] = ['0.1', '0.01', '0.001'];

// ── Virtual scroll container ──────────────────────────────────────────────────

interface VirtualListProps {
  rows:      OrderBookLevel2[];
  side:      'bid' | 'ask';
  maxTotal:  number;
  maxSize:   number;
  decimals:  number;
  compact:   boolean;
  /** asks list: flex-end so bottom-anchored (nearest spread at bottom) */
  justify?:  'flex-end' | 'flex-start';
}

const VirtualList: React.FC<VirtualListProps> = React.memo(({
  rows, side, maxTotal, maxSize, decimals, compact, justify = 'flex-start',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight]       = useState(200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
  }, []);

  const totalH    = rows.length * ROW_H;
  const startIdx  = Math.max(0, Math.floor(scrollTop / ROW_H) - 2);
  const visible   = Math.ceil(height / ROW_H) + 4;
  const endIdx    = Math.min(rows.length, startIdx + visible);
  const offsetTop = startIdx * ROW_H;

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{
        // v60 FIX: flex:1 + minHeight:0 ensures equal split for both ask and bid
        flex: 1, minHeight: 0,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        justifyContent: justify,
      }}
      className="hide-scrollbar"
    >
      <div style={{ height: totalH, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0 }}>
          {rows.slice(startIdx, endIdx).map((level, i) => (
            <OrderRow
              key={side + '-' + level.price}
              level={level}
              side={side}
              maxTotal={maxTotal}
              maxSize={maxSize}
              decimals={decimals}
              compact={compact}
              rank={startIdx + i + 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
VirtualList.displayName = 'VirtualList';

// ── Main OrderBook ────────────────────────────────────────────────────────────

const OrderBook: React.FC<OrderBookProps> = React.memo(({
  bids, asks, midPrice, prevMidPrice, precision, onPrecisionChange,
  precisionOptions = DEFAULT_PRECISION_OPTIONS,
  compact = false, levels = 20,
}) => {
  const displayAsks = useMemo(() => asks.slice(0, levels), [asks, levels]);
  const displayBids = useMemo(() => bids.slice(0, levels), [bids, levels]);

  const maxTotal = useMemo(() => {
    const a = displayAsks.length ? displayAsks[displayAsks.length - 1]?.total ?? 0 : 0;
    const b = displayBids.length ? displayBids[displayBids.length - 1]?.total ?? 0 : 0;
    return Math.max(a, b, 1);
  }, [displayAsks, displayBids]);

  // v58: heatmap — max individual size across all visible levels
  const maxSize = useMemo(() => {
    const allSizes = [...displayAsks, ...displayBids].map((l) => l.size);
    return Math.max(...allSizes, 1);
  }, [displayAsks, displayBids]);

  const midDirection = useMemo(() => {
    if (!midPrice || !prevMidPrice || midPrice === prevMidPrice) return 'neutral';
    return midPrice > prevMidPrice ? 'up' : 'down';
  }, [midPrice, prevMidPrice]);

  const decimals = useMemo(() => precisionToDecimals(precision), [precision]);

  const spread = useMemo(() => {
    if (!asks.length || !bids.length) return '--';
    return (asks[0].price - bids[0].price).toFixed(decimals);
  }, [asks, bids, decimals]);

  const bidPressure = useMemo(() => {
    const bv = bids.reduce((s, b) => s + b.size, 0);
    const av = asks.reduce((s, a) => s + a.size, 0);
    const t  = bv + av;
    return t > 0 ? (bv / t) * 100 : 50;
  }, [bids, asks]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(9,11,18,1)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: compact ? '5px 8px' : '6px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        background: 'rgba(9,11,18,1)',
      }}>
        <span className="label-sm">ORDER BOOK</span>
        <div style={{ display: 'flex', gap: '1px' }}>
          {precisionOptions.map((p) => (
            <button
              key={p}
              aria-label={'Precision ' + p}
              onClick={() => onPrecisionChange(p)}
              style={{
                padding: '2px 6px', fontSize: '8.5px', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
                borderRadius: '2px', border: 'none', transition: 'all 80ms',
                background: precision === p ? 'rgba(242,142,44,0.14)' : 'transparent',
                color:      precision === p ? 'rgba(242,142,44,1)'    : 'rgba(255,255,255,0.20)',
                letterSpacing: '0.04em',
              }}
            >{p}</button>
          ))}
        </div>
      </div>

      <ColHeader compact={compact} />

      {/* ASKS — reversed (lowest ask nearest spread), flex:1 half */}
      <VirtualList
        rows={[...displayAsks].reverse()}
        side="ask"
        maxTotal={maxTotal}
        maxSize={maxSize}
        decimals={decimals}
        compact={compact}
        justify="flex-end"
      />

      <MidPriceRow midPrice={midPrice} midDirection={midDirection} spread={spread} decimals={decimals} />

      {/* BIDS — flex:1 half */}
      <VirtualList
        rows={displayBids}
        side="bid"
        maxTotal={maxTotal}
        maxSize={maxSize}
        decimals={decimals}
        compact={compact}
      />

      <PressureBar bidPercent={bidPressure} />
    </div>
  );
});
OrderBook.displayName = 'OrderBook';

// ── ColHeader ─────────────────────────────────────────────────────────────────

const ColHeader: React.FC<{ compact: boolean }> = React.memo(({ compact }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: compact ? '1fr 1fr 1fr' : '20px 1fr 1fr 1fr',
    padding: compact ? '3px 8px' : '3px 10px', gap: '4px',
    borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0,
    background: 'rgba(14,17,26,1)',
  }}>
    {!compact && <span className="label-xs">#</span>}
    <span className="label-xs" style={{ textAlign: 'right' }}>PRICE</span>
    <span className="label-xs" style={{ textAlign: 'right' }}>SIZE</span>
    <span className="label-xs" style={{ textAlign: 'right' }}>TOTAL</span>
  </div>
));
ColHeader.displayName = 'ColHeader';

// ── MidPriceRow ───────────────────────────────────────────────────────────────

const MidPriceRow: React.FC<{
  midPrice: number | null; midDirection: 'up'|'down'|'neutral'; spread: string; decimals: number;
}> = React.memo(({ midPrice, midDirection, spread, decimals }) => {
  const color = midDirection === 'up' ? 'rgba(0,255,157,1)' : midDirection === 'down' ? 'rgba(255,59,92,1)' : 'rgba(255,255,255,0.88)';
  const bg    = midDirection === 'up' ? 'rgba(0,255,157,0.05)' : midDirection === 'down' ? 'rgba(255,59,92,0.05)' : 'rgba(255,255,255,0.015)';
  return (
    <div style={{
      padding: '5px 10px', background: bg, flexShrink: 0,
      borderTop: '1px solid rgba(255,255,255,0.055)',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      transition: 'background 300ms',
    }}>
      <span className="mono-num" style={{ fontSize: '15px', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {midDirection === 'up' ? '▲ ' : midDirection === 'down' ? '▼ ' : ''}
        {midPrice?.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) ?? '--'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
        <span className="label-xs">SPREAD</span>
        <span className="mono-num" style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.40)' }}>{spread}</span>
      </div>
    </div>
  );
});
MidPriceRow.displayName = 'MidPriceRow';

// ── OrderRow ──────────────────────────────────────────────────────────────────

interface OrderRowProps {
  rank: number; level: OrderBookLevel2; side: 'bid' | 'ask';
  maxTotal: number; maxSize: number; decimals: number; compact: boolean;
}

const OrderRow: React.FC<OrderRowProps> = React.memo(({
  rank, level, side, maxTotal, maxSize, decimals, compact,
}) => {
  const rowRef      = useRef<HTMLDivElement>(null);
  const prevSizeRef = useRef(level.size);
  const timerRef    = useRef<ReturnType<typeof setTimeout>>();

  if (prevSizeRef.current !== level.size && prevSizeRef.current > 0) {
    const el = rowRef.current;
    if (el) {
      const cls = level.size > prevSizeRef.current ? 'flash-bid' : 'flash-ask';
      el.classList.remove('flash-bid', 'flash-ask');
      void el.offsetWidth;
      el.classList.add(cls);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => el?.classList.remove(cls), 280);
    }
  }
  prevSizeRef.current = level.size;

  const isBid      = side === 'bid';
  const isWhale    = level.isWhale;
  // v58: electric colors
  const baseColor  = isBid ? 'rgba(0,255,157,1)' : 'rgba(255,59,92,1)';
  const color      = isWhale ? 'rgba(242,162,33,1)' : baseColor;
  // v58: heatmap intensity — larger orders = more opaque fill
  const intensity  = Math.min(level.size / maxSize, 1);
  const fillOpacity = isWhale ? 0.14 : 0.03 + intensity * 0.16;
  const fillColor  = isWhale
    ? `rgba(242,162,33,${fillOpacity})`
    : isBid
    ? `rgba(0,255,157,${fillOpacity})`
    : `rgba(255,59,92,${fillOpacity})`;
  const depthPct   = Math.min((level.total / maxTotal) * 100, 100);

  return (
    <div
      ref={rowRef}
      className={isWhale ? 'whale-row' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr 1fr 1fr' : '20px 1fr 1fr 1fr',
        padding: compact ? '1.5px 8px' : '1.5px 10px',
        gap: '4px', height: ROW_H + 'px', alignItems: 'center',
        fontSize: '11px', fontWeight: isWhale ? 700 : 500,
        position: 'relative', cursor: 'default', flexShrink: 0,
        borderLeft: isWhale ? '2px solid rgba(242,162,33,0.6)' : '2px solid transparent',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {/* Depth bar */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        [isBid ? 'left' : 'right']: 0,
        width: depthPct + '%',
        background: `rgba(255,255,255,0.025)`,
        transition: 'width 150ms ease-out',
        pointerEvents: 'none',
      }} />
      {/* Heatmap fill — intensity based on size */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        [isBid ? 'left' : 'right']: 0,
        width: Math.min((level.size / maxSize) * 100, 100) + '%',
        background: fillColor,
        transition: 'width 200ms ease-out, background 200ms ease-out',
        pointerEvents: 'none',
      }} />
      {!compact && (
        <span style={{ color: isWhale ? 'rgba(242,162,33,0.50)' : 'rgba(255,255,255,0.10)', fontSize: '8.5px', position: 'relative', zIndex: 1 }}>
          {isWhale ? '🐋' : rank}
        </span>
      )}
      <span className="mono-num" style={{ textAlign: 'right', color, position: 'relative', zIndex: 1, fontSize: '10.5px' }}>
        {level.price.toFixed(decimals)}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: isWhale ? 'rgba(242,162,33,0.80)' : 'rgba(255,255,255,0.45)', position: 'relative', zIndex: 1 }}>
        {formatSize(level.size)}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.18)', position: 'relative', zIndex: 1 }}>
        {formatSize(level.total)}
      </span>
    </div>
  );
});
OrderRow.displayName = 'OrderRow';

// ── PressureBar ───────────────────────────────────────────────────────────────

export const PressureBar: React.FC<{ bidPercent: number }> = React.memo(({ bidPercent }) => {
  const askPct = 100 - bidPercent;
  return (
    <div style={{
      padding: '5px 10px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0,
      background: 'rgba(9,11,18,1)',
    }}>
      <span className="mono-num" style={{ fontSize: '9.5px', fontWeight: 800, color: 'rgba(0,255,157,1)', whiteSpace: 'nowrap' }}>
        BID {bidPercent.toFixed(1)}%
      </span>
      <div style={{ flex: 1, height: '3px', borderRadius: '2px', background: 'rgba(255,59,92,0.15)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: bidPercent + '%', background: 'rgba(0,255,157,1)', borderRadius: '2px', transition: 'width 350ms ease-out' }} />
      </div>
      <span className="mono-num" style={{ fontSize: '9.5px', fontWeight: 800, color: 'rgba(255,59,92,1)', whiteSpace: 'nowrap' }}>
        {askPct.toFixed(1)}% ASK
      </span>
    </div>
  );
});
PressureBar.displayName = 'PressureBar';

export default OrderBook;
