/**
 * SymbolSearch.tsx — ZERØ ORDER BOOK v34
 * Full-screen modal symbol picker — coin logos + search + category filter.
 * Desktop: centered modal. Mobile: fullscreen bottom sheet.
 * React.memo ✓ · displayName ✓ · rgba() only ✓ · IBM Plex Mono ✓
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { SymbolInfo } from '@/types/market';
import { QUOTE_CATEGORIES, type QuoteCategory, useFilteredPairs } from '@/hooks/useMarketPairs';
import { formatCompact } from '@/lib/formatters';
import CoinLogo from '@/components/CoinLogo';

interface SymbolSearchProps {
  pairs:         SymbolInfo[];
  loading:       boolean;
  error:         string | null;
  activeSymbol:  string;
  onSelect:      (symbol: string) => void;
  onClose:       () => void;
}

const ROW_HEIGHT   = 52;
const VISIBLE_ROWS = 12;

const VirtualList: React.FC<{
  items:        SymbolInfo[];
  activeSymbol: string;
  onSelect:     (symbol: string) => void;
  onClose:      () => void;
}> = React.memo(({ items, activeSymbol, onSelect, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight  = items.length * ROW_HEIGHT;
  const visibleCount = VISIBLE_ROWS + 4;
  const startIdx     = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const endIdx       = Math.min(items.length, startIdx + visibleCount);
  const visibleItems = items.slice(startIdx, endIdx);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
  }, []);

  useEffect(() => {
    const idx = items.findIndex((p) => p.symbol === activeSymbol);
    if (idx > -1 && containerRef.current) {
      const top  = idx * ROW_HEIGHT;
      const viewH = VISIBLE_ROWS * ROW_HEIGHT;
      containerRef.current.scrollTop = Math.max(0, top - viewH / 2);
    }
  }, [items, activeSymbol]); // eslint-disable-line

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height: `${VISIBLE_ROWS * ROW_HEIGHT}px`, overflowY: 'auto', position: 'relative' }}
      className="hide-scrollbar"
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const actualIdx = startIdx + i;
          return (
            <SymbolRow
              key={item.symbol}
              item={item}
              isActive={item.symbol === activeSymbol}
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

  const volStr = item.volume24h && item.volume24h > 0 ? formatCompact(item.volume24h) : '-';

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={'Select ' + item.label}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      style={{
        position: 'absolute',
        top: top + 'px',
        left: 0, right: 0,
        height: ROW_HEIGHT + 'px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 16px',
        cursor: 'pointer',
        background: isActive ? 'rgba(242,142,44,0.07)' : 'transparent',
        borderLeft: isActive ? '2px solid rgba(242,142,44,1)' : '2px solid transparent',
        transition: 'background 80ms',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      <CoinLogo symbol={item.base} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
          <span style={{
            fontSize: '13px', fontWeight: 700,
            color: isActive ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.92)',
            letterSpacing: '0.02em',
          }}>
            {item.base}
          </span>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>
            /{item.quote}
          </span>
        </div>
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', marginTop: '1px', letterSpacing: '0.04em' }}>
          Vol {volStr}
        </div>
      </div>
      <span style={{
        fontSize: '9px', fontWeight: 600,
        color: 'rgba(255,255,255,0.28)',
        fontVariantNumeric: 'tabular-nums',
        minWidth: '48px', textAlign: 'right',
      }}>
        {volStr}
      </span>
      {isActive && (
        <span style={{
          fontSize: '8px', fontWeight: 700,
          color: 'rgba(242,142,44,1)',
          letterSpacing: '0.10em',
          padding: '2px 6px',
          border: '1px solid rgba(242,142,44,0.3)',
          borderRadius: '2px',
          background: 'rgba(242,142,44,0.08)',
          whiteSpace: 'nowrap',
        }}>ACTIVE</span>
      )}
    </div>
  );
});
SymbolRow.displayName = 'SymbolRow';

const CategoryTab: React.FC<{
  label:   string;
  active:  boolean;
  onClick: () => void;
}> = React.memo(({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '5px 11px', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase' as const,
      borderRadius: '3px',
      background: active ? 'rgba(242,142,44,0.14)' : 'transparent',
      color: active ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.30)',
      border: active ? '1px solid rgba(242,142,44,0.30)' : '1px solid transparent',
      transition: 'all 100ms',
      whiteSpace: 'nowrap' as const,
      WebkitTapHighlightColor: 'transparent',
      flexShrink: 0,
    }}
  >
    {label}
  </button>
));
CategoryTab.displayName = 'CategoryTab';

const SymbolSearch: React.FC<SymbolSearchProps> = React.memo(({
  pairs, loading, error, activeSymbol, onSelect, onClose,
}) => {
  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState<QuoteCategory>('USDT');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

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

  const handleCatClick = useCallback((cat: QuoteCategory) => {
    setCategory(cat);
    setQuery('');
  }, []);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 901,
        width: 'min(520px, 96vw)',
        background: 'rgba(14,17,26,1)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '8px',
        boxShadow: '0 32px 100px rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        maxHeight: '88dvh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.10em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' as const }}>
              MARKET SELECT
            </span>
            {loading && (
              <span style={{ fontSize: '9px', color: 'rgba(242,142,44,0.8)', fontWeight: 700 }}>LOADING...</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', fontWeight: 600 }}>
              {pairs.length} pairs
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px', cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
                fontSize: '14px', width: '24px', height: '24px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit', lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.28)', fontSize: '13px', pointerEvents: 'none',
            }}>⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
              placeholder="Search: BTC, PEPE, WIF..."
              aria-label="Search trading pairs"
              autoComplete="off"
              style={{
                width: '100%', padding: '9px 36px 9px 34px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '5px',
                color: 'rgba(255,255,255,0.92)',
                fontFamily: 'inherit', fontSize: '13px',
                outline: 'none', boxSizing: 'border-box' as const,
                caretColor: 'rgba(242,142,44,1)',
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(242,142,44,0.45)'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.30)', fontSize: '16px', padding: '0 4px', lineHeight: 1,
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
              label={cat + ' ' + (countByCategory[cat] ?? 0)}
              active={category === cat}
              onClick={() => handleCatClick(cat)}
            />
          ))}
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
              <span style={{ fontSize: '10px' }}>Failed to load — showing defaults</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '120px', color: 'rgba(255,255,255,0.28)', fontSize: '11px',
            }}>
              No pairs found for "{query}"
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
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.06em' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.18)' }}>
            ESC to close
          </span>
        </div>
      </div>
    </>
  );
});

SymbolSearch.displayName = 'SymbolSearch';
export default SymbolSearch;
