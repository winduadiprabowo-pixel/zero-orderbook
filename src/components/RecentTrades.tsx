/**
 * RecentTrades.tsx — ZERØ ORDER BOOK v63
 * v63: Skeleton shimmer ganti "Waiting for trades..."
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo } from 'react';
import type { Trade } from '@/types/market';
import { SkeletonTrades } from './Skeleton';

interface RecentTradesProps { trades: Trade[] }

const MAX_DISPLAY = 60; // v60: reduced from 80 — less DOM nodes

const RecentTrades: React.FC<RecentTradesProps> = React.memo(({ trades }) => {
  const display = useMemo(() => trades.slice(0, MAX_DISPLAY), [trades]);

  // v60: loop instead of Math.max(...spread) — no stack overflow risk
  const maxSize = useMemo(() => {
    let max = 1;
    for (let i = 0; i < display.length; i++) {
      if (display[i].size > max) max = display[i].size;
    }
    return max;
  }, [display]);

  return (
    <div className="trades-gpu" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(11,14,22,1)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0,
      }}>
        <span className="label-sm">RECENT TRADES</span>
        {display.length > 0 && (
          <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.16)', fontWeight: 700 }}>
            {display.length}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '50px 1fr 1fr',
        padding: '3px 10px', gap: '4px',
        borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0,
      }}>
        <span className="label-xs">TIME</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>PRICE</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>SIZE</span>
      </div>

      {/* List — no animation class per row */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="hide-scrollbar">
        {display.map((t) => (
          <TradeRow key={t.id} trade={t} maxSize={maxSize} />
        ))}
        {!display.length && <SkeletonTrades />}
      </div>
    </div>
  );
});
RecentTrades.displayName = 'RecentTrades';

// v60: timeStr computed inline — no useMemo overhead for static value
function formatTime(ms: number): string {
  const d  = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
}

function formatTradeSize(size: number): string {
  if (size >= 1000) return (size / 1000).toFixed(2) + 'K';
  if (size >= 1)    return size.toFixed(3);
  return size.toFixed(4);
}

const TradeRow: React.FC<{ trade: Trade; maxSize: number }> = React.memo(({ trade, maxSize }) => {
  const isSell   = trade.isBuyerMaker;
  const color    = isSell ? 'rgba(255,59,92,1)' : 'rgba(0,255,157,1)';
  const barPct   = Math.min((trade.size / maxSize) * 100, 100);
  const barColor = isSell ? 'rgba(255,59,92,0.07)' : 'rgba(0,255,157,0.07)';

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '50px 1fr 1fr',
        padding: '2px 10px', gap: '4px',
        fontSize: '11px', fontWeight: 600,
        position: 'relative', cursor: 'default', lineHeight: '1.55',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {/* Size bar */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0,
        width: barPct + '%', background: barColor, pointerEvents: 'none',
      }} />
      <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '9.5px', fontVariantNumeric: 'tabular-nums', position: 'relative', zIndex: 1 }}>
        {formatTime(trade.time)}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color, position: 'relative', zIndex: 1 }}>
        {trade.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.48)', position: 'relative', zIndex: 1 }}>
        {formatTradeSize(trade.size)}
      </span>
    </div>
  );
});
TradeRow.displayName = 'TradeRow';

export default RecentTrades;
