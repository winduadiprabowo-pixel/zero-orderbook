/**
 * OrderBook.tsx — ZERØ ORDER BOOK v39
 * UPGRADES vs v35:
 *   - Whale row highlight: levels with notional > $100k glow orange
 *   - Whale rows pulse animation via CSS class (zero re-render)
 *   - OrderBookLevel2 type with isWhale + notional
 *   - Flash via DOM classList preserved (zero re-render)
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo, useRef } from 'react';
import type { Precision } from '@/types/market';
import type { OrderBookLevel2 } from '@/hooks/useOrderBook';
import { formatSize } from '@/lib/formatters';

function precisionToDecimals(p: string): number {
  const stripped = p.replace(/0+$/, '');
  const dotIdx = stripped.indexOf('.');
  if (dotIdx === -1) return 0;
  return stripped.length - dotIdx - 1;
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

const OrderBook: React.FC<OrderBookProps> = React.memo(({
  bids, asks, midPrice, prevMidPrice, precision, onPrecisionChange,
  precisionOptions = DEFAULT_PRECISION_OPTIONS,
  compact = false, levels = 20,
}) => {
  const displayAsks = useMemo(() => asks.slice(0, levels).reverse(), [asks, levels]);
  const displayBids = useMemo(() => bids.slice(0, levels), [bids, levels]);

  const maxTotal = useMemo(() => {
    const a = displayAsks.length ? displayAsks[0]?.total ?? 0 : 0;
    const b = displayBids.length ? displayBids[displayBids.length - 1]?.total ?? 0 : 0;
    return Math.max(a, b, 1);
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
      background: 'rgba(14,17,26,1)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: compact ? '5px 8px' : '6px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0,
        background: 'rgba(14,17,26,1)',
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
                color: precision === p ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.20)',
                letterSpacing: '0.04em',
              }}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <ColHeader compact={compact} />

      {/* ASKS */}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        minHeight: 0,
      }} className="hide-scrollbar">
        {displayAsks.map((level, i) => (
          <OrderRow
            key={'ask-' + level.price}
            level={level} side="ask" maxTotal={maxTotal}
            decimals={decimals} compact={compact}
            rank={displayAsks.length - i}
          />
        ))}
      </div>

      {/* Mid price */}
      <MidPriceRow midPrice={midPrice} midDirection={midDirection} spread={spread} decimals={decimals} />

      {/* BIDS */}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }} className="hide-scrollbar">
        {displayBids.map((level, i) => (
          <OrderRow
            key={'bid-' + level.price}
            level={level} side="bid" maxTotal={maxTotal}
            decimals={decimals} compact={compact}
            rank={i + 1}
          />
        ))}
      </div>

      {/* Pressure bar */}
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
  midPrice:     number | null;
  midDirection: 'up' | 'down' | 'neutral';
  spread:       string;
  decimals:     number;
}> = React.memo(({ midPrice, midDirection, spread, decimals }) => {
  const color =
    midDirection === 'up'   ? 'rgba(38,166,154,1)'   :
    midDirection === 'down' ? 'rgba(239,83,80,1)'    :
                              'rgba(255,255,255,0.94)';
  const bg =
    midDirection === 'up'   ? 'rgba(38,166,154,0.06)'  :
    midDirection === 'down' ? 'rgba(239,83,80,0.06)'   :
                              'rgba(255,255,255,0.018)';
  return (
    <div style={{
      padding: '5px 10px',
      borderTop: '1px solid rgba(255,255,255,0.055)',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
      transition: 'background 300ms',
    }}>
      <span className="mono-num" style={{
        fontSize: '15px', fontWeight: 800, color, lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        {midDirection === 'up' ? '▲ ' : midDirection === 'down' ? '▼ ' : ''}
        {midPrice?.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) ?? '--'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
        <span className="label-xs">SPREAD</span>
        <span className="mono-num" style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.40)' }}>
          {spread}
        </span>
      </div>
    </div>
  );
});
MidPriceRow.displayName = 'MidPriceRow';

// ── OrderRow ──────────────────────────────────────────────────────────────────

interface OrderRowProps {
  rank: number; level: OrderBookLevel2; side: 'bid' | 'ask';
  maxTotal: number; decimals: number; compact: boolean;
}

const OrderRow: React.FC<OrderRowProps> = React.memo(({
  rank, level, side, maxTotal, decimals, compact,
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

  const isBid     = side === 'bid';
  // Whale rows get special amber highlight
  const isWhale   = level.isWhale;
  const baseColor = isBid ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  const color     = isWhale ? 'rgba(242,142,44,1)' : baseColor;
  const fillColor = isWhale
    ? 'rgba(242,142,44,0.11)'
    : isBid ? 'rgba(38,166,154,0.09)' : 'rgba(239,83,80,0.09)';
  const depthPct  = Math.min((level.total / maxTotal) * 100, 100);

  return (
    <div
      ref={rowRef}
      className={isWhale ? 'whale-row' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr 1fr 1fr' : '20px 1fr 1fr 1fr',
        padding: compact ? '1.5px 8px' : '1.5px 10px',
        gap: '4px',
        fontSize: '11px', fontWeight: isWhale ? 700 : 600,
        position: 'relative', cursor: 'default', flexShrink: 0,
        lineHeight: '1.55',
        // Whale rows get subtle left border
        borderLeft: isWhale ? '2px solid rgba(242,142,44,0.6)' : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.035)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Depth fill */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        [isBid ? 'left' : 'right']: 0,
        width: depthPct + '%',
        background: fillColor,
        transition: 'width 180ms ease-out',
        pointerEvents: 'none',
      }} />

      {!compact && (
        <span style={{
          color: isWhale ? 'rgba(242,142,44,0.50)' : 'rgba(255,255,255,0.10)',
          fontSize: '8.5px', position: 'relative', zIndex: 1,
        }}>
          {isWhale ? '🐋' : rank}
        </span>
      )}
      <span className="mono-num" style={{ textAlign: 'right', color, position: 'relative', zIndex: 1 }}>
        {level.price.toFixed(decimals)}
      </span>
      <span className="mono-num" style={{
        textAlign: 'right',
        color: isWhale ? 'rgba(242,142,44,0.80)' : 'rgba(255,255,255,0.52)',
        position: 'relative', zIndex: 1,
      }}>
        {formatSize(level.size)}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.22)', position: 'relative', zIndex: 1 }}>
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
      borderTop: '1px solid rgba(255,255,255,0.055)',
      display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0,
      background: 'rgba(14,17,26,1)',
    }}>
      <span className="mono-num" style={{
        fontSize: '9.5px', fontWeight: 800, color: 'rgba(38,166,154,1)', whiteSpace: 'nowrap',
      }}>
        BID {bidPercent.toFixed(1)}%
      </span>
      <div style={{ flex: 1, height: '3px', borderRadius: '2px', background: 'rgba(239,83,80,0.18)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: bidPercent + '%',
          background: 'rgba(38,166,154,1)',
          borderRadius: '2px', transition: 'width 350ms ease-out',
        }} />
      </div>
      <span className="mono-num" style={{
        fontSize: '9.5px', fontWeight: 800, color: 'rgba(239,83,80,1)', whiteSpace: 'nowrap',
      }}>
        {askPct.toFixed(1)}% ASK
      </span>
    </div>
  );
});
PressureBar.displayName = 'PressureBar';

export default OrderBook;
