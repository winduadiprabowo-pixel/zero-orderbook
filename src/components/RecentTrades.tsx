import React, { useMemo } from 'react';
import type { Trade } from '@/types/market';

interface RecentTradesProps { trades: Trade[] }

const RecentTrades: React.FC<RecentTradesProps> = React.memo(({ trades }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)',
  }}>
    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      <span className="label-sm">Recent Trades</span>
    </div>

    {/* Column headers */}
    <div style={{
      display: 'grid', gridTemplateColumns: '56px 1fr 1fr 12px',
      padding: '3px 8px', gap: '4px',
      borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
    }}>
      <span className="label-xs">Time</span>
      <span className="label-xs" style={{ textAlign: 'right' }}>Price</span>
      <span className="label-xs" style={{ textAlign: 'right' }}>Size</span>
      <span />
    </div>

    <div style={{ flex: 1, overflowY: 'auto' }} className="hide-scrollbar">
      {trades.map((t) => <TradeRow key={t.id} trade={t} />)}
      {!trades.length && (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <span className="label-xs">Waiting for trades...</span>
        </div>
      )}
    </div>
  </div>
));
RecentTrades.displayName = 'RecentTrades';

const TradeRow: React.FC<{ trade: Trade }> = React.memo(({ trade }) => {
  const timeStr = useMemo(() => {
    const d = new Date(trade.time);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [trade.time]);

  const isSell = trade.isBuyerMaker;
  const color  = isSell ? 'var(--ask-color)' : 'var(--bid-color)';

  return (
    <div
      className="slide-in-top"
      style={{
        display: 'grid', gridTemplateColumns: '56px 1fr 1fr 12px',
        padding: '1.5px 8px', gap: '4px',
        fontSize: '11px', fontWeight: 500,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'var(--hover-bg)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
    >
      <span style={{ color: 'var(--text-disabled)', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
      <span className="mono-num" style={{ textAlign: 'right', color }}>{trade.price.toFixed(2)}</span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{trade.size.toFixed(4)}</span>
      <span style={{ textAlign: 'right', color, fontSize: '9px', fontWeight: 700 }}>{isSell ? '↓' : '↑'}</span>
    </div>
  );
});
TradeRow.displayName = 'TradeRow';

export default RecentTrades;
