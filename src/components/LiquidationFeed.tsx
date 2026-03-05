/**
 * LiquidationFeed.tsx — ZERØ ORDER BOOK
 * Real-time global liquidation feed from Binance fstream.
 * Whale events highlighted in gold. Major events in red.
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
  const statusColor = wsStatus === 'connected' ? 'var(--bid-color)'
    : wsStatus === 'reconnecting' ? 'var(--gold)'
    : 'var(--text-muted)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <span className="label-sm">Liquidations</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {wsStatus === 'connected' && (
            <div className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }} />
          )}
          <span style={{ fontSize: '8px', fontWeight: 700, color: statusColor, letterSpacing: '0.08em' }}>
            {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'reconnecting' ? 'CONN...' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <LiqStatsBar stats={stats} />

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 52px 44px',
        padding: '3px 12px', gap: '4px',
        borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <span className="label-xs">Time</span>
        <span className="label-xs">Symbol</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>Value</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>Side</span>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflow: 'auto' }} className="hide-scrollbar">
        {events.slice(0, 60).map((e) => <LiqRow key={e.id} event={e} />)}
        {!events.length && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <span className="label-xs">
              {wsStatus === 'connected' ? 'Waiting for liquidations...' : 'Connecting...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
LiquidationFeed.displayName = 'LiquidationFeed';

// ─── Stats bar ────────────────────────────────────────────────────────────────

const LiqStatsBar: React.FC<{ stats: LiquidationStats }> = React.memo(({ stats }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
  }}>
    <StatsCell
      label="LONG LIQ"
      value={formatUsdValue(stats.totalLongLiqUsd)}
      color="var(--ask-color)"
      borderRight
    />
    <StatsCell
      label="SHORT LIQ"
      value={formatUsdValue(stats.totalShortLiqUsd)}
      color="var(--bid-color)"
    />
  </div>
));
LiqStatsBar.displayName = 'LiqStatsBar';

const StatsCell: React.FC<{ label: string; value: string; color: string; borderRight?: boolean }> = React.memo(
  ({ label, value, color, borderRight }) => (
    <div style={{
      padding: '5px 10px',
      borderRight: borderRight ? '1px solid var(--border-subtle)' : undefined,
    }}>
      <div className="label-xs">{label}</div>
      <div className="mono-num" style={{ fontSize: '11px', fontWeight: 700, color }}>{value}</div>
    </div>
  )
);
StatsCell.displayName = 'StatsCell';

// ─── Liq row ──────────────────────────────────────────────────────────────────

const LiqRow: React.FC<{ event: LiquidationEvent }> = React.memo(({ event }) => {
  const isLongLiq = event.side === 'SELL'; // long position liq'd
  const color = event.isWhale ? 'var(--liq-whale)'
    : isLongLiq ? 'var(--ask-color)' : 'var(--bid-color)';

  const rowBg = event.isWhale ? 'var(--liq-whale-fill)'
    : event.isMajor ? 'rgba(239,83,80,0.06)' : 'transparent';

  const sym = event.symbol.replace('USDT', '').replace('BUSD', '');

  return (
    <div
      className={event.isWhale ? 'liq-whale-row' : 'slide-in-top'}
      style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 52px 44px',
        padding: '1px 12px', gap: '4px',
        fontSize: '11px', fontWeight: 500,
        background: rowBg,
        borderLeft: event.isWhale ? '2px solid var(--liq-whale)' : event.isMajor ? '2px solid var(--ask-color)' : '2px solid transparent',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'var(--hover-bg)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = rowBg)}
    >
      <span style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>{formatTime(event.timestamp)}</span>
      <span className="mono-num" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{sym}</span>
      <span className="mono-num" style={{ textAlign: 'right', color, fontWeight: event.isMajor ? 700 : 500 }}>
        {formatUsdValue(event.usdValue)}
      </span>
      <span style={{ textAlign: 'right', color, fontSize: '10px', fontWeight: 700 }}>
        {isLongLiq ? '↓ L' : '↑ S'}
      </span>
    </div>
  );
});
LiqRow.displayName = 'LiqRow';

export default LiquidationFeed;
