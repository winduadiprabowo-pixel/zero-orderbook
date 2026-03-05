/**
 * SymbolSearch.tsx — ZERØ ORDER BOOK v24
 * Full-screen modal symbol picker — 500+ pairs, search, category filter.
 * React.memo ✓ · displayName ✓ · rgba() only ✓ · IBM Plex Mono ✓
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { SymbolInfo } from '@/types/market';
import { QUOTE_CATEGORIES, type QuoteCategory, useFilteredPairs } from '@/hooks/useMarketPairs';
import { formatCompact } from '@/lib/formatters';

interface SymbolSearchProps {
  pairs:         SymbolInfo[];
  loading:       boolean;
  error:         string | null;
  activeSymbol:  string;
  onSelect:      (symbol: string) => void;
  onClose:       () => void;
}

const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 14;

// ─── VirtualList ─────────────────────────────────────────────────────────────

const VirtualList: React.FC<{
  items:        SymbolInfo[];
  activeSymbol: string;
  onSelect:     (symbol: string) => void;
  onClose:      () => void;
}> = React.memo(({ items, activeSymbol, onSelect, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight  = items.length * ROW_HEIGHT;
  const visibleCount = Math.ceil((VISIBLE_ROWS * ROW_HEIGHT) / ROW_HEIGHT) + 2;
  const startIdx     = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1);
  const endIdx       = Math.min(items.length, startIdx + visibleCount + 2);
  const visibleItems = items.slice(startIdx, endIdx);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
  }, []);

  // Scroll active item into view on open
  useEffect(() => {
    const idx = items.findIndex((p) => p.symbol === activeSymbol);
    if (idx > -1 && containerRef.current) {
      const top = idx * ROW_HEIGHT;
      const viewH = VISIBLE_ROWS * ROW_HEIGHT;
      if (top < scrollTop || top + ROW_HEIGHT > scrollTop + viewH) {
        containerRef.current.scrollTop = Math.max(0, top - viewH / 2);
      }
    }
  }, [items, activeSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        height: `${VISIBLE_ROWS * ROW_HEIGHT}px`,
        overflowY: 'auto',
        position: 'relative',
      }}
      className="hide-scrollbar"
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const actualIdx = startIdx + i;
          const isActive  = item.symbol === activeSymbol;
          return (
            <SymbolRow
              key={item.symbol}
              item={item}
              isActive={isActive}
              top={actualIdx * ROW_HEIGHT}
              onSelect={onSelect}
              onClose={onClose}
            />
          );
        })}
      </div>
    </div>
  );
});
VirtualList.displayName = 'VirtualList';

// ─── SymbolRow ────────────────────────────────────────────────────────────────

const SymbolRow: React.FC<{
  item:     SymbolInfo;
  isActive: boolean;
  top:      number;
  onSelect: (symbol: string) => void;
  onClose:  () => void;
}> = React.memo(({ item, isActive, top, onSelect, onClose }) => {
  const handleClick = useCallback(() => {
    onSelect(item.symbol);
    onClose();
  }, [item.symbol, onSelect, onClose]);

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Select ${item.label}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: 0, right: 0,
        height: `${ROW_HEIGHT}px`,
        display: 'grid',
        gridTemplateColumns: '1fr 80px 90px',
        alignItems: 'center',
        padding: '0 16px',
        cursor: 'pointer',
        background: isActive ? 'rgba(242,142,44,0.08)' : 'transparent',
        borderLeft: isActive ? '2px solid rgba(242,142,44,1)' : '2px solid transparent',
        transition: 'background 80ms',
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{
          fontSize: '12px', fontWeight: 700,
          color: isActive ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.92)',
          whiteSpace: 'nowrap',
        }}>
          {item.base}
        </span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>
          /{item.quote}
        </span>
        {item.isFutures && (
          <span style={{
            fontSize: '8px', fontWeight: 700, padding: '1px 4px',
            borderRadius: '2px', letterSpacing: '0.06em',
            background: 'rgba(38,166,154,0.12)',
            color: 'rgba(38,166,154,1)',
          }}>PERP</span>
        )}
      </div>

      {/* Volume */}
      <span className="mono-num" style={{
        textAlign: 'right', fontSize: '10px',
        color: 'rgba(255,255,255,0.35)', fontWeight: 500,
      }}>
        {item.volume24h && item.volume24h > 0 ? formatCompact(item.volume24h) : '—'}
      </span>

      {/* Active badge */}
      <div style={{ textAlign: 'right' }}>
        {isActive && (
          <span style={{
            fontSize: '8px', fontWeight: 700,
            color: 'rgba(242,142,44,1)',
            letterSpacing: '0.08em',
          }}>ACTIVE ▶</span>
        )}
      </div>
    </div>
  );
});
SymbolRow.displayName = 'SymbolRow';

// ─── CategoryTab ─────────────────────────────────────────────────────────────

const CategoryTab: React.FC<{
  cat:      QuoteCategory;
  active:   boolean;
  onClick:  () => void;
}> = React.memo(({ cat, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '4px 10px', border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      borderRadius: '2px',
      background: active ? 'rgba(242,142,44,0.15)' : 'transparent',
      color: active ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.28)',
      border: active ? '1px solid rgba(242,142,44,0.3)' : '1px solid transparent',
      transition: 'all 100ms',
      whiteSpace: 'nowrap',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {cat}
  </button>
));
CategoryTab.displayName = 'CategoryTab';

// ─── Main modal ───────────────────────────────────────────────────────────────

const SymbolSearch: React.FC<SymbolSearchProps> = React.memo(({
  pairs, loading, error, activeSymbol, onSelect, onClose,
}) => {
  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState<QuoteCategory>('USDT');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = useFilteredPairs(pairs, query, category);

  const countByCategory = useMemo(() => {
    const map: Record<QuoteCategory, number> = {
      ALL: pairs.length, USDT: 0, USDC: 0, BTC: 0, ETH: 0, BNB: 0, FDUSD: 0,
    };
    for (const p of pairs) {
      const q = p.quote as QuoteCategory;
      if (q in map) map[q]++;
    }
    return map;
  }, [pairs]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value) setCategory('ALL');
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal panel */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 901,
        width: 'min(480px, 96vw)',
        background: 'rgba(16,19,28,1)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '6px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        maxHeight: '90dvh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
            MARKET SELECT
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {loading && (
              <span style={{ fontSize: '9px', color: 'rgba(242,142,44,1)', fontWeight: 700 }}>
                LOADING...
              </span>
            )}
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.28)', fontWeight: 600 }}>
              {pairs.length} pairs
            </span>
            <button
              onClick={onClose}
              aria-label="Close market selector"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.35)', fontSize: '16px',
                padding: '0 2px', fontFamily: 'inherit', lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>

        {/* Search input */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.28)', fontSize: '12px', pointerEvents: 'none',
            }}>⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
              placeholder="Search symbol, e.g. BTC, PEPE, WIF..."
              aria-label="Search trading pairs"
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px',
                color: 'rgba(255,255,255,0.92)',
                fontFamily: 'inherit', fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(242,142,44,0.4)'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.28)', fontSize: '14px', padding: '0 4px',
                }}
              >×</button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div style={{
          display: 'flex', gap: '4px', padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto', flexShrink: 0,
        }} className="hide-scrollbar">
          {QUOTE_CATEGORIES.map((cat) => (
            <CategoryTab
              key={cat}
              cat={cat === 'ALL' ? `ALL (${countByCategory.ALL})` as QuoteCategory : `${cat} (${countByCategory[cat]})` as QuoteCategory}
              active={category === cat}
              onClick={() => { setCategory(cat); setQuery(''); }}
            />
          ))}
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 90px',
          padding: '4px 16px', flexShrink: 0,
        }}>
          <span className="label-xs">Symbol</span>
          <span className="label-xs" style={{ textAlign: 'right' }}>Vol 24H</span>
          <span className="label-xs" style={{ textAlign: 'right' }}>Status</span>
        </div>

        {/* List */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {error && !loading && filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '200px', gap: '8px',
              color: 'rgba(255,255,255,0.28)',
            }}>
              <span style={{ fontSize: '24px' }}>⚠</span>
              <span style={{ fontSize: '10px' }}>Failed to load pairs — using defaults</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '120px', color: 'rgba(255,255,255,0.28)',
              fontSize: '11px',
            }}>
              No pairs found for &quot;{query}&quot;
            </div>
          ) : (
            <VirtualList
              items={filtered}
              activeSymbol={activeSymbol}
              onSelect={onSelect}
              onClose={onClose}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.20)', letterSpacing: '0.06em' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.20)' }}>
            ESC to close
          </span>
        </div>
      </div>
    </>
  );
});

SymbolSearch.displayName = 'SymbolSearch';
export default SymbolSearch;
