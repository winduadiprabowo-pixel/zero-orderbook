/**
 * LiquidationFeed.tsx — ZERØ ORDER BOOK v26
 * Real-time global liquidation feed. Whale events gold. Major events red.
 * Heatmap-style intensity bar. rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo } from 'react';
import type { LiquidationEvent, LiquidationStats } from '@/types/market';
import { formatUsdValue, formatTime } from '@/lib/formatters';

interface LiquidationFeedProps {
  events:   LiquidationEvent[];
  stats:    LiquidationStats;
  wsStatus: 'connected' | 'disconnected' | 'reconnecting';
}

const LiquidationFeed: React.FC<LiquidationFeedProps> = React.memo(({ events, stats, wsStatus }) => {
  const statusColor =
    wsStatus === 'connected'    ? 'rgba(38,166,154,1)'  :
    wsStatus === 'reconnecting' ? 'rgba(242,142,44,1)'  :
                                  'rgba(255,255,255,0.18)';

  // Max usd value for intensity bar
  const maxUsd = useMemo(() => {
    if (!events.length) return 1;
    return Math.max(...events.slice(0, 60).map((e) => e.usdValue), 1);
  }, [events]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(16,19,28,1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <span className="label-sm">Liquidations</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {wsStatus === 'connected' && (
            <div className="live-dot" style={{
              width: '5px', height: '5px', borderRadius: '50%', background: statusColor,
            }} />
          )}
          <span style={{
            fontSize: '8px', fontWeight: 700, color: statusColor, letterSpacing: '0.08em',
          }}>
            {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'reconnecting' ? 'CONN...' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <LiqStatsBar stats={stats} />

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 60px 36px',
        padding: '3px 12px', gap: '4px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        <span className="label-xs">Time</span>
        <span className="label-xs">Symbol</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>Value</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>Side</span>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="hide-scrollbar">
        {events.slice(0, 80).map((e) => (
          <LiqRow key={e.id} event={e} maxUsd={maxUsd} />
        ))}
        {!events.length && (
          <div style={{
            padding: '20px', textAlign: 'center',
            color: 'rgba(255,255,255,0.18)', fontSize: '10px',
          }}>
            {wsStatus === 'connected' ? 'Waiting for liquidations...' : 'Connecting...'}
          </div>
        )}
      </div>
    </div>
  );
});
LiquidationFeed.displayName = 'LiquidationFeed';

// ── Stats bar ─────────────────────────────────────────────────────────────────

const LiqStatsBar: React.FC<{ stats: LiquidationStats }> = React.memo(({ stats }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
  }}>
    <StatsCell label="LONG LIQ"  value={formatUsdValue(stats.totalLongLiqUsd)}  color="rgba(239,83,80,1)"  borderRight />
    <StatsCell label="SHORT LIQ" value={formatUsdValue(stats.totalShortLiqUsd)} color="rgba(38,166,154,1)" />
  </div>
));
LiqStatsBar.displayName = 'LiqStatsBar';

const StatsCell: React.FC<{
  label: string; value: string; color: string; borderRight?: boolean;
}> = React.memo(({ label, value, color, borderRight }) => (
  <div style={{
    padding: '5px 12px',
    borderRight: borderRight ? '1px solid rgba(255,255,255,0.06)' : undefined,
  }}>
    <div className="label-xs">{label}</div>
    <div className="mono-num" style={{ fontSize: '11px', fontWeight: 700, color }}>{value}</div>
  </div>
));
StatsCell.displayName = 'StatsCell';

// ── Liq row ───────────────────────────────────────────────────────────────────

const LiqRow: React.FC<{ event: LiquidationEvent; maxUsd: number }> = React.memo(({ event, maxUsd }) => {
  const isLongLiq = event.side === 'SELL';
  const color     =
    event.isWhale ? 'rgba(242,142,44,1)'  :
    isLongLiq     ? 'rgba(239,83,80,1)'   :
                    'rgba(38,166,154,1)';

  const rowBg     =
    event.isWhale ? 'rgba(242,142,44,0.06)'  :
    event.isMajor ? 'rgba(239,83,80,0.05)'   :
                    'transparent';

  const barPct  = Math.min((event.usdValue / maxUsd) * 100, 100);
  const barColor =
    event.isWhale ? 'rgba(242,142,44,0.15)' :
    isLongLiq     ? 'rgba(239,83,80,0.12)'  :
                    'rgba(38,166,154,0.12)';

  const sym = event.symbol.replace('USDT', '').replace('BUSD', '').replace('PERP', '');

  return (
    <div
      className={event.isWhale ? 'liq-whale-row' : 'slide-in-top'}
      style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 60px 36px',
        padding: '2px 12px', gap: '4px',
        fontSize: '11px', fontWeight: 500,
        background: rowBg,
        borderLeft: event.isWhale
          ? '2px solid rgba(242,142,44,1)'
          : event.isMajor
          ? '2px solid rgba(239,83,80,0.6)'
          : '2px solid transparent',
        position: 'relative',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = rowBg;
      }}
    >
      {/* Intensity bar */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0,
        width: `${barPct}%`,
        background: barColor,
        pointerEvents: 'none',
        transition: 'width 300ms ease-out',
      }} />

      <span style={{
        color: 'rgba(255,255,255,0.20)', fontSize: '10px', position: 'relative', zIndex: 1,
      }}>
        {formatTime(event.timestamp)}
      </span>
      <span className="mono-num" style={{
        color: 'rgba(255,255,255,0.75)', fontWeight: 600, position: 'relative', zIndex: 1,
        fontSize: '10px',
      }}>
        {sym}
      </span>
      <span className="mono-num" style={{
        textAlign: 'right', color, fontWeight: event.isMajor || event.isWhale ? 700 : 500,
        position: 'relative', zIndex: 1,
      }}>
        {formatUsdValue(event.usdValue)}
      </span>
      <span style={{
        textAlign: 'right', color, fontSize: '10px', fontWeight: 700,
        position: 'relative', zIndex: 1,
      }}>
        {isLongLiq ? '↓L' : '↑S'}
      </span>
    </div>
  );
});
LiqRow.displayName = 'LiqRow';

export default LiquidationFeed;
