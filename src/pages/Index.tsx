/**
 * Index.tsx — ZERØ ORDER BOOK v59
 * DESKTOP: Chart full width (no sidebar) | Pair selector in header
 * MOBILE:  Market list first → tap pair → chart view (Bybit-style)
 * TABLET:  Chart top + tabs bottom
 * Performance: RAF-gated WS · no per-row state · React.memo everywhere
 * rgba() only ✓ · IBM Plex Mono ✓ · PRO CTA preserved ✓
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useThermalMonitor } from '@/hooks/useThermalMonitor';
import { Panel, PanelGroup } from 'react-resizable-panels';

import Header        from '@/components/Header';
import OrderBook, { PressureBar } from '@/components/OrderBook';
import LightweightChart           from '@/components/LightweightChart';
import DepthChart                 from '@/components/DepthChart';
import RecentTrades               from '@/components/RecentTrades';
import MarketData                 from '@/components/MarketData';
import LiquidationFeed            from '@/components/LiquidationFeed';
import ResizeHandle               from '@/components/ResizeHandle';
import SymbolSearch               from '@/components/SymbolSearch';
import CoinLogo                   from '@/components/CoinLogo';
import CvdChart                   from '@/components/CvdChart';

import LicenseModal, { ProLock } from '@/components/LicenseGate';
import ExchangeSwitcher        from '@/components/ExchangeSwitcher';
import { type ExchangeId, getExchange } from '@/hooks/useExchange';
import { useMultiExchangeWs }  from '@/hooks/useMultiExchangeWs';
import { useProAccess }          from '@/hooks/useProAccess';

import { useLiquidations } from '@/hooks/useLiquidations';
import { useGlobalStats }  from '@/hooks/useGlobalStats';
import { useMarketPairs }  from '@/hooks/useMarketPairs';
import { useAllTickers }   from '@/hooks/useAllTickers';
import type { TickerMap }  from '@/hooks/useAllTickers';
import { formatCompact, formatPrice } from '@/lib/formatters';

import {
  PINNED_SYMBOLS,
  getSmartPriceDec,
  type Interval,
  type Precision,
  type ConnectionStatus,
  type SymbolInfo,
} from '@/types/market';

// ── Mobile tabs ───────────────────────────────────────────────────────────────

type MobileTab = 'markets' | 'chart' | 'book' | 'depth' | 'trades' | 'cvd' | 'liqs';

// SVG icons — no emoji, no unicode garbage
const TAB_ICONS: Record<MobileTab, React.ReactNode> = {
  markets: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="11" y="4" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="2" y="11" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="11" y="11" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  chart: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <polyline points="2,15 6,9 10,12 14,6 18,3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="2" y1="17" x2="18" y2="17" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
    </svg>
  ),
  book: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="10" y="3" width="8" height="1.8" rx="0.9" fill="rgba(0,255,157,0.85)"/>
      <rect x="10" y="6.5" width="6" height="1.8" rx="0.9" fill="rgba(0,255,157,0.55)"/>
      <rect x="10" y="10" width="7" height="1.8" rx="0.9" fill="rgba(255,59,92,0.55)"/>
      <rect x="10" y="13.5" width="5" height="1.8" rx="0.9" fill="rgba(255,59,92,0.85)"/>
      <line x1="9" y1="2" x2="9" y2="18" stroke="currentColor" strokeWidth="0.8" opacity="0.2"/>
      <rect x="2" y="3" width="5" height="1.8" rx="0.9" fill="rgba(255,59,92,0.85)"/>
      <rect x="2" y="6.5" width="4" height="1.8" rx="0.9" fill="rgba(255,59,92,0.55)"/>
      <rect x="2" y="10" width="5" height="1.8" rx="0.9" fill="rgba(0,255,157,0.55)"/>
      <rect x="2" y="13.5" width="3" height="1.8" rx="0.9" fill="rgba(0,255,157,0.85)"/>
    </svg>
  ),
  depth: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2 16 L5 12 L8 14 L10 10 L12 14 L15 12 L18 16 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <line x1="2" y1="16" x2="18" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
    </svg>
  ),
  trades: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <line x1="2" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="16" cy="5" r="2.2" fill="rgba(0,255,157,1)"/>
      <line x1="2" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="14" cy="10" r="2.2" fill="rgba(255,59,92,1)"/>
      <line x1="2" y1="15" x2="14" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="17" cy="15" r="2.2" fill="rgba(0,255,157,1)"/>
    </svg>
  ),
  cvd: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2 13 C4 13 5 7 8 9 C11 11 12 5 15 6 C17 7 17 9 18 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      <line x1="2" y1="16" x2="18" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
    </svg>
  ),
  liqs: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2 L13 7.5 L18.5 8.5 L14.5 12.5 L15.5 18 L10 15.2 L4.5 18 L5.5 12.5 L1.5 8.5 L7 7.5 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
};

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: 'markets', label: 'Markets' },
  { id: 'chart',   label: 'Chart'   },
  { id: 'book',    label: 'Book'    },
  { id: 'depth',   label: 'Depth'   },
  { id: 'trades',  label: 'Trades'  },
  { id: 'cvd',     label: 'CVD'     },
  { id: 'liqs',    label: 'Liqs'    },
];

type TabletBottomTab = 'depth' | 'stats' | 'liqs';
const TABLET_BOTTOM_TABS: { id: TabletBottomTab; label: string }[] = [
  { id: 'depth', label: 'DEPTH'     },
  { id: 'stats', label: 'MKT STATS' },
  { id: 'liqs',  label: 'LIQS'      },
];

// ── Precision options ─────────────────────────────────────────────────────────

function getPrecisionOptions(priceDec: number): Precision[] {
  if (priceDec >= 7) return ['0.00000001', '0.0000001', '0.000001'];
  if (priceDec >= 5) return ['0.000001',   '0.00001',   '0.0001'  ];
  if (priceDec >= 3) return ['0.001',       '0.0001',    '0.00001' ];
  if (priceDec >= 1) return ['0.1',          '0.01',      '0.001'  ];
  return ['0.1', '0.01', '0.001'];
}

// ── Sub-components ────────────────────────────────────────────────────────────

const MobileTabBtn: React.FC<{
  tab: typeof MOBILE_TABS[number]; active: boolean; onClick: () => void;
}> = React.memo(({ tab, active, onClick }) => (
  <button
    aria-label={tab.label}
    onClick={onClick}
    style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '4px', padding: '8px 2px 6px',
      border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', minHeight: '56px',
      background: 'transparent',
      color: active ? 'rgba(242,162,33,1)' : 'rgba(255,255,255,0.32)',
      borderTop: active ? '2px solid rgba(242,162,33,1)' : '2px solid transparent',
      transition: 'color 100ms',
      WebkitTapHighlightColor: 'transparent',
      position: 'relative',
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
      {TAB_ICONS[tab.id]}
    </span>
    <span style={{
      fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em',
      lineHeight: 1,
    }}>{tab.label}</span>
  </button>
));
MobileTabBtn.displayName = 'MobileTabBtn';

const ConnectionBanner: React.FC<{
  status: ConnectionStatus; onRetry: () => void;
}> = React.memo(({ status, onRetry }) => {
  if (status === 'connected') return null;
  const isReconn = status === 'reconnecting';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '5px 16px', flexShrink: 0,
      background:   isReconn ? 'rgba(242,142,44,0.07)' : 'rgba(239,83,80,0.07)',
      borderBottom: '1px solid ' + (isReconn ? 'rgba(242,142,44,0.14)' : 'rgba(239,83,80,0.14)'),
      color:        isReconn ? 'rgba(242,142,44,1)'    : 'rgba(239,83,80,1)',
      fontSize: '10px', fontWeight: 700,
    }}>
      <div className="live-dot" style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: 'currentColor', flexShrink: 0,
      }} />
      {isReconn ? 'Reconnecting...' : 'Connection lost — data may be stale'}
      {!isReconn && (
        <button onClick={onRetry} style={{
          marginLeft: '4px', padding: '2px 10px',
          border: '1px solid rgba(239,83,80,1)', borderRadius: '2px',
          background: 'transparent', color: 'rgba(239,83,80,1)',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
        }}>Retry</button>
      )}
    </div>
  );
});
ConnectionBanner.displayName = 'ConnectionBanner';

const PanelHeader: React.FC<{ title: string; right?: React.ReactNode }> = React.memo(
  ({ title, right }) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(16,19,28,1)', flexShrink: 0,
    }}>
      <span className="label-sm">{title}</span>
      {right}
    </div>
  )
);
PanelHeader.displayName = 'PanelHeader';

// ── Mobile Market List ────────────────────────────────────────────────────────

// ── Hero Carousel — top 8 pairs swipeable ────────────────────────────────────
// v63: Grok suggestion — quick pair switch tanpa scroll list panjang

const HERO_PAIRS = PINNED_SYMBOLS.slice(0, 8) as readonly SymbolInfo[];

const HeroPairCard: React.FC<{
  item:      SymbolInfo;
  isActive:  boolean;
  onSelect:  (sym: string) => void;
  price:     number;
  changePct: number;
}> = React.memo(({ item, isActive, onSelect, price, changePct }) => {
  const handleClick = useCallback(() => onSelect(item.symbol), [item.symbol, onSelect]);
  const isUp = changePct >= 0;

  return (
    <button
      onClick={handleClick}
      aria-label={`Switch to ${item.label}`}
      style={{
        flexShrink: 0,
        width: '96px', minHeight: '72px',
        padding: '8px 10px 7px',
        background: isActive ? 'rgba(242,162,33,0.10)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isActive ? 'rgba(242,162,33,0.40)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        transition: 'border-color 120ms, background 120ms',
        scrollSnapAlign: 'start',
      }}
    >
      <span style={{
        fontSize: '12px', fontWeight: 800, letterSpacing: '-0.01em',
        color: isActive ? 'rgba(242,162,33,1)' : 'rgba(255,255,255,0.88)',
      }}>
        {item.base}
      </span>
      {price > 0 ? (
        <span className="mono-num" style={{
          fontSize: item.base.length > 3 ? '10px' : '11px', fontWeight: 700,
          color: isUp ? 'rgba(0,220,130,1)' : 'rgba(239,83,80,1)',
          letterSpacing: '-0.01em', lineHeight: 1.1,
        }}>
          {formatPrice(price)}
        </span>
      ) : (
        <div className="skeleton-shimmer" style={{ width: '58px', height: '9px', borderRadius: 2 }} />
      )}
      {price > 0 ? (
        <span style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.01em',
          color: isUp ? 'rgba(0,220,130,1)' : 'rgba(239,83,80,1)',
          padding: '2px 5px', borderRadius: '4px',
          background: isUp ? 'rgba(0,220,130,0.10)' : 'rgba(239,83,80,0.10)',
        }}>
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      ) : (
        <div className="skeleton-shimmer" style={{ width: '40px', height: '16px', borderRadius: 4 }} />
      )}
    </button>
  );
});
HeroPairCard.displayName = 'HeroPairCard';

const MobileMarketRow: React.FC<{
  item:      SymbolInfo;
  isActive:  boolean;
  onSelect:  (sym: string) => void;
  price:     number;
  changePct: number;
  vol:       number;
}> = React.memo(({ item, isActive, onSelect, price, changePct, vol }) => {
  const handleClick = useCallback(() => onSelect(item.symbol), [item.symbol, onSelect]);
  const isUp      = changePct >= 0;
  // Bybit-style: solid pill badge
  const pillColor = isUp ? 'rgba(0,200,120,1)' : 'rgba(239,83,80,1)';

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '11px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        background: isActive ? 'rgba(242,162,33,0.06)' : 'transparent',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      <CoinLogo symbol={item.base} size={36} />

      {/* Symbol + Volume */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
          <span style={{
            fontSize: '14px', fontWeight: 700,
            color: isActive ? 'rgba(242,162,33,1)' : 'rgba(255,255,255,0.92)',
            letterSpacing: '-0.01em',
          }}>
            {item.base}
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>
            /{item.quote}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>
          Vol {vol > 0 ? formatCompact(vol) : '—'}
        </div>
      </div>

      {/* Price + Pill badge — Bybit style */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0 }}>
        <span style={{
          fontSize: '14px', fontWeight: 700,
          color: snap ? (isUp ? 'rgba(0,220,130,1)' : 'rgba(239,83,80,1)') : 'rgba(255,255,255,0.55)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
          pointerEvents: 'none',
        }}>
          {price > 0 ? formatPrice(price) : '—'}
        </span>
        {snap ? (
          <span style={{
            fontSize: '11px', fontWeight: 700,
            padding: '3px 8px', borderRadius: '20px',
            background: pillColor,
            color: 'rgba(255,255,255,1)',
            letterSpacing: '0.01em',
            pointerEvents: 'none',
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
MobileMarketRow.displayName = 'MobileMarketRow';

const MobileMarketList: React.FC<{
  pairs:        SymbolInfo[];
  loading:      boolean;
  activeSymbol: string;
  onSelect:     (sym: string) => void;
  tickerMap:    TickerMap;
}> = React.memo(({ pairs, loading, activeSymbol, onSelect, tickerMap }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return pairs;
    return pairs.filter((p) =>
      p.base.includes(q) || p.symbol.toUpperCase().includes(q)
    );
  }, [pairs, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(10,11,20,1)' }}>
      {/* ── Hero carousel — swipe to quick-switch pair ── */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 14px 10px',
          overflowX: 'auto',
          display: 'flex',
          gap: '8px',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        }}
        className="hide-scrollbar"
        aria-label="Quick pair selector"
      >
        {HERO_PAIRS.map((item) => {
          const snap = tickerMap.get(item.symbol.toUpperCase());
          return (
            <HeroPairCard
              key={item.symbol}
              item={item}
              isActive={activeSymbol === item.symbol}
              onSelect={onSelect}
              price={snap?.lastPrice ?? 0}
              changePct={snap?.changePct ?? 0}
            />
          );
        })}
      </div>
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />

      {/* Search bar — Bybit style */}
      <div style={{
        padding: '12px 14px 10px',
        flexShrink: 0,
        background: 'rgba(10,11,20,1)',
      }}>
        <div style={{ position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', opacity: 0.35,
          }}>
            <circle cx="7" cy="7" r="4.5" stroke="white" strokeWidth="1.4"/>
            <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pairs..."
            autoComplete="off"
            style={{
              width: '100%', padding: '11px 36px 11px 36px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '8px',
              color: 'rgba(255,255,255,0.9)',
              fontFamily: 'inherit', fontSize: '14px',
              outline: 'none', boxSizing: 'border-box' as const,
              caretColor: 'rgba(242,162,33,1)',
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(242,162,33,0.5)'; (e.target as HTMLInputElement).style.background = 'rgba(255,255,255,0.08)'; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.target as HTMLInputElement).style.background = 'rgba(255,255,255,0.06)'; }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.6)', fontSize: '14px',
                width: '20px', height: '20px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, padding: 0,
              }}
            >×</button>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 16px 6px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.28)' }}>
          Symbol / Vol
        </span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.28)', marginRight: '16px' }}>
            Price
          </span>
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.28)', minWidth: '52px', textAlign: 'right' }}>
            {loading ? '...' : `${filtered.length} pairs`}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="hide-scrollbar">
        {filtered.map((item) => {
          const snap = tickerMap.get(item.symbol.toUpperCase());
          return (
            <MobileMarketRow
              key={item.symbol}
              item={item}
              isActive={item.symbol === activeSymbol}
              onSelect={onSelect}
              price={snap?.lastPrice ?? 0}
              changePct={snap?.changePct ?? 0}
              vol={snap?.volume24h ?? item.volume24h ?? 0}
            />
          );
        })}
        {filtered.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '120px', color: 'rgba(255,255,255,0.22)', fontSize: '13px',
          }}>
            No pairs found
          </div>
        )}
      </div>
    </div>
  );
});
MobileMarketList.displayName = 'MobileMarketList';

// ── PWA Install Banner ────────────────────────────────────────────────────────
// v62: Shows "Add to Home Screen" on mobile browsers, hides in standalone mode

const PwaInstallBanner: React.FC = React.memo(() => {
  const [prompt, setPrompt] = React.useState<Event | null>(null);
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem('zero_pwa_dismissed') === '1'; } catch { return false; }
  });

  React.useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Hide if already installed as PWA
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as Record<string,boolean>).standalone === true;

  if (!prompt || dismissed || isStandalone) return null;

  const install = async () => {
    const p = prompt as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDismissed(true);
      try { localStorage.setItem('zero_pwa_dismissed', '1'); } catch {}
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('zero_pwa_dismissed', '1'); } catch {}
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 14px', flexShrink: 0,
      background: 'rgba(0,82,255,0.07)',
      borderBottom: '1px solid rgba(0,82,255,0.18)',
    }}>
      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.70)', flex: 1 }}>
        📲 Install ZERØ ORDER BOOK — faster, works offline
      </span>
      <button
        onClick={install}
        className="compact-btn"
        style={{
          padding: '5px 12px', border: '1px solid rgba(0,82,255,0.55)',
          borderRadius: '4px', background: 'rgba(0,82,255,0.18)',
          color: 'rgba(100,160,255,1)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '10px', fontWeight: 700,
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="compact-btn"
        style={{
          padding: '4px 8px', border: 'none', background: 'transparent',
          color: 'rgba(255,255,255,0.28)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '12px',
        }}
        aria-label="Dismiss install banner"
      >×</button>
    </div>
  );
});
PwaInstallBanner.displayName = 'PwaInstallBanner';

const Index: React.FC = () => {
  const { isPro, unlock }      = useProAccess();
  const [showProModal,  setShowProModal]  = useState(false);
  // v54: thermal monitor — reduce levels when FPS drops
  const [throttleFactor, setThrottleFactor] = useState<1.0 | 0.8 | 0.5>(1.0);
  useThermalMonitor(setThrottleFactor);
  // v50: visibility throttle — pause non-critical updates when tab hidden
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  // Exchange state — persist across refreshes
  const [exchange, setExchange] = useState<ExchangeId>(() => {
    try { return (localStorage.getItem('zero_exchange') as ExchangeId) ?? 'bybit'; } catch { return 'bybit'; }
  });
  const handleExchangeChange = useCallback((ex: ExchangeId) => {
    setExchange(ex);
    try { localStorage.setItem('zero_exchange', ex); } catch {}
  }, []);

  // Persist symbol + interval across refreshes
  const [activeSymbol, setActiveSymbol] = useState<string>(() => {
    try { return localStorage.getItem('zero_symbol') ?? 'btcusdt'; } catch { return 'btcusdt'; }
  });
  // v65: wsSymbol feeds WS hook — debounced 80ms
  // tap ETH→BTC→SOL: UI highlights all 3 instantly, WS reconnects only for final SOL
  const [wsSymbol, setWsSymbol] = useState(activeSymbol);
  const [interval, setIntervalState] = useState<Interval>(() => {
    try {
      const saved = localStorage.getItem('zero_interval') as Interval | null;
      return saved && ['1m','5m','15m','1h','4h','1d'].includes(saved) ? saved : '15m';
    } catch { return '15m'; }
  });
  const [precision,     setPrecision]     = useState<Precision>('0.01');
  const [mobileTab,     setMobileTab]     = useState<MobileTab>('markets');
  const [tabletBottom,  setTabletBottom]  = useState<TabletBottomTab>('depth');
  const [showMarkets,   setShowMarkets]   = useState(false);
  const prevMidRef = useRef<number | null>(null);

  const { pairs, loading: pairsLoading, error: pairsError } = useMarketPairs();
  const allTickers = useAllTickers();

  const symbolInfo = useMemo(() => {
    const found = pairs.find((s) => s.symbol === activeSymbol);
    return found ?? PINNED_SYMBOLS.find((s) => s.symbol === activeSymbol) ?? PINNED_SYMBOLS[0];
  }, [pairs, activeSymbol]);

  // Multi-exchange unified data
  // v54: thermal-aware levels — HP overheat → reduce depth automatically
  const thermalLevels = useMemo(
    () => Math.floor(50 * throttleFactor),
    [throttleFactor],
  );
  const exData = useMultiExchangeWs(exchange, wsSymbol, thermalLevels);
  const { bids, asks, trades, cvdPoints, ticker } = exData;
  const obStatus     = exData.status;
  const tickerStatus = exData.status;
  const latencyMs    = exData.latencyMs;
  const isStale      = exData.isStale; // v63c: cached snapshot indicator
  const lastUpdate   = Date.now();
  const obRetry      = useCallback(() => {}, []);

  // v61: signal splash to hide once first real data arrives (bids + ticker ready)
  const splashFiredRef = useRef(false);
  useEffect(() => {
    if (splashFiredRef.current) return;
    if (bids.length > 0 && ticker?.lastPrice) {
      splashFiredRef.current = true;
      (window as unknown as Record<string, () => void>).__splashDone?.();
    }
  }, [bids.length, ticker?.lastPrice]); // handled internally by hook
  const { events: liqEvents, stats: liqStats, wsStatus: liqStatus }  = useLiquidations();
  const globalStats                                                   = useGlobalStats();

  const midPrice = useMemo(() => {
    if (!bids.length || !asks.length) return null;
    return (bids[0].price + asks[0].price) / 2;
  }, [bids, asks]);

  // FIX v39: prevMidPrice via useEffect — useMemo with side effects is anti-pattern
  // (React can re-compute memo twice in Strict Mode, corrupting prevMidRef)
  const [prevMidPrice, setPrevMidPrice] = useState<number | null>(null);
  useEffect(() => {
    setPrevMidPrice(midPrice);
  }, [midPrice]);

  const activePriceDec = useMemo(() => {
    if (ticker?.lastPrice) return getSmartPriceDec(ticker.lastPrice);
    return symbolInfo.priceDec ?? 2;
  }, [ticker?.lastPrice, symbolInfo.priceDec]);

  const precisionOptions = useMemo(() => getPrecisionOptions(activePriceDec), [activePriceDec]);

  const overallStatus: ConnectionStatus = useMemo(() => {
    if (obStatus === 'connected' && tickerStatus === 'connected') return 'connected';
    if (obStatus === 'disconnected' || tickerStatus === 'disconnected') return 'disconnected';
    return 'reconnecting';
  }, [obStatus, tickerStatus]);

  const bidPressure = useMemo(() => {
    const bv = bids.reduce((s, b) => s + b.size, 0);
    const av = asks.reduce((s, a) => s + a.size, 0);
    const t  = bv + av;
    return t > 0 ? (bv / t) * 100 : 50;
  }, [bids, asks]);

  // v65: debounce symbol switch — 80ms cancels intermediate taps
  // ETH→BTC→SOL in 200ms = only SOL triggers WS reconnect
  const symbolDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSymbolChange = useCallback((sym: string) => {
    // Instant: UI highlight + mobile tab switch
    setActiveSymbol(sym);
    setShowMarkets(false);
    setMobileTab('chart');
    prevMidRef.current = null;

    // Debounced 80ms: WS reconnect + precision + localStorage
    if (symbolDebounceRef.current) clearTimeout(symbolDebounceRef.current);
    symbolDebounceRef.current = setTimeout(() => {
      setWsSymbol(sym);
      const found = pairs.find((p) => p.symbol === sym);
      if (found) {
        const opts = getPrecisionOptions(found.priceDec);
        setPrecision(opts[1] ?? '0.01');
      }
      try { localStorage.setItem('zero_symbol', sym); } catch {}
    }, 80);
  }, [pairs]);

  const handleIntervalChange  = useCallback((i: Interval) => {
    setIntervalState(i);
    try { localStorage.setItem('zero_interval', i); } catch {}
  }, []);
  const handlePrecisionChange = useCallback((p: Precision) => setPrecision(p), []);
  const handleOpenMarkets     = useCallback(() => setShowMarkets(true), []);
  const handleCloseMarkets    = useCallback(() => setShowMarkets(false), []);
  const handleOpenProModal    = useCallback(() => setShowProModal(true), []);
  const handleCloseProModal   = useCallback(() => setShowProModal(false), []);
  const handleUnlock          = useCallback((key: string) => { unlock(key); setShowProModal(false); }, [unlock]);

  const P: React.CSSProperties = {
    background: 'rgba(16,19,28,1)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', height: '100%',
  };

  // v64: useMemo panels — prevent re-create on every bids/asks WS frame
  // chartPanel: only changes on symbol/interval/exchange/ticker/symbolInfo
  const chartPanel = useMemo(() => (
    <LightweightChart
      symbol={wsSymbol}
      interval={interval}
      onIntervalChange={handleIntervalChange}
      ticker={ticker}
      symbolInfo={symbolInfo}
      exchange={exchange}
    />
  ), [wsSymbol, interval, handleIntervalChange, ticker, symbolInfo, exchange]);

  // orderBookPanel: changes on bids/asks/mid/precision — fine to recreate on those
  const orderBookPanel = (levels: number) => (
    <OrderBook
      bids={bids} asks={asks}
      midPrice={midPrice} prevMidPrice={prevMidPrice}
      precision={precision} onPrecisionChange={handlePrecisionChange}
      precisionOptions={precisionOptions}
      levels={levels}
    />
  );

  // depthPanel: bids/asks/mid — same cadence as orderbook, OK
  const depthPanel = useMemo(() => (
    <ProLock isPro={isPro} onClickPro={handleOpenProModal} label="DEPTH CHART">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(16,19,28,1)' }}>
        <PanelHeader title="DEPTH CHART" />
        <div style={{ flex: 1, minHeight: 0 }}>
          <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
        </div>
      </div>
    </ProLock>
  ), [isPro, handleOpenProModal, bids, asks, midPrice]);

  // tradesPanel: only trades change — not bids/asks
  const tradesPanel = useMemo(() => (
    <RecentTrades trades={trades} />
  ), [trades]);

  // cvdPanel: only cvdPoints change
  const cvdPanel = useMemo(() => (
    <CvdChart points={cvdPoints} />
  ), [cvdPoints]);

  // liqsPanel: liqs only
  const liqsPanel = useMemo(() => (
    <ProLock isPro={isPro} onClickPro={handleOpenProModal} label="LIQUIDATION FEED">
      <LiquidationFeed events={liqEvents} stats={liqStats} wsStatus={liqStatus} />
    </ProLock>
  ), [isPro, handleOpenProModal, liqEvents, liqStats, liqStatus]);

  // marketDataPanel: ticker + symbolInfo only
  const marketDataPanel = useMemo(() => (
    <ProLock isPro={isPro} onClickPro={handleOpenProModal} label="MARKET DATA">
      <div style={{ ...P, overflowY: 'auto' }} className="hide-scrollbar">
        <MarketData ticker={ticker} symbolInfo={symbolInfo} />
      </div>
    </ProLock>
  ), [isPro, handleOpenProModal, ticker, symbolInfo]);

  return (
    <div
      className="scanline-overlay"
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100dvh', background: 'rgba(13,16,23,1)',
        overflow: 'hidden',
      }}
    >
      <Header
        activeSymbol={activeSymbol}
        symbolInfo={symbolInfo}
        onOpenMarkets={handleOpenMarkets}
        onOpenPro={handleOpenProModal}
        status={overallStatus}
        lastUpdate={lastUpdate}
        ticker={ticker}
        globalStats={globalStats}
        latencyMs={latencyMs}
        isStale={isStale}
        exchange={exchange}
        onExchangeChange={handleExchangeChange}
      />
      <ConnectionBanner status={overallStatus} onRetry={obRetry} />
      <PwaInstallBanner />

      {showProModal && (
        <LicenseModal onUnlock={handleUnlock} onClose={handleCloseProModal} />
      )}

      {/* ══════════════════════════ DESKTOP ≥1280px ══════════════════════════ */}
      {/* No sidebar — chart is always full width */}
      <div className="layout-desktop" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <PanelGroup direction="horizontal" autoSaveId="zero-ob-h" style={{ height: '100%' }}>

          {/* LEFT: chart (dominant) + depth */}
          <Panel id="left" defaultSize={52} minSize={36}
            style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <PanelGroup direction="vertical" autoSaveId="zero-ob-v-left" style={{ height: '100%' }}>
              <Panel id="chart" defaultSize={68} minSize={40} style={{ overflow: 'hidden' }}>
                <div style={{ ...P }}>{chartPanel}</div>
              </Panel>
              <ResizeHandle direction="vertical" id="v-left" />
              <Panel id="depth" defaultSize={32} minSize={18} style={{ overflow: 'hidden' }}>
                {depthPanel}
              </Panel>
            </PanelGroup>
          </Panel>

          <ResizeHandle direction="horizontal" id="h-book" />

          {/* MIDDLE: Order Book */}
          <Panel id="book" defaultSize={20} minSize={14} maxSize={32} style={{ overflow: 'hidden' }}>
            <div style={{ ...P }} className="panel-contain">{orderBookPanel(22)}</div>
          </Panel>

          <ResizeHandle direction="horizontal" id="h-right" />

          {/* RIGHT: Trades + CVD + Liqs */}
          <Panel id="right" defaultSize={18} minSize={13} maxSize={30}
            style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="panel-contain">
            <PanelGroup direction="vertical" autoSaveId="zero-ob-v-right" style={{ height: '100%' }}>
              <Panel id="trades" defaultSize={42} minSize={22} style={{ overflow: 'hidden' }}>
                <div style={{ ...P }}>{tradesPanel}</div>
              </Panel>
              <ResizeHandle direction="vertical" id="v-right-cvd" />
              <Panel id="cvd" defaultSize={22} minSize={14} style={{ overflow: 'hidden' }}>
                <div style={{ ...P }}>{cvdPanel}</div>
              </Panel>
              <ResizeHandle direction="vertical" id="v-right" />
              <Panel id="liqs" defaultSize={36} minSize={18} style={{ overflow: 'hidden' }}>
                <div style={{ ...P }}>{liqsPanel}</div>
              </Panel>
            </PanelGroup>
          </Panel>

          <ResizeHandle direction="horizontal" id="h-mktdata" />

          {/* FAR RIGHT: Market Data — visible by default */}
          <Panel id="mktdata" defaultSize={10} minSize={0} maxSize={24}
            collapsible collapsedSize={0} style={{ overflow: 'hidden' }}>
            <div style={{ ...P, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
              {marketDataPanel}
            </div>
          </Panel>

        </PanelGroup>
      </div>

      {/* ══════════════════════════ TABLET 768–1279px ══════════════════════════ */}
      <div className="layout-tablet" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', minHeight: 0,
      }}>
        {/* Fully resizable top/bottom split */}
        <PanelGroup direction="vertical" autoSaveId="zero-ob-tablet-v" style={{ height: '100%' }}>

          {/* TOP: chart + order book — resizable horizontal */}
          <Panel id="t-top" defaultSize={60} minSize={35} style={{ overflow: 'hidden' }}>
            <PanelGroup direction="horizontal" autoSaveId="zero-ob-tablet-h" style={{ height: '100%' }} className="tablet-top-split">
              <Panel id="t-chart" defaultSize={65} minSize={40} style={{ overflow: 'hidden' }}>
                <div style={{ ...P }}>{chartPanel}</div>
              </Panel>
              <ResizeHandle direction="horizontal" id="t-h-book" />
              <Panel id="t-book" defaultSize={35} minSize={22} maxSize={46} style={{ overflow: 'hidden' }}>
                <div style={{ ...P }}>{orderBookPanel(18)}</div>
              </Panel>
            </PanelGroup>
          </Panel>

          <ResizeHandle direction="vertical" id="t-v-split" />

          {/* BOTTOM: tabs — depth / stats / liqs */}
          <Panel id="t-bottom" defaultSize={40} minSize={20}
            style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{
              display: 'flex',
              background: 'rgba(16,19,28,1)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              {TABLET_BOTTOM_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTabletBottom(t.id)}
                  style={{
                    padding: '8px 18px', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                    background: 'transparent',
                    color: tabletBottom === t.id ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.28)',
                    borderBottom: tabletBottom === t.id ? '2px solid rgba(242,142,44,1)' : '2px solid transparent',
                    transition: 'all 120ms',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {tabletBottom === 'depth' && <div style={{ height: '100%' }}>{depthPanel}</div>}
              {tabletBottom === 'stats' && (
                <PanelGroup direction="horizontal" autoSaveId="zero-ob-tablet-stats" style={{ height: '100%' }}>
                  <Panel id="t-stats" defaultSize={55} minSize={35} style={{ overflow: 'hidden' }}>
                    <div style={{ ...P, overflowY: 'auto' }} className="hide-scrollbar">
                      <MarketData ticker={ticker} symbolInfo={symbolInfo} />
                    </div>
                  </Panel>
                  <ResizeHandle direction="horizontal" id="t-h-trades" />
                  <Panel id="t-trades" defaultSize={45} minSize={30} style={{ overflow: 'hidden' }}>
                    <div style={{ ...P }}>{tradesPanel}</div>
                  </Panel>
                </PanelGroup>
              )}
              {tabletBottom === 'liqs' && <div style={{ height: '100%' }}>{liqsPanel}</div>}
            </div>
          </Panel>

        </PanelGroup>
      </div>

      {/* ══════════════════════════ MOBILE <768px ══════════════════════════ */}
      <div className="layout-mobile" style={{
        flex: 1, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        touchAction: 'pan-y',
      }}>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* MARKETS — coin list, tap to go to chart */}
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'markets' ? 'flex' : 'none', flexDirection: 'column' }}>
            <MobileMarketList
              pairs={pairs}
              loading={pairsLoading}
              activeSymbol={activeSymbol}
              onSelect={handleSymbolChange}
              tickerMap={allTickers}
            />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'chart'  ? 'flex' : 'none', flexDirection: 'column' }}>{chartPanel}</div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'book'   ? 'flex' : 'none', flexDirection: 'column' }}>
            <OrderBook
              bids={bids} asks={asks}
              midPrice={midPrice} prevMidPrice={prevMidPrice}
              precision={precision} onPrecisionChange={handlePrecisionChange}
              precisionOptions={precisionOptions}
              compact levels={20}
            />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'depth'  ? 'flex' : 'none', flexDirection: 'column' }}>{depthPanel}</div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'trades' ? 'flex' : 'none', flexDirection: 'column' }}>{tradesPanel}</div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'cvd'    ? 'flex' : 'none', flexDirection: 'column' }}>{cvdPanel}</div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'liqs'   ? 'flex' : 'none', flexDirection: 'column' }}>{liqsPanel}</div>
        </div>

        {mobileTab === 'book' && <PressureBar bidPercent={bidPressure} />}

        <div style={{
          display: 'flex',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(10,11,20,1)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 4px)',
          flexShrink: 0,
        }} className="mobile-nav-bar">
          {MOBILE_TABS.map((tab) => (
            <MobileTabBtn
              key={tab.id}
              tab={tab}
              active={mobileTab === tab.id}
              onClick={() => setMobileTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Symbol Search Modal — desktop/tablet pair selector */}
      {showMarkets && (
        <SymbolSearch
          pairs={pairs}
          loading={pairsLoading}
          error={pairsError}
          activeSymbol={activeSymbol}
          onSelect={handleSymbolChange}
          onClose={handleCloseMarkets}
        />
      )}

      <style>{`
        .layout-desktop { display: flex; }
        .layout-tablet  { display: none !important; }
        .layout-mobile  { display: none !important; }
        .desktop-stats  { display: flex; }

        @media (max-width: 1279px) and (min-width: 768px) {
          .layout-desktop { display: none !important; }
          .layout-tablet  { display: flex !important; }
          .layout-mobile  { display: none !important; }
          .desktop-stats  { display: none; }
        }
        @media (max-width: 767px) {
          .layout-desktop { display: none !important; }
          .layout-tablet  { display: none !important; }
          .layout-mobile  { display: flex !important; }
          .desktop-stats  { display: none; }
        }

        /* v48: Tablet portrait — stack vertically */
        @media (min-width: 768px) and (max-width: 1279px) and (orientation: portrait) {
          .tablet-top-split {
            flex-direction: column !important;
          }
          .tablet-top-split > [data-panel-id="t-chart"] {
            min-height: 55% !important;
          }
        }

        /* v49: Tablet panel contain for perf */
        @media (min-width: 768px) {
          [data-panel-id] { contain: layout style; }
        }

        /* v50: GPU layers for frequently-updated panels */
        .panel-contain { contain: layout style paint; }

        [data-resize-handle-active] ~ * { user-select: none !important; }
        [data-panel-group] { display: flex !important; }
        [data-panel-group][data-panel-group-direction="horizontal"] { flex-direction: row !important; }
        [data-panel-group][data-panel-group-direction="vertical"]   { flex-direction: column !important; }
      `}</style>
    </div>
  );
};

export default Index;
