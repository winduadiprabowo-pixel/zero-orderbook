import React, { useMemo } from 'react';
import type { Trade } from '@/types/market';

interface RecentTradesProps {
  trades: Trade[];
}

const RecentTrades: React.FC<RecentTradesProps> = React.memo(({ trades }) => {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)',
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-muted)',
      }}>Recent Trades</div>
      
      <div style={{
        display: 'grid', gridTemplateColumns: '50px 1fr 1fr 18px',
        padding: '4px 12px', gap: '4px',
        fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span>Time</span>
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>Size</span>
        <span></span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {trades.map((trade) => (
          <TradeRow key={trade.id} trade={trade} />
        ))}
        {trades.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            Waiting for trades...
          </div>
        )}
      </div>
    </div>
  );
});

RecentTrades.displayName = 'RecentTrades';

const TradeRow: React.FC<{ trade: Trade }> = React.memo(({ trade }) => {
  const timeStr = useMemo(() => {
    const d = new Date(trade.time);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  }, [trade.time]);

  const color = trade.isBuyerMaker ? 'var(--ask-color)' : 'var(--bid-color)';
  const indicator = trade.isBuyerMaker ? '↓' : '↑';

  return (
    <div className="slide-in-top" style={{
      display: 'grid', gridTemplateColumns: '50px 1fr 1fr 18px',
      padding: '1px 12px', gap: '4px', fontSize: '11px', fontWeight: 500,
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
      <span style={{ textAlign: 'right', color }}>{trade.price.toFixed(2)}</span>
      <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{trade.size.toFixed(4)}</span>
      <span style={{ textAlign: 'center', color, fontSize: '10px' }}>{indicator}</span>
    </div>
  );
});
TradeRow.displayName = 'TradeRow';

export default RecentTrades;
