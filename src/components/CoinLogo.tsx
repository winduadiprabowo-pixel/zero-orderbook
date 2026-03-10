/**
 * CoinLogo.tsx — ZERØ ORDER BOOK v37
 * Coin logos — multi-source fallback chain:
 *   1. CoinCap (up-to-date, no API key)
 *   2. ErikThiart repo (broader coverage)
 *   3. SVG letter fallback (always works)
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useState, useMemo } from 'react';

interface CoinLogoProps {
  symbol: string;
  size?:  number;
}

// Known working overrides — avoids 404 round-trips for common coins
const KNOWN_LOGOS: Record<string, string> = {
  BTC:  'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH:  'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL:  'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  BNB:  'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  XRP:  'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  USDC: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
};

function getSources(symbol: string): string[] {
  const s = symbol.toLowerCase();
  const u = symbol.toUpperCase();
  const sources: string[] = [];
  if (KNOWN_LOGOS[u]) sources.push(KNOWN_LOGOS[u]);
  sources.push(`https://assets.coincap.io/assets/icons/${s}@2x.png`);
  sources.push(`https://cdn.jsdelivr.net/gh/ErikThiart/cryptocurrency-icons@master/32/${s}.png`);
  return sources;
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
  const upper   = symbol.toUpperCase();
  const sources = useMemo(() => getSources(upper), [upper]);
  const [srcIdx, setSrcIdx] = useState(0);

  if (srcIdx >= sources.length) {
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
        src={sources[srcIdx]}
        alt={upper}
        width={size}
        height={size}
        onError={() => setSrcIdx((i) => i + 1)}
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
