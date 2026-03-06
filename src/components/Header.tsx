/**
 * Header.tsx — ZERØ ORDER BOOK v38
 * FIX MOBILE: harga tidak kepotong — hide "ORDER BOOK" label + timestamp di mobile.
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo } from 'react';
import type { ConnectionStatus, SymbolInfo, TickerData, GlobalStats } from '@/types/market';
import { formatCompact, fearGreedColor } from '@/lib/formatters';
import CoinLogo from '@/components/CoinLogo';

interface HeaderProps {
  activeSymbol:  string;
  symbolInfo:    SymbolInfo;
  onOpenMarkets: () => void;
  onOpenPro:     () => void;
  status:        ConnectionStatus;
  lastUpdate:    number;
  ticker:        TickerData | null;
  globalStats:   GlobalStats;
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
    if (!lastUpdate) return '';
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
      if (up.endsWith(quote)) return { base: up.slice(0, -quote.length), quote };
    }
    return { base: up, quote: '' };
  }, [activeSymbol]);

  const priceStr = useMemo(() => {
    if (!ticker) return '—';
    return ticker.lastPrice.toLocaleString('en-US', {
      minimumFractionDigits: Math.min(symbolInfo.priceDec, 6),
      maximumFractionDigits: Math.min(symbolInfo.priceDec, 6),
    });
  }, [ticker, symbolInfo.priceDec]);

  const changeStr = useMemo(() => {
    if (!ticker) return '';
    return (ticker.priceChangePercent >= 0 ? '+' : '') + ticker.priceChangePercent.toFixed(2) + '%';
  }, [ticker]);

  return (
    <header style={{
      background: 'rgba(13,16,23,1)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      flexShrink: 0,
      zIndex: 30,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        height: '48px', gap: '0',
        overflow: 'hidden',
        minWidth: 0,
      }}>

        {/* ── Logo ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          marginRight: '12px', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="2" y="2" width="18" height="18" rx="3" fill="rgba(242,142,44,0.12)" stroke="rgba(242,142,44,0.5)" strokeWidth="1.2"/>
            <text x="11" y="15.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="rgba(242,142,44,1)" fontFamily="'IBM Plex Mono',monospace">Ø</text>
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.03em', color: 'rgba(242,142,44,1)' }}>
            ZERØ
          </span>
          {/* Hidden on mobile — saves ~80px */}
          <span className="header-subtitle" style={{
            fontSize: '8px', color: 'rgba(255,255,255,0.22)', fontWeight: 500,
            letterSpacing: '0.04em', marginLeft: '1px',
          }}>
            ORDER BOOK
          </span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.07)', flexShrink: 0, marginRight: '12px' }} />

        {/* ── Pair selector ── */}
        <button
          onClick={onOpenMarkets}
          aria-label="Change trading pair"
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '5px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '5px 8px 5px 7px',
            flexShrink: 0,
            transition: 'background 120ms, border-color 120ms',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(242,142,44,0.35)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
          }}
        >
          <CoinLogo symbol={activeLabel.base} size={18} />
          <span style={{
            fontSize: '13px', fontWeight: 800,
            color: 'rgba(255,255,255,0.95)',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>
            {activeLabel.base}
            <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
              /{activeLabel.quote}
            </span>
          </span>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* ── Price + change — flex-shrink allowed, min-width: 0 ── */}
        {ticker && (
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: '5px',
            marginLeft: '10px',
            flexShrink: 1,   // ← kunci: boleh menyempit
            minWidth: 0,
            overflow: 'hidden',
          }}>
            <span className="mono-num" style={{
              fontSize: '15px', fontWeight: 800, color: changeColor,
              letterSpacing: '-0.01em', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {priceStr}
            </span>
            <span className="mono-num header-change" style={{
              fontSize: '11px', fontWeight: 700, color: changeColor,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {changeStr}
            </span>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }} />

        {/* ── Ticker stats — desktop only ── */}
        {ticker && (
          <div style={{
            display: 'flex', gap: '16px', alignItems: 'center',
            overflow: 'hidden', flexShrink: 1,
          }} className="desktop-stats hide-scrollbar">
            <StatChip label="H"   value={ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })} color="rgba(38,166,154,1)" />
            <StatChip label="L"   value={ticker.lowPrice.toLocaleString('en-US',  { maximumFractionDigits: 4 })} color="rgba(239,83,80,1)" />
            <StatChip label="VOL" value={formatCompact(ticker.quoteVolume)} color="rgba(255,255,255,0.80)" />
            {!globalStats.loading && (
              <>
                <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
                <StatChip label="MCAP"   value={formatCompact(globalStats.totalMarketCap)} color="rgba(255,255,255,0.80)" />
                <StatChip label="BTCDOM" value={globalStats.btcDominance.toFixed(1) + '%'} color="rgba(242,142,44,1)" />
                <StatChip
                  label="F&G"
                  value={globalStats.fearGreedValue + ' · ' + globalStats.fearGreedLabel.toUpperCase()}
                  color={fgColor}
                />
              </>
            )}
          </div>
        )}

        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.07)', flexShrink: 0, marginLeft: '10px' }} />

        {/* ── Status ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, margin: '0 10px' }}>
          <div
            className="live-dot"
            style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }}
          />
          <span style={{ fontSize: '9px', fontWeight: 700, color: statusColor, letterSpacing: '0.10em' }}>
            {statusLabel}
          </span>
          {/* Timestamp — hidden on mobile */}
          {timeStr && (
            <span className="header-timestamp" style={{
              fontSize: '9px', color: 'rgba(255,255,255,0.14)', letterSpacing: '0.04em',
            }}>
              {timeStr}
            </span>
          )}
        </div>

        {/* ── PRO CTA ── */}
        <button
          onClick={onOpenPro}
          className="badge-glow"
          aria-label="Upgrade to ZERØ ORDER BOOK PRO"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0 10px', height: '28px', flexShrink: 0,
            background: 'rgba(242,142,44,0.12)',
            border: '1px solid rgba(242,142,44,0.40)',
            borderRadius: '4px', cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '10px', fontWeight: 700,
            color: 'rgba(242,142,44,1)', letterSpacing: '0.07em',
            whiteSpace: 'nowrap',
          }}
        >
          ⚡ PRO $9
        </button>
      </div>

      <style>{`
        /* Mobile: hide non-essential header elements */
        @media (max-width: 767px) {
          .header-subtitle   { display: none !important; }
          .header-timestamp  { display: none !important; }
          .header-change     { display: none !important; }
        }
      `}</style>
    </header>
  );
});

Header.displayName = 'Header';

const StatChip: React.FC<{ label: string; value: string; color: string }> = React.memo(
  ({ label, value, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {label}
      </span>
      <span className="mono-num" style={{ fontSize: '10px', fontWeight: 700, color, lineHeight: 1.3 }}>
        {value}
      </span>
    </div>
  )
);
StatChip.displayName = 'StatChip';

export default Header;
