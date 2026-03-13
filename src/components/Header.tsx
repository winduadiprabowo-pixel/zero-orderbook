/**
 * Header.tsx — ZERØ ORDER BOOK · Redesign v89
 * Military HUD · Electric Cyan · IBM Plex Mono
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo, useRef, useEffect } from 'react';
import type { ConnectionStatus, SymbolInfo, TickerData, GlobalStats } from '@/types/market';
import { formatCompact, fearGreedColor } from '@/lib/formatters';
import CoinLogo from '@/components/CoinLogo';
import ExchangeSwitcher from '@/components/ExchangeSwitcher';
import { type ExchangeId } from '@/hooks/useExchange';
import FeedLatency from '@/components/FeedLatency';

interface HeaderProps {
  activeSymbol:     string;
  symbolInfo:       SymbolInfo;
  onOpenMarkets:    () => void;
  onOpenPro:        () => void;
  status:           ConnectionStatus;
  lastUpdate:       number;
  ticker:           TickerData | null;
  globalStats:      GlobalStats;
  latencyMs:        number | null;
  exchange:         ExchangeId;
  onExchangeChange: (ex: ExchangeId) => void;
  isStale?:         boolean;
}

function getTradeUrl(exchange: ExchangeId, symbol: string): string {
  const pair = symbol.replace('USDT', '_USDT');
  if (exchange === 'bybit')   return `https://www.bybit.com/trade/spot/${pair}`;
  if (exchange === 'binance') return `https://www.binance.com/trade/${symbol}?type=spot`;
  if (exchange === 'okx')     return `https://www.okx.com/trade-spot/${symbol.replace('USDT', '-USDT').toLowerCase()}`;
  return `https://www.bybit.com/trade/spot/${pair}`;
}

const TradeNowButton: React.FC<{ exchange: ExchangeId; symbol: string }> = React.memo(({ exchange, symbol }) => (
  <a
    href={getTradeUrl(exchange, symbol)}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      padding: '0 9px', height: '26px', flexShrink: 0,
      background: 'rgba(0,185,255,0.07)',
      border: '1px solid rgba(0,185,255,0.22)',
      borderRadius: '3px', cursor: 'pointer',
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '9px', fontWeight: 700,
      color: 'rgba(0,185,255,0.85)', letterSpacing: '0.08em',
      whiteSpace: 'nowrap', textDecoration: 'none',
      transition: 'background 150ms, border-color 150ms',
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,185,255,0.13)';
      (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(0,185,255,0.40)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,185,255,0.07)';
      (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(0,185,255,0.22)';
    }}
  >
    TRADE ↗
  </a>
));
TradeNowButton.displayName = 'TradeNowButton';

const Header: React.FC<HeaderProps> = React.memo(({
  activeSymbol, symbolInfo, onOpenMarkets, onOpenPro,
  status, lastUpdate, ticker, globalStats, latencyMs,
  exchange, onExchangeChange, isStale = false,
}) => {
  const statusColor = useMemo(() => {
    if (status === 'connected')    return 'rgba(0,205,115,1)';
    if (status === 'reconnecting') return 'rgba(242,162,33,1)';
    return 'rgba(255,60,82,1)';
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
    !ticker ? 'rgba(205,215,232,0.55)'
    : ticker.priceChangePercent >= 0 ? 'rgba(0,205,115,1)' : 'rgba(255,60,82,1)',
  [ticker]);

  const fgColor = fearGreedColor(globalStats.fearGreedValue);

  const priceElRef   = useRef<HTMLSpanElement>(null);
  const prevPriceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ticker) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = ticker.lastPrice;
    if (prev === null) return;
    const el = priceElRef.current;
    if (!el) return;
    const cls = ticker.lastPrice >= prev ? 'price-flash-up' : 'price-flash-down';
    el.classList.remove('price-flash-up', 'price-flash-down');
    void el.offsetWidth;
    el.classList.add(cls);
    const t = setTimeout(() => el?.classList.remove(cls), 400);
    return () => clearTimeout(t);
  }, [ticker?.lastPrice]);

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
      background: 'rgba(7,9,16,1)',
      borderBottom: '1px solid rgba(0,185,255,0.08)',
      flexShrink: 0,
      zIndex: 30,
      boxShadow: '0 1px 0 rgba(0,185,255,0.04), 0 4px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 14px',
        height: '46px', gap: '0',
        minWidth: 0,
      }}>

        {/* ── Logo ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginRight: '14px', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.10em', color: 'rgba(0,185,255,0.90)' }}>
            ZERØ
          </span>
          <span className="header-subtitle" style={{ fontSize: '7.5px', color: 'rgba(0,185,255,0.25)', fontWeight: 600, letterSpacing: '0.12em' }}>
            ORDER BOOK
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '18px', background: 'rgba(0,185,255,0.10)', flexShrink: 0, marginRight: '14px' }} />

        {/* ── Pair selector ── */}
        <button
          onClick={onOpenMarkets}
          aria-label="Change trading pair"
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: 'rgba(0,185,255,0.05)',
            border: '1px solid rgba(0,185,255,0.14)',
            borderRadius: '4px', cursor: 'pointer',
            fontFamily: 'inherit', padding: '5px 9px 5px 7px',
            flexShrink: 0,
            transition: 'background 120ms, border-color 120ms',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,185,255,0.10)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,185,255,0.30)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,185,255,0.05)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,185,255,0.14)';
          }}
        >
          <CoinLogo symbol={activeLabel.base} size={16} />
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(205,215,232,0.96)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
            {activeLabel.base}
            <span style={{ color: 'rgba(205,215,232,0.28)', fontWeight: 500 }}>/{activeLabel.quote}</span>
          </span>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="rgba(0,185,255,0.40)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* ── Price + change ── */}
        {ticker && (
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: '6px',
            marginLeft: '12px', flexShrink: 1, minWidth: 0, overflow: 'hidden',
          }}>
            <span ref={priceElRef} className="mono-num" style={{
              fontSize: '16px', fontWeight: 800, color: changeColor,
              letterSpacing: '-0.02em', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {priceStr}
            </span>
            <span className="mono-num header-change" style={{
              fontSize: '10.5px', fontWeight: 700, color: changeColor,
              whiteSpace: 'nowrap', flexShrink: 0,
              padding: '2px 5px', borderRadius: '3px',
              background: ticker.priceChangePercent >= 0 ? 'rgba(0,205,115,0.09)' : 'rgba(255,60,82,0.09)',
            }}>
              {changeStr}
            </span>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }} />

        {/* ── Stats bar — desktop only ── */}
        {ticker && (
          <div style={{
            display: 'flex', gap: '18px', alignItems: 'center',
            overflow: 'hidden', flexShrink: 1,
            padding: '0 12px',
            borderLeft: '1px solid rgba(255,255,255,0.04)',
            borderRight: '1px solid rgba(255,255,255,0.04)',
          }} className="desktop-stats hide-scrollbar">
            <StatChip label="H"   value={ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })} color="rgba(0,205,115,1)" />
            <StatChip label="L"   value={ticker.lowPrice.toLocaleString('en-US',  { maximumFractionDigits: 4 })} color="rgba(255,60,82,1)" />
            <StatChip label="VOL" value={formatCompact(ticker.quoteVolume)} color="rgba(205,215,232,0.78)" />
            {!globalStats.loading && (
              <>
                <StatChip label="MCAP"   value={formatCompact(globalStats.totalMarketCap)} color="rgba(205,215,232,0.78)" />
                <StatChip label="BTC.D"  value={globalStats.btcDominance.toFixed(1) + '%'} color="rgba(0,185,255,0.85)" />
                <StatChip
                  label="F&G"
                  value={globalStats.fearGreedValue + ' · ' + globalStats.fearGreedLabel.toUpperCase()}
                  color={fgColor}
                />
              </>
            )}
          </div>
        )}

        {/* ── Latency + Status ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, margin: '0 12px' }}>
          <div className="desktop-stats">
            <FeedLatency latencyMs={latencyMs} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }} />
            <span style={{ fontSize: '8.5px', fontWeight: 700, color: statusColor, letterSpacing: '0.12em' }}>
              {statusLabel}
            </span>
            {isStale && (
              <span style={{
                fontSize: '7.5px', fontWeight: 700, letterSpacing: '0.07em',
                padding: '1px 5px', borderRadius: '2px',
                background: 'rgba(242,162,33,0.10)', border: '1px solid rgba(242,162,33,0.28)',
                color: 'rgba(242,162,33,0.68)',
              }}>CACHED</span>
            )}
            {timeStr && (
              <span className="header-timestamp" style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.12)', letterSpacing: '0.04em' }}>
                {timeStr}
              </span>
            )}
          </div>
        </div>

        {/* ── Exchange Switcher ── */}
        <ExchangeSwitcher active={exchange} onChange={onExchangeChange} />

        {/* ── Trade button ── */}
        <TradeNowButton exchange={exchange} symbol={activeSymbol} />

        {/* ── PRO CTA ── */}
        <button
          onClick={onOpenPro}
          className="badge-glow"
          aria-label="Upgrade to PRO"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0 10px', height: '26px', flexShrink: 0,
            background: 'rgba(242,162,33,0.10)',
            border: '1px solid rgba(242,162,33,0.32)',
            borderRadius: '3px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '9px', fontWeight: 800,
            color: 'rgba(242,162,33,1)', letterSpacing: '0.08em',
            whiteSpace: 'nowrap', marginLeft: '8px',
          }}
        >
          ⚡ PRO $9
        </button>

        <div title="Built by indie dev · Surabaya 🇮🇩" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, cursor: 'default', marginLeft: '8px' }} className="header-timestamp">
          <span style={{ fontSize: '7.5px', color: 'rgba(255,255,255,0.10)', letterSpacing: '0.06em', fontWeight: 600 }}>indie · 🇮🇩</span>
        </div>
      </div>

      <style>{`
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span style={{ fontSize: '7.5px', fontWeight: 700, color: 'rgba(72,88,112,1)', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
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
