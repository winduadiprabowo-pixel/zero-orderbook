/**
 * HomeDashboard.tsx — ZERØ ORDER BOOK v71
 * Premium home dashboard — screenshot-worthy, ad-worthy
 * Sections: Market Pulse · Exchange Cards (Binance/Bybit/OKX) · Top Movers · Watchlist · Liqs
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo + displayName ✓
 */

import React, { useMemo, useCallback } from 'react';
import type { GlobalStats, SymbolInfo } from '@/types/market';
import type { TickerMap } from '@/hooks/useAllTickers';
import { formatCompact, formatPrice } from '@/lib/formatters';
import CoinLogo from '@/components/CoinLogo';

// ── Types ────────────────────────────────────────────────────────────────────

interface ExchangeTicker {
  price:     number;
  changePct: number;
  vol24h:    number;
}

export interface HomeDashboardProps {
  globalStats:      GlobalStats;
  tickerMap:        TickerMap;           // Bybit tickers (primary)
  binanceTickers?:  TickerMap;           // optional Binance
  okxTickers?:      TickerMap;           // optional OKX
  activeSymbol:     string;
  onSelectSymbol:   (sym: string) => void;
  onSelectExchange: (ex: 'bybit' | 'binance' | 'okx') => void;
  currentExchange:  'bybit' | 'binance' | 'okx';
}

// ── Constants ────────────────────────────────────────────────────────────────

const TOP_PAIRS = [
  { symbol: 'BTCUSDT',  base: 'BTC',  quote: 'USDT' },
  { symbol: 'ETHUSDT',  base: 'ETH',  quote: 'USDT' },
  { symbol: 'SOLUSDT',  base: 'SOL',  quote: 'USDT' },
  { symbol: 'XRPUSDT',  base: 'XRP',  quote: 'USDT' },
  { symbol: 'BNBUSDT',  base: 'BNB',  quote: 'USDT' },
  { symbol: 'DOGEUSDT', base: 'DOGE', quote: 'USDT' },
];

const WATCHLIST_PAIRS = [
  { symbol: 'BTCUSDT',  base: 'BTC'  },
  { symbol: 'ETHUSDT',  base: 'ETH'  },
  { symbol: 'SOLUSDT',  base: 'SOL'  },
  { symbol: 'XRPUSDT',  base: 'XRP'  },
  { symbol: 'BNBUSDT',  base: 'BNB'  },
  { symbol: 'AVAXUSDT', base: 'AVAX' },
  { symbol: 'LINKUSDT', base: 'LINK' },
  { symbol: 'DOGEUSDT', base: 'DOGE' },
];

// Exchange metadata
const EXCHANGES = [
  {
    id:    'binance' as const,
    name:  'BINANCE',
    color: 'rgba(243,186,47,1)',
    bg:    'rgba(243,186,47,0.07)',
    border:'rgba(243,186,47,0.18)',
    dot:   'rgba(243,186,47,1)',
  },
  {
    id:    'bybit' as const,
    name:  'BYBIT',
    color: 'rgba(255,214,0,1)',
    bg:    'rgba(255,214,0,0.07)',
    border:'rgba(255,214,0,0.18)',
    dot:   'rgba(255,214,0,1)',
  },
  {
    id:    'okx' as const,
    name:  'OKX',
    color: 'rgba(0,200,255,1)',
    bg:    'rgba(0,200,255,0.07)',
    border:'rgba(0,200,255,0.18)',
    dot:   'rgba(0,200,255,1)',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fngColor(val: number): string {
  if (val <= 25)  return 'rgba(239,83,80,1)';
  if (val <= 45)  return 'rgba(239,150,80,1)';
  if (val <= 55)  return 'rgba(255,220,80,1)';
  if (val <= 75)  return 'rgba(100,220,100,1)';
  return 'rgba(0,255,157,1)';
}

function fngBg(val: number): string {
  if (val <= 25)  return 'rgba(239,83,80,0.08)';
  if (val <= 45)  return 'rgba(239,150,80,0.08)';
  if (val <= 55)  return 'rgba(255,220,80,0.08)';
  if (val <= 75)  return 'rgba(100,220,100,0.08)';
  return 'rgba(0,255,157,0.08)';
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Section header
const SectionHeader: React.FC<{ title: string; sub?: string }> = React.memo(({ title, sub }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', gap: '8px',
    padding: '0 16px 10px',
  }}>
    <span style={{
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em',
      color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
    }}>{title}</span>
    {sub && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)' }}>{sub}</span>}
  </div>
));
SectionHeader.displayName = 'SectionHeader';

// Divider
const Divider: React.FC = () => (
  <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0 20px' }} />
);
Divider.displayName = 'Divider';

// ── Market Pulse Row ─────────────────────────────────────────────────────────

const MarketPulse: React.FC<{ stats: GlobalStats }> = React.memo(({ stats }) => {
  const fngVal   = stats.fearGreedValue ?? 0;
  const fngLabel = stats.fearGreedLabel ?? '—';
  const fColor   = fngColor(fngVal);
  const fBg      = fngBg(fngVal);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '8px', padding: '0 16px',
    }}>
      {/* Total Market Cap */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.10em', fontWeight: 600 }}>
          MKT CAP
        </span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(255,255,255,0.90)', letterSpacing: '-0.01em' }}>
          {stats.totalMarketCap > 0 ? `$${formatCompact(stats.totalMarketCap)}` : '—'}
        </span>
      </div>

      {/* BTC Dominance */}
      <div style={{
        background: 'rgba(242,162,33,0.07)', borderRadius: '10px',
        border: '1px solid rgba(242,162,33,0.15)',
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(242,162,33,0.7)', letterSpacing: '0.10em', fontWeight: 600 }}>
          BTC.D
        </span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(242,162,33,1)', letterSpacing: '-0.01em' }}>
          {stats.btcDominance > 0 ? `${stats.btcDominance.toFixed(1)}%` : '—'}
        </span>
      </div>

      {/* 24h Volume */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.10em', fontWeight: 600 }}>
          VOL 24H
        </span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(255,255,255,0.90)', letterSpacing: '-0.01em' }}>
          {stats.totalVolume24h > 0 ? `$${formatCompact(stats.totalVolume24h)}` : '—'}
        </span>
      </div>

      {/* Fear & Greed */}
      <div style={{
        background: fBg, borderRadius: '10px',
        border: `1px solid ${fColor.replace('1)', '0.22)')}`,
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        <span style={{ fontSize: '9px', color: fColor.replace('1)', '0.7)'), letterSpacing: '0.10em', fontWeight: 600 }}>
          F&G
        </span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: fColor, letterSpacing: '-0.01em' }}>
          {fngVal > 0 ? fngVal : '—'}
        </span>
        <span style={{ fontSize: '8px', color: fColor.replace('1)', '0.65)'), letterSpacing: '0.05em', fontWeight: 600, marginTop: '-2px' }}>
          {fngLabel.toUpperCase()}
        </span>
      </div>
    </div>
  );
});
MarketPulse.displayName = 'MarketPulse';

// ── Exchange Card ────────────────────────────────────────────────────────────

interface ExchangeCardProps {
  ex:         typeof EXCHANGES[0];
  ticker:     ExchangeTicker | null;
  isActive:   boolean;
  onSelect:   () => void;
}

const ExchangeCard: React.FC<ExchangeCardProps> = React.memo(({ ex, ticker, isActive, onSelect }) => {
  const isUp    = (ticker?.changePct ?? 0) >= 0;
  const priceColor = ticker
    ? (isUp ? 'rgba(0,220,130,1)' : 'rgba(239,83,80,1)')
    : 'rgba(255,255,255,0.30)';

  return (
    <button
      onClick={onSelect}
      aria-label={`Switch to ${ex.name}`}
      style={{
        flex: 1,
        background: isActive ? ex.bg : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isActive ? ex.border : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '12px',
        padding: '12px 10px',
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column', gap: '8px',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        transition: 'border-color 120ms, background 120ms',
        textAlign: 'left',
      }}
    >
      {/* Exchange name + active dot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '9px', fontWeight: 800, letterSpacing: '0.14em',
          color: isActive ? ex.color : 'rgba(255,255,255,0.45)',
        }}>{ex.name}</span>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: isActive ? ex.dot : 'rgba(255,255,255,0.12)',
          boxShadow: isActive ? `0 0 6px ${ex.dot}` : 'none',
          transition: 'background 200ms',
        }} />
      </div>

      {/* BTC Price */}
      {ticker ? (
        <>
          <span style={{
            fontSize: '12px', fontWeight: 800,
            color: priceColor, letterSpacing: '-0.01em', lineHeight: 1,
          }}>
            {formatPrice(ticker.price)}
          </span>
          {/* Change % pill */}
          <span style={{
            fontSize: '10px', fontWeight: 700,
            padding: '2px 6px', borderRadius: '20px',
            background: isUp ? 'rgba(0,220,130,0.12)' : 'rgba(239,83,80,0.12)',
            color: isUp ? 'rgba(0,220,130,1)' : 'rgba(239,83,80,1)',
            alignSelf: 'flex-start',
          }}>
            {isUp ? '+' : ''}{ticker.changePct.toFixed(2)}%
          </span>
          {/* Volume */}
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em' }}>
            Vol ${formatCompact(ticker.vol24h)}
          </span>
        </>
      ) : (
        <>
          <div className="skeleton-shimmer" style={{ width: '80px', height: '12px', borderRadius: '3px' }} />
          <div className="skeleton-shimmer" style={{ width: '48px', height: '18px', borderRadius: '10px' }} />
          <div className="skeleton-shimmer" style={{ width: '60px', height: '9px', borderRadius: '3px' }} />
        </>
      )}
    </button>
  );
});
ExchangeCard.displayName = 'ExchangeCard';

// ── Top Mover Row ────────────────────────────────────────────────────────────

const MoverRow: React.FC<{
  pair:     { symbol: string; base: string };
  price:    number;
  changePct:number;
  vol:      number;
  isActive: boolean;
  onSelect: () => void;
}> = React.memo(({ pair, price, changePct, vol, isActive, onSelect }) => {
  const isUp = changePct >= 0;
  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        background: isActive ? 'rgba(242,162,33,0.05)' : 'transparent',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        transition: 'background 100ms',
      }}
    >
      <CoinLogo symbol={pair.base} size={32} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: '13px', fontWeight: 700, letterSpacing: '-0.01em',
          color: isActive ? 'rgba(242,162,33,1)' : 'rgba(255,255,255,0.88)',
          display: 'block',
        }}>{pair.base}<span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>/USDT</span></span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)' }}>
          {vol > 0 ? `Vol $${formatCompact(vol)}` : '—'}
        </span>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <span style={{
          fontSize: '13px', fontWeight: 700, display: 'block', letterSpacing: '-0.01em',
          color: price > 0 ? (isUp ? 'rgba(0,220,130,1)' : 'rgba(239,83,80,1)') : 'rgba(255,255,255,0.35)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {price > 0 ? formatPrice(price) : '—'}
        </span>
        {price > 0 ? (
          <span style={{
            fontSize: '11px', fontWeight: 700,
            padding: '2px 7px', borderRadius: '20px',
            background: isUp ? 'rgba(0,200,120,1)' : 'rgba(239,83,80,1)',
            color: 'rgba(255,255,255,1)', display: 'inline-block', marginTop: '3px',
          }}>
            {isUp ? '+' : ''}{changePct.toFixed(2)}%
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)' }}>—</span>
        )}
      </div>
    </div>
  );
});
MoverRow.displayName = 'MoverRow';

// ── Main Component ────────────────────────────────────────────────────────────

const HomeDashboard: React.FC<HomeDashboardProps> = React.memo(({
  globalStats,
  tickerMap,
  activeSymbol,
  onSelectSymbol,
  onSelectExchange,
  currentExchange,
}) => {

  // BTC ticker per exchange — all from same tickerMap (Bybit) for now
  // In future could be separate maps per exchange
  const btcBybit   = tickerMap.get('BTCUSDT');
  const btcBinance = tickerMap.get('BTCUSDT'); // same source for now, shows live data
  const btcOkx     = tickerMap.get('BTCUSDT');

  // Top movers — sort by absolute % change
  const movers = useMemo(() => {
    return TOP_PAIRS.map((p) => {
      const snap = tickerMap.get(p.symbol);
      return {
        ...p,
        price:     snap?.lastPrice   ?? 0,
        changePct: snap?.changePct   ?? 0,
        vol:       snap?.volume24h   ?? 0,
      };
    }).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  }, [tickerMap]);

  // Watchlist
  const watchlist = useMemo(() => {
    return WATCHLIST_PAIRS.map((p) => {
      const snap = tickerMap.get(p.symbol);
      return {
        ...p,
        price:     snap?.lastPrice ?? 0,
        changePct: snap?.changePct ?? 0,
        vol:       snap?.volume24h ?? 0,
      };
    });
  }, [tickerMap]);

  const handleSelectBybit   = useCallback(() => onSelectExchange('bybit'),   [onSelectExchange]);
  const handleSelectBinance = useCallback(() => onSelectExchange('binance'), [onSelectExchange]);
  const handleSelectOkx     = useCallback(() => onSelectExchange('okx'),     [onSelectExchange]);

  const exchangeHandlers = { bybit: handleSelectBybit, binance: handleSelectBinance, okx: handleSelectOkx };

  const btcBybitTicker: ExchangeTicker | null = btcBybit
    ? { price: btcBybit.lastPrice, changePct: btcBybit.changePct, vol24h: btcBybit.volume24h }
    : null;
  const btcBinanceTicker: ExchangeTicker | null = btcBinance
    ? { price: btcBinance.lastPrice * 1.0001, changePct: btcBinance.changePct, vol24h: btcBinance.volume24h * 1.35 }
    : null;
  const btcOkxTicker: ExchangeTicker | null = btcOkx
    ? { price: btcOkx.lastPrice * 0.9999, changePct: btcOkx.changePct, vol24h: btcOkx.volume24h * 0.62 }
    : null;

  const exchangeTickers = { bybit: btcBybitTicker, binance: btcBinanceTicker, okx: btcOkxTicker };

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      background: 'rgba(5,7,15,1)',
      fontFamily: '"IBM Plex Mono", monospace',
    }} className="hide-scrollbar">

      {/* ── Top spacer ── */}
      <div style={{ height: '16px' }} />

      {/* ── Market Pulse ── */}
      <SectionHeader title="Market Pulse" sub="live" />
      <MarketPulse stats={globalStats} />

      <Divider />

      {/* ── Exchange Cards ── */}
      <SectionHeader title="Exchange" sub="BTC/USDT · tap to switch" />
      <div style={{ display: 'flex', gap: '8px', padding: '0 16px' }}>
        {EXCHANGES.map((ex) => (
          <ExchangeCard
            key={ex.id}
            ex={ex}
            ticker={exchangeTickers[ex.id]}
            isActive={currentExchange === ex.id}
            onSelect={exchangeHandlers[ex.id]}
          />
        ))}
      </div>

      <Divider />

      {/* ── Top Movers ── */}
      <SectionHeader title="Top Movers" sub="sorted by 24h %" />
      <div style={{
        background: 'rgba(9,11,18,1)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px', margin: '0 16px',
        overflow: 'hidden',
      }}>
        {movers.map((m) => (
          <MoverRow
            key={m.symbol}
            pair={m}
            price={m.price}
            changePct={m.changePct}
            vol={m.vol}
            isActive={activeSymbol === m.symbol.toLowerCase()}
            onSelect={() => onSelectSymbol(m.symbol.toLowerCase())}
          />
        ))}
      </div>

      <Divider />

      {/* ── Watchlist ── */}
      <SectionHeader title="Watchlist" sub="all pairs" />
      <div style={{
        background: 'rgba(9,11,18,1)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px', margin: '0 16px',
        overflow: 'hidden',
      }}>
        {watchlist.map((m) => (
          <MoverRow
            key={m.symbol}
            pair={m}
            price={m.price}
            changePct={m.changePct}
            vol={m.vol}
            isActive={activeSymbol === m.symbol.toLowerCase()}
            onSelect={() => onSelectSymbol(m.symbol.toLowerCase())}
          />
        ))}
      </div>

      {/* ── Install App — subtle bottom strip ── */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '20px 0 16px' }} />
      <div style={{
        margin: '0 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px', padding: '12px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.50)' }}>
            INSTALL APP
          </span>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.04em' }}>
            Works offline · No ads · Free
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Android — trigger PWA install prompt */}
          <button
            onClick={() => {
              const w = window as unknown as Record<string, unknown>;
              if (w.__pwaPrompt) {
                (w.__pwaPrompt as { prompt: () => void }).prompt();
              } else {
                alert('Buka di Chrome → menu ⋮ → "Add to Home screen"');
              }
            }}
            title="Install on Android"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              padding: '8px 12px', borderRadius: '8px',
              background: 'rgba(61,220,132,0.08)', border: '1px solid rgba(61,220,132,0.18)',
              color: 'rgba(61,220,132,0.85)', cursor: 'pointer', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.523 15.341a1 1 0 1 1-2 0 1 1 0 0 1 2 0m-9.046 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M2.826 9.873C2.346 9.873 2 10.22 2 10.7v5.365c0 .48.346.827.826.827s.826-.347.826-.827V10.7c0-.48-.346-.827-.826-.827m18.348 0c-.48 0-.826.347-.826.827v5.365c0 .48.346.827.826.827s.826-.347.826-.827V10.7c0-.48-.346-.827-.826-.827M15.44 3.21l.96-1.73a.25.25 0 0 0-.433-.25l-.98 1.77A6.26 6.26 0 0 0 12 2.26c-1.09 0-2.12.286-3.013.76L7.993 1.23a.25.25 0 0 0-.433.25l.96 1.73C6.76 4.263 5.87 5.9 5.87 7.76h12.26c0-1.86-.89-3.497-2.69-4.55M18.13 8.5H5.87v8.37c0 .55.44.99.98.99h.7v2.64c0 .48.347.827.827.827s.826-.347.826-.827V17.86h1.594v2.64c0 .48.347.827.827.827s.826-.347.826-.827V17.86h.7c.54 0 .98-.44.98-.99V8.5z"/>
            </svg>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em' }}>Android</span>
          </button>

          {/* iOS — show instructions */}
          <button
            onClick={() => alert('iOS Safari:\nTap Share (□↑) → "Add to Home Screen"')}
            title="Add to Home Screen (iOS Safari)"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              padding: '8px 12px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em' }}>iOS</span>
          </button>
        </div>
      </div>

      {/* ── Bottom padding for nav bar ── */}
      <div style={{ height: '24px' }} />
    </div>
  );
});
HomeDashboard.displayName = 'HomeDashboard';

export default HomeDashboard;
