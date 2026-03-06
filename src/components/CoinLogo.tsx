/**
 * CoinLogo.tsx — ZERØ ORDER BOOK
 * Perfect SVG coin logos — no external deps, no img tags, no CDN.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo } from 'react';

interface CoinLogoProps {
  symbol: string; // base asset e.g. 'BTC', 'ETH'
  size?: number;
}

// ─── SVG logo map ─────────────────────────────────────────────────────────────

const LOGOS: Record<string, React.ReactNode> = {
  BTC: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(247,147,26,1)"/>
      <path d="M22.2 13.8c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.6 2.6c-.4-.1-.8-.2-1.3-.3l.6-2.6-1.6-.4-.7 2.7c-.4-.1-.7-.2-1-.2v0l-2.2-.6-.4 1.7s1.2.3 1.2.3c.6.2.8.6.7 1l-.7 2.9c0 0 .1 0 .1 0-.1 0-.1 0-.2-.1l-1 3.9c-.1.2-.3.5-.7.4 0 .1-1.2-.3-1.2-.3l-.8 1.8 2.1.5c.4.1.8.2 1.1.3l-.7 2.7 1.6.4.7-2.7c.4.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.7c2.9.5 5.1.3 6-2.3.7-2-.1-3.2-1.5-3.9 1-.3 1.8-1 2-2.4zm-3.6 5c-.5 1.9-3.9.9-5 .6l.9-3.5c1.1.3 4.6.8 4.1 2.9zm.5-5c-.5 1.8-3.3.9-4.2.6l.8-3.2c.9.2 3.9.7 3.4 2.6z" fill="white"/>
    </svg>
  ),
  ETH: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(98,126,234,1)"/>
      <path d="M16 5l-.1.4v14.7l.1.1 6.5-3.8L16 5z" fill="rgba(255,255,255,0.9)"/>
      <path d="M16 5L9.5 16.4l6.5 3.8V5z" fill="white"/>
      <path d="M16 21.6l-.1.1v4.8l.1.2 6.5-9.1L16 21.6z" fill="rgba(255,255,255,0.9)"/>
      <path d="M16 26.7v-5.1l-6.5-3.8 6.5 8.9z" fill="white"/>
      <path d="M16 20.2l6.5-3.8-6.5-3v6.8z" fill="rgba(255,255,255,0.7)"/>
      <path d="M9.5 16.4l6.5 3.8v-6.8l-6.5 3z" fill="rgba(255,255,255,0.85)"/>
    </svg>
  ),
  SOL: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(20,20,20,1)"/>
      <defs>
        <linearGradient id="sol-g" x1="8" y1="22" x2="24" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(0,255,163,1)"/>
          <stop offset="1" stopColor="rgba(220,31,255,1)"/>
        </linearGradient>
      </defs>
      <path d="M9 21h14l-2.5 2.5H9L9 21z" fill="url(#sol-g)"/>
      <path d="M9 14.75h14l-2.5 2.5H9v-2.5z" fill="url(#sol-g)"/>
      <path d="M23 8.5H9l2.5 2.5H23V8.5z" fill="url(#sol-g)"/>
    </svg>
  ),
  BNB: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(243,186,47,1)"/>
      <path d="M12.1 15.1L16 11.2l3.9 3.9 2.3-2.3L16 6.6 9.8 12.8l2.3 2.3zM6.6 16l2.3-2.3 2.3 2.3-2.3 2.3L6.6 16zm5.5 0.9l3.9 3.9 3.9-3.9 2.3 2.2-.1.1L16 25.4 9.8 19.2l-.1-.1 2.4-2.2zm8.7-.9l2.3-2.3 2.3 2.3-2.3 2.3-2.3-2.3zm-3.1 0l-1.7-1.7-1.3 1.3-.1.1.1.1 1.3 1.3 1.7-1.7-.1.1.1-.1v-.1z" fill="rgba(20,20,20,0.85)"/>
    </svg>
  ),
  XRP: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(35,35,35,1)"/>
      <path d="M22.5 8h2.7l-5.8 5.6c-1.9 1.8-4.9 1.8-6.8 0L6.8 8h2.7l4.4 4.3c1.1 1.1 2.9 1.1 4.1 0L22.5 8zM9.5 24H6.8l5.8-5.6c1.9-1.8 4.9-1.8 6.8 0l5.8 5.6h-2.7l-4.4-4.3c-1.1-1.1-2.9-1.1-4.1 0L9.5 24z" fill="white"/>
    </svg>
  ),
  ADA: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(0,82,212,1)"/>
      <circle cx="16" cy="9" r="1.4" fill="white"/>
      <circle cx="16" cy="23" r="1.4" fill="white"/>
      <circle cx="9" cy="16" r="1.4" fill="white"/>
      <circle cx="23" cy="16" r="1.4" fill="white"/>
      <circle cx="11.1" cy="11.1" r="1.2" fill="rgba(255,255,255,0.7)"/>
      <circle cx="20.9" cy="20.9" r="1.2" fill="rgba(255,255,255,0.7)"/>
      <circle cx="20.9" cy="11.1" r="1.2" fill="rgba(255,255,255,0.7)"/>
      <circle cx="11.1" cy="20.9" r="1.2" fill="rgba(255,255,255,0.7)"/>
      <circle cx="16" cy="16" r="2.2" fill="rgba(255,255,255,0.9)"/>
    </svg>
  ),
  AVAX: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(232,65,66,1)"/>
      <path d="M19.8 21H24l-7-12.5-.1-.2h-.1L16 8l-.8 1.4-.1-.1L8 21h4.2l3.8-6.8L19.8 21zm-7.7 0h7.8L16 14.8 12.1 21z" fill="white"/>
    </svg>
  ),
  DOGE: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(194,159,82,1)"/>
      <path d="M16 6C10.5 6 6 10.5 6 16s4.5 10 10 10h.4V22h-.4c-3.3 0-6-2.7-6-6s2.7-6 6-6h3.8v2.5H16c-1.9 0-3.5 1.6-3.5 3.5S14.1 19.5 16 19.5h3.8V22H16c-.1 0-.3 0-.4 0v4h.4C22 26 27 21.5 27 16S22 6 16 6z" fill="rgba(194,159,82,0.3)"/>
      <text x="9" y="20" fontSize="11" fontWeight="900" fill="white" fontFamily="Arial">Ð</text>
    </svg>
  ),
  SHIB: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(255,165,0,1)"/>
      <text x="5" y="21" fontSize="9" fontWeight="900" fill="white" fontFamily="Arial">SHIB</text>
    </svg>
  ),
  PEPE: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(0,160,80,1)"/>
      <ellipse cx="16" cy="19" rx="7" ry="5" fill="rgba(0,120,60,1)"/>
      <circle cx="13" cy="14" r="2.5" fill="white"/>
      <circle cx="19" cy="14" r="2.5" fill="white"/>
      <circle cx="13.5" cy="14" r="1.2" fill="rgba(0,0,0,0.9)"/>
      <circle cx="19.5" cy="14" r="1.2" fill="rgba(0,0,0,0.9)"/>
      <path d="M12 20 Q16 23 20 20" stroke="rgba(0,120,60,0.8)" strokeWidth="1" fill="none"/>
    </svg>
  ),
  WIF: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(156,89,182,1)"/>
      <text x="6.5" y="21" fontSize="10" fontWeight="900" fill="white" fontFamily="Arial">WIF</text>
    </svg>
  ),
  TRX: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(235,0,35,1)"/>
      <path d="M22.8 11.4L9.5 8.5l6.2 14.7 7.1-11.8zM14.7 20.1l-4-9.5 10.1 2.2-6.1 7.3z" fill="white"/>
    </svg>
  ),
  USDT: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(38,161,123,1)"/>
      <path d="M17.5 17.7v0c-.1 0-.8.1-1.5.1s-1.4 0-1.5-.1v0c-3-.1-5.2-.6-5.2-1.2s2.3-1.1 5.2-1.2v1.9c.2 0 .8.1 1.5.1s1.3 0 1.5-.1v-1.9c3 .1 5.2.6 5.2 1.2s-2.2 1.1-5.2 1.2zm0-2.6V13H21v-2.5H11V13h3.5v2.1c-3.4.2-6 .9-6 1.8s2.6 1.7 6 1.8v6.3h3V18.7c3.3-.2 5.9-.8 5.9-1.8-.1-.9-2.6-1.6-5.9-1.8z" fill="white"/>
    </svg>
  ),
  USDC: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(39,117,202,1)"/>
      <path d="M16 6C10.5 6 6 10.5 6 16s4.5 10 10 10 10-4.5 10-10S21.5 6 16 6zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z" fill="rgba(255,255,255,0.4)"/>
      <path d="M17.5 15.3c-.2-1.1-1.1-1.4-2.3-1.6v-1.4h-.9v1.4H13.5v-1.4h-.9v1.4h-1.8v1h.7c.4 0 .5.2.5.4v3.3c0 .3-.1.4-.5.4h-.7v1h1.8v1.4h.9v-1.4h.8v1.4h.9v-1.4c1.5-.1 2.5-.5 2.6-1.9.1-1-.4-1.5-1.1-1.7.5-.3.8-.8.8-1.4zm-1.1 3c0 .9-1.4.9-1.9.9v-1.8c.5 0 1.9.1 1.9.9zm-.4-2.7c0 .8-1.2.8-1.6.8v-1.6c.4 0 1.6.1 1.6.8z" fill="white"/>
    </svg>
  ),
};

// ─── Fallback — generates a letter-based icon ─────────────────────────────────

const FALLBACK_COLORS = [
  'rgba(242,142,44,1)',
  'rgba(38,166,154,1)',
  'rgba(99,102,241,1)',
  'rgba(239,83,80,1)',
  'rgba(168,85,247,1)',
  'rgba(236,72,153,1)',
  'rgba(34,197,94,1)',
  'rgba(59,130,246,1)',
];

function getFallbackColor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

const FallbackLogo: React.FC<{ symbol: string; size: number }> = React.memo(({ symbol, size }) => {
  const color = getFallbackColor(symbol);
  const letter = symbol.slice(0, 1);
  const fontSize = size * 0.42;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none">
      <circle cx="16" cy="16" r="16" fill={color}/>
      <text
        x="16" y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize * (32 / size)}
        fontWeight="800"
        fill="white"
        fontFamily="'IBM Plex Mono', monospace"
      >
        {letter}
      </text>
    </svg>
  );
});
FallbackLogo.displayName = 'FallbackLogo';

// ─── Main ─────────────────────────────────────────────────────────────────────

const CoinLogo: React.FC<CoinLogoProps> = React.memo(({ symbol, size = 24 }) => {
  const upper = symbol.toUpperCase();
  const logo  = useMemo(() => LOGOS[upper], [upper]);

  if (!logo) return <FallbackLogo symbol={upper} size={size} />;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, flexShrink: 0,
    }}>
      <svg viewBox="0 0 32 32" width={size} height={size} fill="none">
        {logo}
      </svg>
    </span>
  );
});

CoinLogo.displayName = 'CoinLogo';
export default CoinLogo;
