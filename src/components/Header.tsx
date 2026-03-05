import React, { useMemo } from 'react';
import type { ConnectionStatus, SymbolInfo, TickerData } from '@/types/market';
import type { GlobalStats } from '@/types/market';
import { formatCompact, formatChange, fearGreedColor } from '@/lib/formatters';

interface HeaderProps {
  symbols:        readonly SymbolInfo[];
  activeSymbol:   string;
  onSymbolChange: (symbol: string) => void;
  status:         ConnectionStatus;
  lastUpdate:     number;
  ticker:         TickerData | null;
  globalStats:    GlobalStats;
}

const Header: React.FC<HeaderProps> = React.memo(({
  symbols, activeSymbol, onSymbolChange, status, lastUpdate, ticker, globalStats,
}) => {
  const statusColor = useMemo(() => {
    if (status === 'connected')    return 'var(--bid-color)';
    if (status === 'reconnecting') return 'var(--gold)';
    return 'var(--ask-color)';
  }, [status]);

  const statusLabel = useMemo(() => {
    if (status === 'connected')    return 'LIVE';
    if (status === 'reconnecting') return 'RECONNECTING';
    return 'OFFLINE';
  }, [status]);

  const timeStr = useMemo(() => {
    if (!lastUpdate) return '--:--:--';
    return new Date(lastUpdate).toLocaleTimeString('en-US', { hour12: false });
  }, [lastUpdate]);

  const changeColor = useMemo(() =>
    !ticker ? 'var(--text-secondary)'
    : ticker.priceChangePercent >= 0 ? 'var(--bid-color)' : 'var(--ask-color)',
  [ticker]);

  const fgColor = fearGreedColor(globalStats.fearGreedValue);

  return (
    <header style={{
      background: 'var(--panel-bg)',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      {/* ── Row 1: Logo | Symbol tabs | Status + PRO CTA ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 16px', height: '44px', gap: '8px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em' }}>
            <span style={{ color: 'var(--gold)' }}>ZERØ</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}> ORDER BOOK</span>
          </span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'var(--border-mid)', flexShrink: 0 }} />

        {/* Symbol tabs */}
        <div
          style={{
            display: 'flex', gap: '1px', flex: 1,
            overflowX: 'auto', minWidth: 0,
          }}
          className="hide-scrollbar"
        >
          {symbols.map((s) => {
            const active = activeSymbol === s.symbol;
            return (
              <button
                key={s.symbol}
                onClick={() => onSymbolChange(s.symbol)}
                aria-label={`Select ${s.label}`}
                style={{
                  padding: '0 10px', height: '28px',
                  fontSize: '11px', fontWeight: active ? 700 : 500,
                  fontFamily: 'inherit', cursor: 'pointer',
                  whiteSpace: 'nowrap', borderRadius: '3px',
                  border: active ? '1px solid var(--border-mid)' : '1px solid transparent',
                  background: active ? 'var(--active-bg)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'all 120ms',
                  letterSpacing: '0.03em',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Right side: status + PRO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              className="live-dot"
              style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }}
            />
            <span style={{
              fontSize: '9px', fontWeight: 700,
              color: statusColor, letterSpacing: '0.1em',
            }}>
              {statusLabel}
            </span>
            {lastUpdate > 0 && (
              <span style={{ fontSize: '9px', color: 'var(--text-disabled)', letterSpacing: '0.05em' }}>
                {timeStr}
              </span>
            )}
          </div>

          {/* PRO CTA */}
          <a
            href="https://zerobuildlab.gumroad.com/l/rbfmtz"
            target="_blank"
            rel="noopener noreferrer"
            className="badge-glow"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '0 10px', height: '26px',
              background: 'var(--gold-fill)',
              border: '1px solid rgba(242,142,44,0.4)',
              borderRadius: '3px', cursor: 'pointer',
              textDecoration: 'none',
              fontSize: '10px', fontWeight: 700,
              color: 'var(--gold)', letterSpacing: '0.07em',
              whiteSpace: 'nowrap',
            }}
          >
            ⚡ PRO $9
          </a>
        </div>
      </div>

      {/* ── Row 2: Ticker stats bar ── */}
      {ticker && (
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px', height: '36px', gap: '20px',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto', flexWrap: 'nowrap',
        }} className="hide-scrollbar">
          <span className="mono-num" style={{
            fontSize: '22px', fontWeight: 800,
            color: changeColor, letterSpacing: '-0.01em',
            flexShrink: 0,
          }}>
            {ticker.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>

          <StatChip label="24H CHG"
            value={`${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%`}
            color={changeColor} />
          <StatChip label="24H HIGH"
            value={ticker.highPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            color="var(--bid-color)" />
          <StatChip label="24H LOW"
            value={ticker.lowPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            color="var(--ask-color)" />
          <StatChip label="VOLUME"
            value={formatCompact(ticker.quoteVolume)}
            color="var(--text-primary)" />

          {/* Separator */}
          <div style={{ width: '1px', height: '18px', background: 'var(--border-mid)', flexShrink: 0 }} />

          {/* Global stats */}
          {!globalStats.loading && (
            <>
              <StatChip label="MCAP"
                value={formatCompact(globalStats.totalMarketCap)}
                color="var(--text-primary)" />
              <StatChip label="MCAP CHG"
                value={formatChange(globalStats.marketCapChange24h)}
                color={globalStats.marketCapChange24h >= 0 ? 'var(--bid-color)' : 'var(--ask-color)'} />
              <StatChip label="BTC DOM"
                value={`${globalStats.btcDominance.toFixed(1)}%`}
                color="var(--gold)" />
              <StatChip
                label={`F&G · ${globalStats.fearGreedLabel.toUpperCase()}`}
                value={String(globalStats.fearGreedValue)}
                color={fgColor}
              />
            </>
          )}
        </div>
      )}
    </header>
  );
});

Header.displayName = 'Header';

const StatChip: React.FC<{ label: string; value: string; color: string }> = React.memo(({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', whiteSpace: 'nowrap', flexShrink: 0 }}>
    <span className="label-xs">{label}</span>
    <span className="mono-num" style={{ fontSize: '12px', fontWeight: 700, color, lineHeight: 1.3 }}>{value}</span>
  </div>
));
StatChip.displayName = 'StatChip';

export default Header;
