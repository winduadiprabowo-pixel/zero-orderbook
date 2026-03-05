/**
 * Header.tsx — ZERØ ORDER BOOK v25
 * Cleaner top bar — Logo | Active symbol + ticker | Status | PRO CTA
 * Pair tabs REMOVED — moved to MarketSidebar.
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo, useCallback } from 'react';
import type { ConnectionStatus, SymbolInfo, TickerData, GlobalStats } from '@/types/market';
import { formatCompact, formatChange, fearGreedColor } from '@/lib/formatters';

interface HeaderProps {
  activeSymbol:     string;
  symbolInfo:       SymbolInfo;
  onOpenMarkets:    () => void;
  onOpenPro:        () => void;
  status:           ConnectionStatus;
  lastUpdate:       number;
  ticker:           TickerData | null;
  globalStats:      GlobalStats;
}

const Header: React.FC<HeaderProps> = React.memo(({
  activeSymbol, symbolInfo, onOpenMarkets, onOpenPro,
  status, lastUpdate, ticker, globalStats,
}) => {
  const statusColor = useMemo(() => {
    if (status === 'connected')    return 'rgba(38,166,154,1)';
    if (status === 'reconnecting') return 'rgba(242,142,44,1)';
    return 'rgba(239,83,80,1)';
  }, [status]);

  const statusLabel = useMemo(() => {
    if (status === 'connected')    return 'LIVE';
    if (status === 'reconnecting') return 'SYNC';
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

  const activeLabel = useMemo(() => {
    const up = activeSymbol.toUpperCase();
    for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'FDUSD']) {
      if (up.endsWith(quote)) return `${up.slice(0, -quote.length)}/${quote}`;
    }
    return up;
  }, [activeSymbol]);

  return (
    <header style={{
      background: 'rgba(16,19,28,1)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
      zIndex: 30,
    }}>
      {/* ── Row 1: Logo | Symbol | Price | Stats | Status | PRO ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 12px 0 38px',   // left pad 38px to not overlap sidebar toggle
        height: '44px', gap: '12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em' }}>
            <span style={{ color: 'rgba(242,142,44,1)' }}>ZERØ</span>
            <span style={{ color: 'rgba(255,255,255,0.28)', fontWeight: 500, fontSize: '9px' }}>
              {' '}ORDER BOOK
            </span>
          </span>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Active symbol — clickable to open modal on mobile */}
        <button
          onClick={onOpenMarkets}
          aria-label="Change trading pair"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', padding: '0', flexShrink: 0,
          }}
        >
          <span style={{
            fontSize: '13px', fontWeight: 800,
            color: 'rgba(255,255,255,0.92)',
            letterSpacing: '0.02em',
          }}>
            {activeLabel}
          </span>
          {ticker && (
            <span className="mono-num" style={{
              fontSize: '12px', fontWeight: 700,
              color: changeColor, letterSpacing: '-0.01em',
            }}>
              {ticker.lastPrice.toLocaleString('en-US', {
                minimumFractionDigits: Math.min(symbolInfo.priceDec, 6),
                maximumFractionDigits: Math.min(symbolInfo.priceDec, 6),
              })}
            </span>
          )}
          {ticker && (
            <span className="mono-num" style={{
              fontSize: '10px', fontWeight: 700, color: changeColor,
            }}>
              {ticker.priceChangePercent >= 0 ? '+' : ''}
              {ticker.priceChangePercent.toFixed(2)}%
            </span>
          )}
        </button>

        <div style={{ flex: 1 }} />

        {/* Ticker stats — desktop only */}
        {ticker && (
          <div style={{
            display: 'flex', gap: '14px', alignItems: 'center',
            overflow: 'hidden', flexShrink: 1,
          }} className="hide-scrollbar desktop-stats">
            <StatChip label="H"   value={ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })} color="rgba(38,166,154,1)" />
            <StatChip label="L"   value={ticker.lowPrice.toLocaleString('en-US',  { maximumFractionDigits: 4 })} color="rgba(239,83,80,1)" />
            <StatChip label="VOL" value={formatCompact(ticker.quoteVolume)}  color="rgba(255,255,255,0.80)" />
            {!globalStats.loading && (
              <>
                <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
                <StatChip label="MCAP"    value={formatCompact(globalStats.totalMarketCap)}   color="rgba(255,255,255,0.80)" />
                <StatChip label="BTCDOM"  value={`${globalStats.btcDominance.toFixed(1)}%`}   color="rgba(242,142,44,1)" />
                <StatChip
                  label={`F&G`}
                  value={`${globalStats.fearGreedValue} · ${globalStats.fearGreedLabel.toUpperCase()}`}
                  color={fgColor}
                />
              </>
            )}
          </div>
        )}

        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <div
            className="live-dot"
            style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }}
          />
          <span style={{ fontSize: '9px', fontWeight: 700, color: statusColor, letterSpacing: '0.10em' }}>
            {statusLabel}
          </span>
          {lastUpdate > 0 && (
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.14)', letterSpacing: '0.04em' }}>
              {timeStr}
            </span>
          )}
        </div>

        {/* PRO CTA */}
        <button
          onClick={onOpenPro}
          className="badge-glow"
          aria-label="Upgrade to ZERØ ORDER BOOK PRO"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0 10px', height: '26px', flexShrink: 0,
            background: 'rgba(242,142,44,0.12)',
            border: '1px solid rgba(242,142,44,0.40)',
            borderRadius: '3px', cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '10px', fontWeight: 700,
            color: 'rgba(242,142,44,1)', letterSpacing: '0.07em',
            whiteSpace: 'nowrap',
          }}
        >
          ⚡ PRO $9
        </button>
      </div>
    </header>
  );
});

Header.displayName = 'Header';

// ── StatChip ──────────────────────────────────────────────────────────────────

const StatChip: React.FC<{ label: string; value: string; color: string }> = React.memo(
  ({ label, value, color }) => (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0px',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span className="label-xs">{label}</span>
      <span className="mono-num" style={{
        fontSize: '10px', fontWeight: 700, color, lineHeight: 1.3,
      }}>
        {value}
      </span>
    </div>
  )
);
StatChip.displayName = 'StatChip';

export default Header;
