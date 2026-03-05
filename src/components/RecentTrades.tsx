/**
 * RecentTrades.tsx — ZERØ ORDER BOOK v26
 * Dense, fast trades feed. Size bar visualization per row.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo, useRef } from 'react';
import type { Trade } from '@/types/market';

interface RecentTradesProps { trades: Trade[] }

const MAX_DISPLAY = 60;

const RecentTrades: React.FC<RecentTradesProps> = React.memo(({ trades }) => {
  const display = useMemo(() => trades.slice(0, MAX_DISPLAY), [trades]);

  // Max size for relative bar width
  const maxSize = useMemo(() => {
    if (!display.length) return 1;
    return Math.max(...display.map((t) => t.size), 1);
  }, [display]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(16,19,28,1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <span className="label-sm">Recent Trades</span>
        {display.length > 0 && (
          <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>
            {display.length}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '52px 1fr 1fr',
        padding: '3px 12px', gap: '4px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        <span className="label-xs">Time</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>Price</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>Size</span>
      </div>

      {/* Trades list */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="hide-scrollbar">
        {display.map((t) => (
          <TradeRow key={t.id} trade={t} maxSize={maxSize} />
        ))}
        {!display.length && (
          <div style={{
            padding: '20px', textAlign: 'center',
            color: 'rgba(255,255,255,0.18)', fontSize: '10px',
          }}>
            Waiting for trades...
          </div>
        )}
      </div>
    </div>
  );
});
RecentTrades.displayName = 'RecentTrades';

// ── TradeRow ──────────────────────────────────────────────────────────────────

const TradeRow: React.FC<{ trade: Trade; maxSize: number }> = React.memo(({ trade, maxSize }) => {
  const timeStr = useMemo(() => {
    const d  = new Date(trade.time);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [trade.time]);

  const isSell  = trade.isBuyerMaker;
  const color   = isSell ? 'rgba(239,83,80,1)' : 'rgba(38,166,154,1)';
  const barPct  = Math.min((trade.size / maxSize) * 100, 100);
  const barColor = isSell ? 'rgba(239,83,80,0.12)' : 'rgba(38,166,154,0.12)';

  return (
    <div
      className="slide-in-top"
      style={{
        display: 'grid', gridTemplateColumns: '52px 1fr 1fr',
        padding: '2px 12px', gap: '4px',
        fontSize: '11px', fontWeight: 500,
        position: 'relative',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Size bar background */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0,
        width: `${barPct}%`,
        background: barColor,
        pointerEvents: 'none',
        transition: 'width 200ms ease-out',
      }} />

      <span style={{
        color: 'rgba(255,255,255,0.20)', fontSize: '10px',
        fontVariantNumeric: 'tabular-nums', position: 'relative', zIndex: 1,
      }}>
        {timeStr}
      </span>
      <span className="mono-num" style={{
        textAlign: 'right', color, position: 'relative', zIndex: 1,
      }}>
        {trade.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </span>
      <span className="mono-num" style={{
        textAlign: 'right', color: 'rgba(255,255,255,0.45)',
        position: 'relative', zIndex: 1,
      }}>
        {trade.size >= 1000
          ? (trade.size / 1000).toFixed(2) + 'K'
          : trade.size >= 1
          ? trade.size.toFixed(3)
          : trade.size.toFixed(4)}
      </span>
    </div>
  );
});
TradeRow.displayName = 'TradeRow';

export default RecentTrades;
