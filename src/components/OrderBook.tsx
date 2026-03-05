import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { OrderBookLevel, Precision } from '@/types/market';
import { getPrecisionDecimals, formatSize } from '@/lib/formatters';

interface OrderBookProps {
  bids:              OrderBookLevel[];
  asks:              OrderBookLevel[];
  midPrice:          number | null;
  prevMidPrice:      number | null;
  precision:         Precision;
  onPrecisionChange: (p: Precision) => void;
  compact?:          boolean;
  levels?:           number;
}

const PRECISIONS: Precision[] = ['0.1', '0.01', '0.001'];

// ─── OrderBook ────────────────────────────────────────────────────────────────

const OrderBook: React.FC<OrderBookProps> = React.memo(({
  bids, asks, midPrice, prevMidPrice, precision, onPrecisionChange,
  compact = false, levels = 20,
}) => {
  const displayAsks = useMemo(() => asks.slice(0, levels).reverse(), [asks, levels]);
  const displayBids = useMemo(() => bids.slice(0, levels), [bids, levels]);

  const maxTotal = useMemo(() => {
    const a = displayAsks.length ? displayAsks[displayAsks.length - 1]?.total ?? 0 : 0;
    const b = displayBids.length ? displayBids[displayBids.length - 1]?.total ?? 0 : 0;
    return Math.max(a, b, 1);
  }, [displayAsks, displayBids]);

  const midDirection = useMemo(() => {
    if (!midPrice || !prevMidPrice || midPrice === prevMidPrice) return 'neutral';
    return midPrice > prevMidPrice ? 'up' : 'down';
  }, [midPrice, prevMidPrice]);

  const spread = useMemo(() => {
    if (!asks.length || !bids.length) return '--';
    const dec = getPrecisionDecimals(precision);
    return (asks[0].price - bids[0].price).toFixed(dec);
  }, [asks, bids, precision]);

  const bidPressure = useMemo(() => {
    const bv = bids.reduce((s, b) => s + b.size, 0);
    const av = asks.reduce((s, a) => s + a.size, 0);
    const t  = bv + av;
    return t > 0 ? (bv / t) * 100 : 50;
  }, [bids, asks]);

  const decimals = useMemo(() => getPrecisionDecimals(precision), [precision]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: compact ? '5px 8px' : '6px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span className="label-sm">Order Book</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {PRECISIONS.map((p) => (
            <button
              key={p}
              aria-label={`Set precision ${p}`}
              onClick={() => onPrecisionChange(p)}
              style={{
                padding: '2px 7px', fontSize: '9px', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
                borderRadius: '2px', border: 'none', transition: 'all 100ms',
                background: precision === p ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: precision === p ? 'var(--text-primary)' : 'var(--text-disabled)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <ColHeader compact={compact} />

      {/* Asks (reversed — lowest ask at bottom) */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        {displayAsks.map((level, i) => (
          <OrderRow
            key={level.price}
            rank={displayAsks.length - i}
            level={level}
            side="ask"
            maxTotal={maxTotal}
            decimals={decimals}
            compact={compact}
          />
        ))}
      </div>

      {/* Mid price */}
      <MidPriceRow midPrice={midPrice} midDirection={midDirection} spread={spread} decimals={decimals} />

      {/* Bids */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {displayBids.map((level, i) => (
          <OrderRow
            key={level.price}
            rank={i + 1}
            level={level}
            side="bid"
            maxTotal={maxTotal}
            decimals={decimals}
            compact={compact}
          />
        ))}
      </div>

      {/* Pressure */}
      <PressureBar bidPercent={bidPressure} />
    </div>
  );
});
OrderBook.displayName = 'OrderBook';

// ─── Sub-components ───────────────────────────────────────────────────────────

const ColHeader: React.FC<{ compact: boolean }> = React.memo(({ compact }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: compact ? '1fr 1fr 1fr' : '28px 1fr 1fr 1fr',
    padding: compact ? '3px 8px' : '3px 12px', gap: '4px',
    borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
  }}>
    {!compact && <span className="label-xs">#</span>}
    <span className="label-xs" style={{ textAlign: 'right' }}>Price</span>
    <span className="label-xs" style={{ textAlign: 'right' }}>Size</span>
    <span className="label-xs" style={{ textAlign: 'right' }}>Total</span>
  </div>
));
ColHeader.displayName = 'ColHeader';

const MidPriceRow: React.FC<{
  midPrice: number | null;
  midDirection: 'up' | 'down' | 'neutral';
  spread: string;
  decimals: number;
}> = React.memo(({ midPrice, midDirection, spread, decimals }) => {
  const color = midDirection === 'up' ? 'var(--bid-color)'
    : midDirection === 'down' ? 'var(--ask-color)' : 'var(--text-primary)';
  return (
    <div style={{
      padding: '7px 12px',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(255,255,255,0.02)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <span className="mono-num" style={{ fontSize: '19px', fontWeight: 800, color, lineHeight: 1 }}>
        {midDirection === 'up' ? '▲ ' : midDirection === 'down' ? '▼ ' : ''}
        {midPrice?.toLocaleString('en-US', { minimumFractionDigits: decimals }) ?? '--'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0px' }}>
        <span className="label-xs">SPREAD</span>
        <span className="mono-num" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {spread}
        </span>
      </div>
    </div>
  );
});
MidPriceRow.displayName = 'MidPriceRow';

interface OrderRowProps {
  rank:     number;
  level:    OrderBookLevel;
  side:     'bid' | 'ask';
  maxTotal: number;
  decimals: number;
  compact:  boolean;
}

const OrderRow: React.FC<OrderRowProps> = React.memo(({ rank, level, side, maxTotal, decimals, compact }) => {
  const depthPct    = useMemo(() => (level.total / maxTotal) * 100, [level.total, maxTotal]);
  const prevSizeRef = useRef(level.size);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const prev = prevSizeRef.current;
    if (prev !== level.size && prev > 0) {
      setFlash(level.size > prev ? 'flash-bid' : 'flash-ask');
      const t = setTimeout(() => setFlash(''), 300);
      return () => clearTimeout(t);
    }
    prevSizeRef.current = level.size;
  }, [level.size]);

  const isBid     = side === 'bid';
  const color     = isBid ? 'var(--bid-color)' : 'var(--ask-color)';
  const fillColor = isBid ? 'var(--bid-fill)' : 'var(--ask-fill)';

  return (
    <div
      className={flash || undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr 1fr 1fr' : '28px 1fr 1fr 1fr',
        padding: compact ? '1px 8px' : '1px 12px', gap: '4px',
        fontSize: '11px', fontWeight: 500,
        position: 'relative', cursor: 'default',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'var(--hover-bg)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
    >
      {/* Depth bar */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        [isBid ? 'left' : 'right']: 0,
        width: `${depthPct}%`,
        background: fillColor,
        transition: 'width 120ms ease-out',
        pointerEvents: 'none',
      }} />

      {!compact && (
        <span style={{ color: 'var(--text-disabled)', fontSize: '9px', position: 'relative', zIndex: 1 }}>
          {rank}
        </span>
      )}
      <span className="mono-num" style={{ textAlign: 'right', color, position: 'relative', zIndex: 1 }}>
        {level.price.toFixed(decimals)}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'var(--text-secondary)', position: 'relative', zIndex: 1 }}>
        {formatSize(level.size)}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'var(--text-muted)', position: 'relative', zIndex: 1 }}>
        {formatSize(level.total)}
      </span>
    </div>
  );
});
OrderRow.displayName = 'OrderRow';

// ─── PressureBar ──────────────────────────────────────────────────────────────

export const PressureBar: React.FC<{ bidPercent: number }> = React.memo(({ bidPercent }) => {
  const askPct = 100 - bidPercent;
  return (
    <div style={{
      padding: '5px 12px', borderTop: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', gap: '6px',
      flexShrink: 0,
    }}>
      <span className="mono-num" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--bid-color)', whiteSpace: 'nowrap' }}>
        BID {bidPercent.toFixed(1)}%
      </span>
      <div style={{
        flex: 1, height: '4px', borderRadius: '2px',
        background: 'var(--ask-fill)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${bidPercent}%`,
          background: 'var(--bid-color)',
          borderRadius: '2px', transition: 'width 300ms ease-out',
        }} />
      </div>
      <span className="mono-num" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ask-color)', whiteSpace: 'nowrap' }}>
        {askPct.toFixed(1)}% ASK
      </span>
    </div>
  );
});
PressureBar.displayName = 'PressureBar';

export default OrderBook;
