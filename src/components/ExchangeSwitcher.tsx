/**
 * ExchangeSwitcher.tsx — ZERØ ORDER BOOK v60
 * Desktop/Tablet (>767px): nama exchange only — Bybit / Binance / Coinbase
 * Mobile (≤767px): SVG brand logo only — no text
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */
import React from 'react';
import { EXCHANGES, type ExchangeId } from '@/hooks/useExchange';

interface ExchangeSwitcherProps {
  active:   ExchangeId;
  onChange: (ex: ExchangeId) => void;
}

// ── SVG Brand Logos (mobile only) ────────────────────────────────────────────

const BybitLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Bybit B lettermark */}
    <rect x="10" y="10" width="18" height="80" rx="4" fill={color} />
    <rect x="10" y="10" width="52" height="18" rx="4" fill={color} />
    <rect x="10" y="41" width="46" height="18" rx="4" fill={color} />
    <rect x="10" y="72" width="52" height="18" rx="4" fill={color} />
    <rect x="54" y="10" width="18" height="31" rx="4" fill={color} />
    <rect x="54" y="41" width="18" height="49" rx="4" fill={color} />
  </svg>
);

const BinanceLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Binance 5-diamond pattern */}
    <rect x="38" y="5"  width="24" height="24" rx="2" transform="rotate(45 50 17)" fill={color} />
    <rect x="5"  y="38" width="24" height="24" rx="2" transform="rotate(45 17 50)" fill={color} />
    <rect x="38" y="38" width="24" height="24" rx="2" transform="rotate(45 50 50)" fill={color} />
    <rect x="71" y="38" width="24" height="24" rx="2" transform="rotate(45 83 50)" fill={color} />
    <rect x="38" y="71" width="24" height="24" rx="2" transform="rotate(45 50 83)" fill={color} />
  </svg>
);

const CoinbaseLogo: React.FC<{ color: string }> = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Coinbase C — blue circle with C cutout */}
    <circle cx="50" cy="50" r="46" fill={color} />
    <circle cx="50" cy="50" r="27" fill="rgba(5,7,15,1)" />
    <circle cx="50" cy="50" r="13" fill={color} />
    <rect   x="50"  y="23" width="46" height="54" fill={color} />
  </svg>
);

const LOGOS: Record<ExchangeId, React.FC<{ color: string }>> = {
  bybit:    BybitLogo,
  binance:  BinanceLogo,
  coinbase: CoinbaseLogo,
};

// ── Component ─────────────────────────────────────────────────────────────────

const ExchangeSwitcher: React.FC<ExchangeSwitcherProps> = React.memo(({ active, onChange }) => (
  <div style={{
    display: 'flex', gap: '2px', alignItems: 'center',
    padding: '0 2px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '5px',
    flexShrink: 0,
  }}>
    {EXCHANGES.map((ex) => {
      const isActive = ex.id === active;
      const Logo = LOGOS[ex.id];
      const currentColor = isActive ? ex.color : 'rgba(255,255,255,0.35)';

      return (
        <button
          key={ex.id}
          onClick={() => onChange(ex.id)}
          title={ex.label}
          aria-label={ex.label}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '4px 9px',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.04em',
            background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            color: currentColor,
            transition: 'all 120ms',
            WebkitTapHighlightColor: 'transparent',
            outline: isActive ? `1px solid ${ex.color.replace('1)', '0.30)')}` : 'none',
            outlineOffset: '-1px',
            minHeight: '30px',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
          }}
          onMouseLeave={(e) => {
            if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {/* Desktop/Tablet >767px: nama aja */}
          <span className="ex-name">{ex.label}</span>
          {/* Mobile ≤767px: logo aja */}
          <span className="ex-logo"><Logo color={currentColor} /></span>
        </button>
      );
    })}

    <style>{`
      .ex-logo { display: none; }
      .ex-name { display: inline; }
      @media (max-width: 767px) {
        .ex-logo { display: flex; align-items: center; }
        .ex-name { display: none !important; }
      }
    `}</style>
  </div>
));

ExchangeSwitcher.displayName = 'ExchangeSwitcher';
export default ExchangeSwitcher;
