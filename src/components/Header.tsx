import React, { useMemo } from 'react';
import type { ConnectionStatus, SymbolInfo, TickerData } from '@/types/market';

interface HeaderProps {
  symbols: readonly SymbolInfo[];
  activeSymbol: string;
  onSymbolChange: (symbol: string) => void;
  status: ConnectionStatus;
  lastUpdate: number;
  ticker: TickerData | null;
}

const Header: React.FC<HeaderProps> = React.memo(({
  symbols, activeSymbol, onSymbolChange, status, lastUpdate, ticker,
}) => {
  const statusColor = useMemo(() => {
    switch (status) {
      case 'connected': return 'var(--bid-color)';
      case 'reconnecting': return 'var(--gold)';
      case 'disconnected': return 'var(--ask-color)';
    }
  }, [status]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'connected': return 'LIVE';
      case 'reconnecting': return 'RECONNECTING';
      case 'disconnected': return 'OFFLINE';
    }
  }, [status]);

  const timeStr = useMemo(() => {
    if (!lastUpdate) return '--:--:--';
    return new Date(lastUpdate).toLocaleTimeString();
  }, [lastUpdate]);

  const changeColor = useMemo(() => {
    if (!ticker) return 'var(--text-secondary)';
    return ticker.priceChangePercent >= 0 ? 'var(--bid-color)' : 'var(--ask-color)';
  }, [ticker]);

  return (
    <header style={{ background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', gap: '12px', flexWrap: 'wrap',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{
            fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)',
            letterSpacing: '0.05em',
          }}>
            <span style={{ color: 'var(--gold)' }}>ZERØ</span> ORDER BOOK
          </span>
        </div>

        {/* Symbol tabs */}
        <div style={{
          display: 'flex', gap: '2px', overflowX: 'auto', flexShrink: 1, minWidth: 0,
          scrollbarWidth: 'none',
        }} className="hide-scrollbar">
          {symbols.map((s) => (
            <button
              key={s.symbol}
              onClick={() => onSymbolChange(s.symbol)}
              aria-label={`Select ${s.label}`}
              style={{
                padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                borderRadius: '4px', border: 'none', transition: 'all 150ms',
                background: activeSymbol === s.symbol ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: activeSymbol === s.symbol ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div className="live-dot" style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: statusColor,
            }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
          <span>{timeStr}</span>
        </div>
      </div>

      {/* Stats bar */}
      {ticker && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '24px', padding: '6px 16px 10px',
          overflowX: 'auto', scrollbarWidth: 'none', flexWrap: 'nowrap',
        }}>
          <span style={{ fontSize: '28px', fontWeight: 800, color: changeColor }}>
            {ticker.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <StatItem label="24h Change" value={`${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%`} color={changeColor} />
          <StatItem label="24h High" value={ticker.highPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} color="var(--bid-color)" />
          <StatItem label="24h Low" value={ticker.lowPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} color="var(--ask-color)" />
          <StatItem label="24h Vol" value={formatVolume(ticker.quoteVolume)} color="var(--text-primary)" />
        </div>
      )}
    </header>
  );
});

Header.displayName = 'Header';

const StatItem: React.FC<{ label: string; value: string; color: string }> = React.memo(({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', whiteSpace: 'nowrap' }}>
    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
      {label}
    </span>
    <span style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</span>
  </div>
));
StatItem.displayName = 'StatItem';

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

export default Header;
