/**
 * CoinLogo.tsx — ZERØ ORDER BOOK v34b
 * Coin logos via jsDelivr CDN — no API key, no rate limit, ~400+ coins.
 * Fallback: auto SVG letter icon with unique color per symbol.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useState, useMemo } from 'react';

interface CoinLogoProps {
  symbol: string;
  size?:  number;
}

function getCdnUrl(symbol: string): string {
  return (
    'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/' +
    symbol.toLowerCase() +
    '.png'
  );
}

const FALLBACK_COLORS = [
  'rgba(242,142,44,1)',
  'rgba(38,166,154,1)',
  'rgba(99,102,241,1)',
  'rgba(239,83,80,1)',
  'rgba(168,85,247,1)',
  'rgba(236,72,153,1)',
  'rgba(34,197,94,1)',
  'rgba(59,130,246,1)',
  'rgba(245,158,11,1)',
  'rgba(20,184,166,1)',
];

function getFallbackColor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

const FallbackLogo: React.FC<{ symbol: string; size: number }> = React.memo(({ symbol, size }) => {
  const color  = getFallbackColor(symbol);
  const letter = symbol.slice(0, 1);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill={color} />
      <text
        x="16" y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="14"
        fontWeight="800"
        fill="rgba(255,255,255,0.95)"
        fontFamily="'IBM Plex Mono',monospace"
      >
        {letter}
      </text>
    </svg>
  );
});
FallbackLogo.displayName = 'FallbackLogo';

const CoinLogo: React.FC<CoinLogoProps> = React.memo(({ symbol, size = 24 }) => {
  const upper = symbol.toUpperCase();
  const [failed, setFailed] = useState(false);
  const url = useMemo(() => getCdnUrl(upper), [upper]);

  if (failed) {
    return <FallbackLogo symbol={upper} size={size} />;
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: '50%',
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.04)',
    }}>
      <img
        src={url}
        alt={upper}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          display: 'block',
        }}
        loading="lazy"
      />
    </span>
  );
});

CoinLogo.displayName = 'CoinLogo';
export default CoinLogo;
