import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import type { OrderBookLevel, Precision } from '@/types/market';

interface OrderBookProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number | null;
  prevMidPrice: number | null;
  precision: Precision;
  onPrecisionChange: (p: Precision) => void;
  compact?: boolean;
  levels?: number;
}

const PRECISIONS: Precision[] = ['0.1', '0.01', '0.001'];

const OrderBook: React.FC<OrderBookProps> = React.memo(({
  bids, asks, midPrice, prevMidPrice, precision, onPrecisionChange, compact = false, levels = 20,
}) => {
  const displayAsks = useMemo(() => asks.slice(0, levels).reverse(), [asks, levels]);
  const displayBids = useMemo(() => bids.slice(0, levels), [bids, levels]);

  const maxTotal = useMemo(() => {
    const askMax = displayAsks.length ? displayAsks[displayAsks.length - 1]?.total ?? 0 : 0;
    const bidMax = displayBids.length ? displayBids[displayBids.length - 1]?.total ?? 0 : 0;
    return Math.max(askMax, bidMax, 1);
  }, [displayAsks, displayBids]);

  const midDirection = useMemo(() => {
    if (!midPrice || !prevMidPrice) return 'neutral';
    return midPrice > prevMidPrice ? 'up' : midPrice < prevMidPrice ? 'down' : 'neutral';
  }, [midPrice, prevMidPrice]);

  const spread = useMemo(() => {
    if (asks.length && bids.length) {
      return (asks[0].price - bids[0].price).toFixed(getPrecisionDecimals(precision));
    }
    return '--';
  }, [asks, bids, precision]);

  const bidPressure = useMemo(() => {
    const bidVol = bids.reduce((s, b) => s + b.size, 0);
    const askVol = asks.reduce((s, a) => s + a.size, 0);
    const total = bidVol + askVol;
    return total > 0 ? (bidVol / total * 100) : 50;
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
        padding: compact ? '6px 8px' : '8px 12px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text-muted)',
        }}>Order Book</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {PRECISIONS.map((p) => (
            <button
              key={p}
              aria-label={`Set precision ${p}`}
              onClick={() => onPrecisionChange(p)}
              style={{
                padding: '2px 6px', fontSize: '9px', fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer', border: 'none',
                borderRadius: '3px', transition: 'all 150ms',
                background: precision === p ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: precision === p ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: compact ? '1fr 1fr 1fr' : '30px 1fr 1fr 1fr',
        padding: compact ? '4px 8px' : '4px 12px', gap: '4px',
        fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {!compact && <span>#</span>}
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>Size</span>
        <span style={{ textAlign: 'right' }}>Total</span>
      </div>

      {/* Asks */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
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
      <div style={{
        padding: compact ? '6px 8px' : '8px 12px',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{
          fontSize: compact ? '16px' : '20px', fontWeight: 800,
          color: midDirection === 'up' ? 'var(--bid-color)' : midDirection === 'down' ? 'var(--ask-color)' : 'var(--text-primary)',
        }}>
          {midDirection === 'up' && '▲ '}
          {midDirection === 'down' && '▼ '}
          {midPrice?.toLocaleString(undefined, { minimumFractionDigits: decimals }) ?? '--'}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          Spread: {spread}
        </span>
      </div>

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

      {/* Pressure bar */}
      <PressureBar bidPercent={bidPressure} />
    </div>
  );
});

OrderBook.displayName = 'OrderBook';

interface OrderRowProps {
  rank: number;
  level: OrderBookLevel;
  side: 'bid' | 'ask';
  maxTotal: number;
  decimals: number;
  compact: boolean;
}

const OrderRow: React.FC<OrderRowProps> = React.memo(({ rank, level, side, maxTotal, decimals, compact }) => {
  const depthPercent = useMemo(() => (level.total / maxTotal) * 100, [level.total, maxTotal]);
  const prevSizeRef = useRef(level.size);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const prev = prevSizeRef.current;
    if (prev !== level.size && prev > 0) {
      setFlash(level.size > prev ? 'flash-green' : 'flash-red');
      const t = setTimeout(() => setFlash(''), 300);
      return () => clearTimeout(t);
    }
    prevSizeRef.current = level.size;
  }, [level.size]);

  const isBid = side === 'bid';
  const color = isBid ? 'var(--bid-color)' : 'var(--ask-color)';
  const fillColor = isBid ? 'var(--bid-fill)' : 'var(--ask-fill)';

  return (
    <div
      className={flash}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr 1fr 1fr' : '30px 1fr 1fr 1fr',
        padding: compact ? '1px 8px' : '1px 12px',
        gap: '4px',
        fontSize: '12px', fontWeight: 500, position: 'relative',
        cursor: 'default', transition: 'background 100ms',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {/* Depth bar */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        [isBid ? 'left' : 'right']: 0,
        width: `${depthPercent}%`,
        background: fillColor,
        transition: 'width 150ms',
      }} />

      {!compact && (
        <span style={{ color: 'var(--text-muted)', fontSize: '10px', position: 'relative', zIndex: 1 }}>
          {rank}
        </span>
      )}
      <span style={{ textAlign: 'right', color, position: 'relative', zIndex: 1 }}>
        {level.price.toFixed(decimals)}
      </span>
      <span style={{ textAlign: 'right', color: 'var(--text-secondary)', position: 'relative', zIndex: 1 }}>
        {formatSize(level.size)}
      </span>
      <span style={{ textAlign: 'right', color: 'var(--text-muted)', position: 'relative', zIndex: 1 }}>
        {formatSize(level.total)}
      </span>
    </div>
  );
});

OrderRow.displayName = 'OrderRow';

const PressureBar: React.FC<{ bidPercent: number }> = React.memo(({ bidPercent }) => {
  const askPercent = useMemo(() => 100 - bidPercent, [bidPercent]);
  return (
    <div style={{
      padding: '6px 12px', borderTop: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontWeight: 600,
    }}>
      <span style={{ color: 'var(--bid-color)', whiteSpace: 'nowrap' }}>BID {bidPercent.toFixed(1)}%</span>
      <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--ask-fill)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${bidPercent}%`,
          background: 'var(--bid-color)', borderRadius: '2px',
          transition: 'width 300ms',
        }} />
      </div>
      <span style={{ color: 'var(--ask-color)', whiteSpace: 'nowrap' }}>{askPercent.toFixed(1)}% ASK</span>
    </div>
  );
});
PressureBar.displayName = 'PressureBar';

function getPrecisionDecimals(p: Precision): number {
  return p === '0.1' ? 1 : p === '0.01' ? 2 : 3;
}

function formatSize(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)}K`;
  return v.toFixed(4);
}

export default OrderBook;
export { PressureBar };
