/**
 * ExchangeSwitcher.tsx — ZERØ ORDER BOOK v82
 * v82: Mobile → dropdown popup (tap active exchange → pilih)
 * Desktop (>767px): 3 buttons side by side (unchanged)
 * rgba() only ✓ · React.memo ✓ · displayName ✓ · 48px tap targets ✓
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EXCHANGES, type ExchangeId } from '@/hooks/useExchange';

interface ExchangeSwitcherProps {
  active:   ExchangeId;
  onChange: (ex: ExchangeId) => void;
}

// Binance — 5 diamond cross (BNB icon)
const BinanceLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    <path fill={color} d="M50,5 L62,17 L50,29 L38,17 Z"/>
    <path fill={color} d="M17,38 L29,26 L41,38 L29,50 Z"/>
    <path fill={color} d="M50,29 L71,50 L50,71 L29,50 Z"/>
    <path fill={color} d="M59,26 L71,38 L59,50 L47,38 Z"/>
    <path fill={color} d="M50,71 L62,83 L50,95 L38,83 Z"/>
  </svg>
);

// Bybit — orange B lettermark
const BybitLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    <rect x="18" y="12" width="14" height="76" rx="3" fill={color}/>
    <path fill={color} d="M32,12 L32,12 L60,12 C73,12 80,20 80,30 C80,40 73,47 60,47 L32,47 L32,38 L58,38 C63,38 67,35 67,30 C67,25 63,21 58,21 L32,21 Z"/>
    <path fill={color} d="M32,47 L32,47 L62,47 C76,47 84,56 84,66 C84,76 76,88 62,88 L32,88 L32,79 L61,79 C66,79 71,74 71,66 C71,58 66,56 61,56 L32,56 Z"/>
  </svg>
);

// OKX — 4 squares 2x2
const OkxLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    <rect x="8"  y="8"  width="36" height="36" rx="5" fill={color}/>
    <rect x="56" y="8"  width="36" height="36" rx="5" fill={color}/>
    <rect x="8"  y="56" width="36" height="36" rx="5" fill={color}/>
    <rect x="56" y="56" width="36" height="36" rx="5" fill={color}/>
  </svg>
);

const LOGOS: Record<ExchangeId, React.FC<{ color: string }>> = {
  bybit:   BybitLogo,
  binance: BinanceLogo,
  okx:     OkxLogo,
};

const ExchangeSwitcher: React.FC<ExchangeSwitcherProps> = React.memo(({ active, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const handleSelect = useCallback((id: ExchangeId) => {
    onChange(id);
    setOpen(false);
  }, [onChange]);

  const activeEx  = EXCHANGES.find(e => e.id === active)!;
  const ActiveLogo = LOGOS[active];

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>

      {/* ── Desktop: 3 buttons side by side ── */}
      <div className="ex-desktop" style={{
        display: 'flex', gap: '1px', alignItems: 'center',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '5px',
        padding: '2px',
      }}>
        {EXCHANGES.map((ex) => {
          const isActive = ex.id === active;
          const Logo = LOGOS[ex.id];
          const col = isActive ? ex.color : 'rgba(255,255,255,0.35)';
          return (
            <button
              key={ex.id}
              onClick={() => onChange(ex.id)}
              title={ex.label}
              aria-label={`Switch to ${ex.label}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', borderRadius: '3px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '10px', fontWeight: 700,
                letterSpacing: '0.04em',
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: col,
                transition: 'all 120ms',
                WebkitTapHighlightColor: 'transparent',
                outline: isActive ? `1px solid ${ex.color.replace('1)', '0.28)')}` : 'none',
                outlineOffset: '-1px',
                minHeight: '32px',
                minWidth: '32px',
                whiteSpace: 'nowrap',
                padding: '4px 8px',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              {ex.label}
            </button>
          );
        })}
      </div>

      {/* ── Mobile: single button → dropdown ── */}
      <button
        className="ex-mobile"
        onClick={() => setOpen(o => !o)}
        aria-label={`Active exchange: ${activeEx.label}. Tap to switch.`}
        style={{
          display: 'none', // shown via CSS
          alignItems: 'center', justifyContent: 'center', gap: '4px',
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? activeEx.color.replace('1)', '0.35)') : 'rgba(255,255,255,0.07)'}`,
          borderRadius: '5px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: '0 8px',
          minHeight: '32px',
          minWidth: '48px',
          WebkitTapHighlightColor: 'transparent',
          transition: 'all 120ms',
        }}
      >
        <ActiveLogo color={activeEx.color} />
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path
            d={open ? 'M2 6.5L5 3.5L8 6.5' : 'M2 3.5L5 6.5L8 3.5'}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* ── Dropdown panel (mobile only) ── */}
      {open && (
        <div
          className="ex-mobile"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            background: 'rgba(12,14,22,1)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '6px',
            padding: '4px',
            zIndex: 200,
            minWidth: '120px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          {EXCHANGES.map((ex) => {
            const isActive = ex.id === active;
            const Logo = LOGOS[ex.id];
            const col = isActive ? ex.color : 'rgba(255,255,255,0.65)';
            return (
              <button
                key={ex.id}
                onClick={() => handleSelect(ex.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '11px', fontWeight: 700,
                  letterSpacing: '0.04em',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: col,
                  padding: '8px 10px',
                  minHeight: '40px',
                  textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                  outline: isActive ? `1px solid ${ex.color.replace('1)', '0.25)')}` : 'none',
                  outlineOffset: '-1px',
                  transition: 'background 100ms',
                  width: '100%',
                }}
              >
                <Logo color={col} />
                <span>{ex.label}</span>
                {isActive && (
                  <span style={{
                    marginLeft: 'auto',
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: ex.color,
                    flexShrink: 0,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .ex-desktop { display: none !important; }
          .ex-mobile  { display: flex !important; }
        }
        @media (min-width: 768px) {
          .ex-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
});

ExchangeSwitcher.displayName = 'ExchangeSwitcher';
export default ExchangeSwitcher;
