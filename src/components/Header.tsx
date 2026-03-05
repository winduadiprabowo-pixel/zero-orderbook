/**
 * Header.tsx — ZERØ ORDER BOOK v24
 * Row 1: Logo | Pinned symbol tabs | [+ More markets] | Status | PRO CTA (atbwr ✓)
 * Row 2: Ticker stats bar
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo, useCallback } from 'react';
import type { ConnectionStatus, SymbolInfo, TickerData } from '@/types/market';
import type { GlobalStats } from '@/types/market';
import { PINNED_SYMBOLS } from '@/types/market';
import { formatCompact, formatChange, fearGreedColor } from '@/lib/formatters';

interface HeaderProps {
  symbols:           readonly SymbolInfo[];
  activeSymbol:      string;
  onSymbolChange:    (symbol: string) => void;
  onOpenMarkets:     () => void;
  status:            ConnectionStatus;
  lastUpdate:        number;
  ticker:            TickerData | null;
  globalStats:       GlobalStats;
  marketPairsCount:  number;
}

const Header: React.FC<HeaderProps> = React.memo(({
  activeSymbol, onSymbolChange, onOpenMarkets,
  status, lastUpdate, ticker, globalStats, marketPairsCount,
}) => {
  const statusColor = useMemo(() => {
    if (status === 'connected')    return 'rgba(38,166,154,1)';
    if (status === 'reconnecting') return 'rgba(242,142,44,1)';
    return 'rgba(239,83,80,1)';
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
    !ticker ? 'rgba(255,255,255,0.55)'
    : ticker.priceChangePercent >= 0 ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)',
  [ticker]);

  const fgColor = fearGreedColor(globalStats.fearGreedValue);

  // Active symbol — find in PINNED or build label from activeSymbol string
  const activeLabel = useMemo(() => {
    const pinned = PINNED_SYMBOLS.find((s) => s.symbol === activeSymbol);
    if (pinned) return pinned.label;
    // Derive label from symbol string: "btcusdt" → "BTC/USDT"
    const up = activeSymbol.toUpperCase();
    for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'FDUSD']) {
      if (up.endsWith(quote)) {
        return `${up.slice(0, -quote.length)}/${quote}`;
      }
    }
    return up;
  }, [activeSymbol]);

  const isPinned = useMemo(
    () => PINNED_SYMBOLS.some((s) => s.symbol === activeSymbol),
    [activeSymbol],
  );

  return (
    <header style={{
      background: 'rgba(16,19,28,1)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
    }}>
      {/* ── Row 1: Logo | Pinned tabs | More | Status | PRO ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 12px', height: '44px', gap: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em' }}>
            <span style={{ color: 'rgba(242,142,44,1)' }}>ZERØ</span>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500, fontSize: '10px' }}> ORDER BOOK</span>
          </span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Pinned symbol tabs */}
        <div
          style={{ display: 'flex', gap: '1px', flex: 1, overflowX: 'auto', minWidth: 0 }}
          className="hide-scrollbar"
        >
          {PINNED_SYMBOLS.map((s) => {
            const active = activeSymbol === s.symbol;
            return (
              <SymbolTab
                key={s.symbol}
                symbol={s.symbol}
                label={s.label}
                active={active}
                onClick={onSymbolChange}
              />
            );
          })}

          {/* If active symbol is NOT in pinned list, show it as an extra tab */}
          {!isPinned && (
            <SymbolTab
              symbol={activeSymbol}
              label={activeLabel}
              active={true}
              onClick={onSymbolChange}
              isExtra
            />
          )}
        </div>

        {/* [+ More markets] button */}
        <button
          onClick={onOpenMarkets}
          aria-label="Open market selector"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0 8px', height: '26px', flexShrink: 0,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '3px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.06em', whiteSpace: 'nowrap',
            transition: 'all 120ms',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.92)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)';
          }}
        >
          <span style={{ fontSize: '11px' }}>⊕</span>
          <span>{marketPairsCount > 0 ? `${marketPairsCount}+ MARKETS` : 'MARKETS'}</span>
        </button>

        {/* Status + PRO CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              className="live-dot"
              style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }}
            />
            <span style={{ fontSize: '9px', fontWeight: 700, color: statusColor, letterSpacing: '0.1em' }}>
              {statusLabel}
            </span>
            {lastUpdate > 0 && (
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.05em' }}>
                {timeStr}
              </span>
            )}
          </div>

          {/* PRO CTA — FIXED: atbwr ✓ */}
          <a
            href="https://zerobuildlab.gumroad.com/l/atbwr"
            target="_blank"
            rel="noopener noreferrer"
            className="badge-glow"
            aria-label="Upgrade to ZERØ ORDER BOOK PRO"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '0 10px', height: '26px',
              background: 'rgba(242,142,44,0.12)',
              border: '1px solid rgba(242,142,44,0.4)',
              borderRadius: '3px', cursor: 'pointer',
              textDecoration: 'none',
              fontSize: '10px', fontWeight: 700,
              color: 'rgba(242,142,44,1)', letterSpacing: '0.07em',
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
          padding: '0 12px', height: '34px', gap: '16px',
          overflowX: 'auto', flexWrap: 'nowrap',
        }} className="hide-scrollbar">
          <span className="mono-num" style={{
            fontSize: '18px', fontWeight: 800, color: changeColor,
            letterSpacing: '-0.01em', flexShrink: 0,
          }}>
            {ticker.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </span>

          <StatChip label="24H CHG"
            value={`${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%`}
            color={changeColor} />
          <StatChip label="HIGH"
            value={ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: 6 })}
            color="rgba(38,166,154,1)" />
          <StatChip label="LOW"
            value={ticker.lowPrice.toLocaleString('en-US', { maximumFractionDigits: 6 })}
            color="rgba(239,83,80,1)" />
          <StatChip label="VOL"
            value={formatCompact(ticker.quoteVolume)}
            color="rgba(255,255,255,0.92)" />

          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

          {!globalStats.loading && (
            <>
              <StatChip label="MCAP"   value={formatCompact(globalStats.totalMarketCap)} color="rgba(255,255,255,0.92)" />
              <StatChip label="MCAP Δ" value={formatChange(globalStats.marketCapChange24h)}
                color={globalStats.marketCapChange24h >= 0 ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)'} />
              <StatChip label="BTC DOM" value={`${globalStats.btcDominance.toFixed(1)}%`} color="rgba(242,142,44,1)" />
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

// ─── SymbolTab ────────────────────────────────────────────────────────────────

const SymbolTab: React.FC<{
  symbol:  string;
  label:   string;
  active:  boolean;
  onClick: (symbol: string) => void;
  isExtra?: boolean;
}> = React.memo(({ symbol, label, active, onClick, isExtra }) => {
  const handleClick = useCallback(() => onClick(symbol), [symbol, onClick]);
  return (
    <button
      onClick={handleClick}
      aria-label={`Select ${label}`}
      style={{
        padding: '0 9px', height: '28px',
        fontSize: '10px', fontWeight: active ? 700 : 500,
        fontFamily: 'inherit', cursor: 'pointer',
        whiteSpace: 'nowrap', borderRadius: '3px',
        border: active ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent',
        background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
        color: active
          ? (isExtra ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.92)')
          : 'rgba(255,255,255,0.28)',
        transition: 'all 120ms',
        letterSpacing: '0.03em',
      }}
    >
      {label}
    </button>
  );
});
SymbolTab.displayName = 'SymbolTab';

// ─── StatChip ────────────────────────────────────────────────────────────────

const StatChip: React.FC<{ label: string; value: string; color: string }> = React.memo(({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', whiteSpace: 'nowrap', flexShrink: 0 }}>
    <span className="label-xs">{label}</span>
    <span className="mono-num" style={{ fontSize: '11px', fontWeight: 700, color, lineHeight: 1.3 }}>{value}</span>
  </div>
));
StatChip.displayName = 'StatChip';

export default Header;
