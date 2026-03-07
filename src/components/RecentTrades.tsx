/**
 * RecentTrades.tsx — ZERØ ORDER BOOK v35
 * HD overhaul — sharper, denser, crisper.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo } from 'react';
import type { Trade } from '@/types/market';

interface RecentTradesProps { trades: Trade[] }

const MAX_DISPLAY = 80;

const RecentTrades: React.FC<RecentTradesProps> = React.memo(({ trades }) => {
  const display = useMemo(() => trades.slice(0, MAX_DISPLAY), [trades]);
  const maxSize = useMemo(() => {
    if (!display.length) return 1;
    return Math.max(...display.map((t) => t.size), 1);
  }, [display]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(14,17,26,1)' }}>
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

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="hide-scrollbar">
        {display.map((t) => (
          <TradeRow key={t.id} trade={t} maxSize={maxSize} />
        ))}
        {!display.length && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.16)', fontSize: '10px' }}>
            Waiting for trades...
          </div>
        )}
      </div>
    </div>
  );
});
RecentTrades.displayName = 'RecentTrades';

const TradeRow: React.FC<{ trade: Trade; maxSize: number }> = React.memo(({ trade, maxSize }) => {
  const timeStr = useMemo(() => {
    const d  = new Date(trade.time);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return hh + ':' + mm + ':' + ss;
  }, [trade.time]);

  const isSell   = trade.isBuyerMaker;
  const color    = isSell ? 'rgba(255,59,92,1)' : 'rgba(0,255,157,1)';
  const barPct   = Math.min((trade.size / maxSize) * 100, 100);
  const barColor = isSell ? 'rgba(255,59,92,0.08)' : 'rgba(0,255,157,0.08)';

  const sizeStr = trade.size >= 1000
    ? (trade.size / 1000).toFixed(2) + 'K'
    : trade.size >= 1
    ? trade.size.toFixed(3)
    : trade.size.toFixed(4);

  return (
    <div
      className="slide-in-top"
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
        transition: 'width 180ms ease-out',
      }} />

      <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '9.5px', fontVariantNumeric: 'tabular-nums', position: 'relative', zIndex: 1 }}>
        {timeStr}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color, position: 'relative', zIndex: 1 }}>
        {trade.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.48)', position: 'relative', zIndex: 1 }}>
        {sizeStr}
      </span>
    </div>
  );
});
TradeRow.displayName = 'TradeRow';

export default RecentTrades;
