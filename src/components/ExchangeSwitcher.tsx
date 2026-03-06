/**
 * ExchangeSwitcher.tsx — ZERØ ORDER BOOK v45
 * 3-button exchange toggle: Bybit / Binance / Coinbase
 * Shows brand color + logo text. Compact for header.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */
import React from 'react';
import { EXCHANGES, type ExchangeId } from '@/hooks/useExchange';

interface ExchangeSwitcherProps {
  active:   ExchangeId;
  onChange: (ex: ExchangeId) => void;
}

const LOGOS: Record<ExchangeId, string> = {
  bybit:    '◈',
  binance:  '◆',
  coinbase: '○',
};

const ExchangeSwitcher: React.FC<ExchangeSwitcherProps> = React.memo(({ active, onChange }) => (
  <div style={{
    display: 'flex', gap: '2px', alignItems: 'center',
    padding: '0 2px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '5px',
  }}>
    {EXCHANGES.map((ex) => {
      const isActive = ex.id === active;
      return (
        <button
          key={ex.id}
          onClick={() => onChange(ex.id)}
          title={ex.label}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '4px 8px',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.04em',
            background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            color: isActive ? ex.color : 'rgba(255,255,255,0.28)',
            transition: 'all 120ms',
            WebkitTapHighlightColor: 'transparent',
            outline: isActive ? `1px solid ${ex.color.replace('1)', '0.35)')}` : 'none',
            outlineOffset: '-1px',
          }}
        >
          <span style={{ fontSize: '11px', lineHeight: 1 }}>{LOGOS[ex.id]}</span>
          <span className="hide-xs">{ex.label}</span>
        </button>
      );
    })}
    <style>{`
      @media (max-width: 480px) { .hide-xs { display: none !important; } }
    `}</style>
  </div>
));
ExchangeSwitcher.displayName = 'ExchangeSwitcher';
export default ExchangeSwitcher;
