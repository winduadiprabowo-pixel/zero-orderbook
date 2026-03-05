/**
 * MarketSidebar.tsx — ZERØ ORDER BOOK v25
 * Collapsible left sidebar — 500+ pairs, inline search, category tabs.
 * Replaces the cramped header tab bar.
 * rgba() only ✓ · React.memo ✓ · displayName ✓ · IBM Plex Mono ✓
 */

import React, {
  useState, useCallback, useMemo, useRef, useEffect,
} from 'react';
import type { SymbolInfo } from '@/types/market';
import { useFilteredPairs, QUOTE_CATEGORIES, type QuoteCategory } from '@/hooks/useMarketPairs';
import { formatCompact } from '@/lib/formatters';

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDEBAR_W   = 200;   // px when open
const ROW_H       = 36;    // px per pair row
const OVERSCAN    = 4;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarketSidebarProps {
  pairs:         SymbolInfo[];
  loading:       boolean;
  activeSymbol:  string;
  onSelect:      (symbol: string) => void;
  isOpen:        boolean;
  onToggle:      () => void;
}

// ── VirtualRows ───────────────────────────────────────────────────────────────

const VirtualRows: React.FC<{
  items:        SymbolInfo[];
  activeSymbol: string;
  onSelect:     (s: string) => void;
}> = React.memo(({ items, activeSymbol, onSelect }) => {
  const containerRef            = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight]       = useState(400);

  // ResizeObserver for dynamic height
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setHeight(e.contentRect.height);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Scroll active into view on mount / symbol change
  useEffect(() => {
    const idx = items.findIndex((p) => p.symbol === activeSymbol);
    if (idx < 0 || !containerRef.current) return;
    const top = idx * ROW_H;
    const bot = top + ROW_H;
    const st  = containerRef.current.scrollTop;
    if (top < st) containerRef.current.scrollTop = top;
    else if (bot > st + height) containerRef.current.scrollTop = bot - height;
  }, [activeSymbol, items, height]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
  }, []);

  const startIdx     = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(height / ROW_H) + OVERSCAN * 2;
  const endIdx       = Math.min(items.length, startIdx + visibleCount);
  const visibleItems = items.slice(startIdx, endIdx);
  const totalH       = items.length * ROW_H;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto', position: 'relative', minHeight: 0 }}
      className="hide-scrollbar"
    >
      <div style={{ height: totalH, position: 'relative' }}>
        {visibleItems.map((item, i) => (
          <SidebarRow
            key={item.symbol}
            item={item}
            isActive={item.symbol === activeSymbol}
            top={(startIdx + i) * ROW_H}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
});
VirtualRows.displayName = 'VirtualRows';

// ── SidebarRow ────────────────────────────────────────────────────────────────

const SidebarRow: React.FC<{
  item:     SymbolInfo;
  isActive: boolean;
  top:      number;
  onSelect: (s: string) => void;
}> = React.memo(({ item, isActive, top, onSelect }) => {
  const handleClick = useCallback(() => onSelect(item.symbol), [item.symbol, onSelect]);

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Select ${item.label}`}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick(); }}
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        cursor: 'pointer',
        background: isActive ? 'rgba(242,142,44,0.08)' : 'transparent',
        borderLeft: isActive
          ? '2px solid rgba(242,142,44,1)'
          : '2px solid transparent',
        transition: 'background 80ms',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Left: base/quote */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: isActive ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.92)',
          whiteSpace: 'nowrap',
          letterSpacing: '0.02em',
        }}>
          {item.base}
        </span>
        <span style={{
          fontSize: '9px',
          color: 'rgba(255,255,255,0.25)',
          fontWeight: 500,
        }}>
          /{item.quote}
        </span>
      </div>

      {/* Right: volume */}
      <span style={{
        fontSize: '9px',
        color: isActive ? 'rgba(242,142,44,0.7)' : 'rgba(255,255,255,0.22)',
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}>
        {item.volume24h && item.volume24h > 0 ? formatCompact(item.volume24h) : ''}
      </span>
    </div>
  );
});
SidebarRow.displayName = 'SidebarRow';

// ── CategoryBtn ───────────────────────────────────────────────────────────────

const CategoryBtn: React.FC<{
  label:   string;
  active:  boolean;
  onClick: () => void;
}> = React.memo(({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '3px 7px',
      fontSize: '8px',
      fontWeight: 700,
      fontFamily: 'inherit',
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      border: active ? '1px solid rgba(242,142,44,0.35)' : '1px solid transparent',
      borderRadius: '2px',
      cursor: 'pointer',
      background: active ? 'rgba(242,142,44,0.10)' : 'transparent',
      color: active ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.28)',
      transition: 'all 100ms',
      whiteSpace: 'nowrap',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {label}
  </button>
));
CategoryBtn.displayName = 'CategoryBtn';

// ── Main Sidebar ──────────────────────────────────────────────────────────────

const MarketSidebar: React.FC<MarketSidebarProps> = React.memo(({
  pairs, loading, activeSymbol, onSelect, isOpen, onToggle,
}) => {
  const [query, setQuery]       = useState('');
  const [category, setCategory] = useState<QuoteCategory>('USDT');
  const inputRef                = useRef<HTMLInputElement>(null);

  const filtered = useFilteredPairs(pairs, query, category);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value) setCategory('ALL');
  }, []);

  const clearQuery = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  // Count per category (memoized)
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: pairs.length };
    for (const p of pairs) {
      map[p.quote] = (map[p.quote] ?? 0) + 1;
    }
    return map;
  }, [pairs]);

  return (
    <>
      {/* Toggle button — always visible, sits on top-left of main content */}
      <button
        onClick={onToggle}
        aria-label={isOpen ? 'Close market sidebar' : 'Open market sidebar'}
        title={isOpen ? 'Hide markets' : 'Show markets'}
        style={{
          position: 'absolute',
          top: '8px',
          left: isOpen ? SIDEBAR_W + 6 : 6,
          zIndex: 50,
          width: '22px',
          height: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '3px',
          cursor: 'pointer',
          color: isOpen ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.45)',
          fontSize: '11px',
          transition: 'left 200ms ease, color 120ms',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        {isOpen ? '◀' : '▶'}
      </button>

      {/* Sidebar panel */}
      <div
        style={{
          width: isOpen ? SIDEBAR_W : 0,
          minWidth: isOpen ? SIDEBAR_W : 0,
          maxWidth: isOpen ? SIDEBAR_W : 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(14,17,26,1)',
          borderRight: isOpen ? '1px solid rgba(255,255,255,0.06)' : 'none',
          transition: 'width 200ms ease, min-width 200ms ease, max-width 200ms ease',
          flexShrink: 0,
          height: '100%',
        }}
      >
        {isOpen && (
          <>
            {/* Sidebar header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px 6px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.10em',
                color: 'rgba(255,255,255,0.30)',
                textTransform: 'uppercase',
              }}>
                MARKETS
              </span>
              {loading && (
                <span style={{ fontSize: '8px', color: 'rgba(242,142,44,0.7)', fontWeight: 700 }}>
                  LOADING
                </span>
              )}
              {!loading && (
                <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>
                  {pairs.length}
                </span>
              )}
            </div>

            {/* Search */}
            <div style={{
              padding: '6px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '7px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.25)',
                  pointerEvents: 'none',
                }}>
                  ⌕
                </span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="Search..."
                  aria-label="Search pairs"
                  style={{
                    width: '100%',
                    padding: '5px 24px 5px 22px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '3px',
                    color: 'rgba(255,255,255,0.88)',
                    fontFamily: 'inherit',
                    fontSize: '10px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    (e.target as HTMLInputElement).style.borderColor = 'rgba(242,142,44,0.35)';
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.07)';
                  }}
                />
                {query && (
                  <button
                    onClick={clearQuery}
                    style={{
                      position: 'absolute',
                      right: '5px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.30)',
                      fontSize: '12px',
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Category tabs */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '3px',
              padding: '5px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              {QUOTE_CATEGORIES.map((cat) => (
                <CategoryBtn
                  key={cat}
                  label={cat === 'ALL' ? `ALL` : cat}
                  active={category === cat}
                  onClick={() => { setCategory(cat); setQuery(''); }}
                />
              ))}
            </div>

            {/* Result count */}
            <div style={{
              padding: '3px 10px',
              flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{
                fontSize: '8px',
                color: 'rgba(255,255,255,0.18)',
                fontWeight: 600,
                letterSpacing: '0.06em',
              }}>
                {filtered.length} PAIRS · {counts[category === 'ALL' ? 'ALL' : category] ?? 0} {category}
              </span>
            </div>

            {/* Pair list */}
            {filtered.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.20)',
                fontSize: '10px',
              }}>
                No pairs found
              </div>
            ) : (
              <VirtualRows
                items={filtered}
                activeSymbol={activeSymbol}
                onSelect={onSelect}
              />
            )}
          </>
        )}
      </div>
    </>
  );
});

MarketSidebar.displayName = 'MarketSidebar';
export default MarketSidebar;
