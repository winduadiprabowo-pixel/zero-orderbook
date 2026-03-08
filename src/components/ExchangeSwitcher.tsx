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

const BybitLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    <rect x="10" y="10" width="18" height="80" rx="4" fill={color} />
    <rect x="10" y="10" width="52" height="18" rx="4" fill={color} />
    <rect x="10" y="41" width="46" height="18" rx="4" fill={color} />
    <rect x="10" y="72" width="52" height="18" rx="4" fill={color} />
    <rect x="54" y="10" width="18" height="31" rx="4" fill={color} />
    <rect x="54" y="41" width="18" height="49" rx="4" fill={color} />
  </svg>
);

const BinanceLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    <rect x="38" y="5"  width="24" height="24" rx="2" transform="rotate(45 50 17)" fill={color} />
    <rect x="5"  y="38" width="24" height="24" rx="2" transform="rotate(45 17 50)" fill={color} />
    <rect x="38" y="38" width="24" height="24" rx="2" transform="rotate(45 50 50)" fill={color} />
    <rect x="71" y="38" width="24" height="24" rx="2" transform="rotate(45 83 50)" fill={color} />
    <rect x="38" y="71" width="24" height="24" rx="2" transform="rotate(45 50 83)" fill={color} />
  </svg>
);

// OKX logo — simplified "O" mark
const OkxLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
    <rect x="10" y="10" width="32" height="32" rx="6" fill={color} />
    <rect x="58" y="10" width="32" height="32" rx="6" fill={color} />
    <rect x="34" y="34" width="32" height="32" rx="6" fill={color} />
    <rect x="10" y="58" width="32" height="32" rx="6" fill={color} />
    <rect x="58" y="58" width="32" height="32" rx="6" fill={color} />
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
