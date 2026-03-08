/**
 * ExchangeSwitcher.tsx — ZERØ ORDER BOOK v69
 * v69: Coinbase → OKX
 * Desktop/Tablet (>767px): nama exchange only
 * Mobile (≤767px): SVG brand logo only
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */
import React from 'react';
import { EXCHANGES, type ExchangeId } from '@/hooks/useExchange';

interface ExchangeSwitcherProps {
  active:   ExchangeId;
  onChange: (ex: ExchangeId) => void;
}

// Binance — 5 diamond cross (BNB icon), from file_BINANCE.svg
const BinanceLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    {/* Top */}
    <path fill={color} d="M50,5 L62,17 L50,29 L38,17 Z"/>
    {/* Left */}
    <path fill={color} d="M17,38 L29,26 L41,38 L29,50 Z"/>
    {/* Center (bigger) */}
    <path fill={color} d="M50,29 L71,50 L50,71 L29,50 Z"/>
    {/* Right */}
    <path fill={color} d="M59,26 L71,38 L59,50 L47,38 Z"/>
    {/* Bottom */}
    <path fill={color} d="M50,71 L62,83 L50,95 L38,83 Z"/>
  </svg>
);

// Bybit — black bg, orange B lettermark, from file_BYBIT.svg
const BybitLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    {/* Vertical bar */}
    <rect x="18" y="12" width="14" height="76" rx="3" fill={color}/>
    {/* Top bump */}
    <path fill={color} d="M32,12 L32,12 L60,12 C73,12 80,20 80,30 C80,40 73,47 60,47 L32,47 L32,38 L58,38 C63,38 67,35 67,30 C67,25 63,21 58,21 L32,21 Z"/>
    {/* Bottom bump */}
    <path fill={color} d="M32,47 L32,47 L62,47 C76,47 84,56 84,66 C84,76 76,88 62,88 L32,88 L32,79 L61,79 C66,79 71,74 71,66 C71,58 66,56 61,56 L32,56 Z"/>
  </svg>
);

// OKX — black bg, 4 white squares 2x2 (from file_OKX.svg X pattern)
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

const ExchangeSwitcher: React.FC<ExchangeSwitcherProps> = React.memo(({ active, onChange }) => (
  <div style={{
    display: 'flex', gap: '1px', alignItems: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '5px',
    flexShrink: 0,
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
          <span className="ex-name">{ex.label}</span>
          <span className="ex-logo"><Logo color={col} /></span>
        </button>
      );
    })}
    <style>{`
      .ex-logo { display: none; }
      .ex-name { display: inline; }
      @media (max-width: 767px) {
        .ex-logo { display: flex; align-items: center; justify-content: center; }
        .ex-name { display: none !important; }
      }
    `}</style>
  </div>
));

ExchangeSwitcher.displayName = 'ExchangeSwitcher';
export default ExchangeSwitcher;
