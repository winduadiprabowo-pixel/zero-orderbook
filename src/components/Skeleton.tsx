/**
 * Skeleton.tsx — ZERØ ORDER BOOK v63
 * Shimmer loading placeholders — ganti semua "Connecting..." / "Waiting for..."
 * rgba() only ✓ · React.memo ✓ · displayName ✓ · zero mock data ✓
 */
import React from 'react';

// ── Deterministic widths — no Math.random() in render ────────────────────────
const ASK_W  = [82, 67, 75, 88, 71, 65, 78, 72, 84, 70, 66, 79, 61, 74];
const BID_W  = [78, 62, 71, 55, 68, 59, 74, 65, 77, 57, 70, 63, 76, 61];
const SIZE_W = [58, 72, 64, 80, 55, 68, 61, 74, 52, 66, 73, 58, 69, 77];
const TOTL_W = [45, 60, 52, 70, 44, 58, 50, 65, 41, 55, 62, 48, 57, 66];
const TRD_P  = [82, 67, 75, 88, 71, 65, 78, 70, 84, 72, 66, 79, 61, 74, 88, 69, 65, 77, 83, 68, 74, 80];
const TRD_S  = [60, 73, 64, 50, 68, 58, 75, 62, 55, 70, 65, 78, 52, 67, 72, 61, 80, 56, 70, 63, 68, 75];

// ── OrderBook skeleton ────────────────────────────────────────────────────────

const SkeletonOBRow: React.FC<{ idx: number; compact?: boolean }> = React.memo(({ idx, compact }) => {
  const pw = ASK_W[idx % ASK_W.length];
  const sw = SIZE_W[idx % SIZE_W.length];
  const tw = TOTL_W[idx % TOTL_W.length];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? '1fr 1fr 1fr' : '20px 1fr 1fr 1fr',
      padding: compact ? '1.5px 8px' : '1.5px 10px',
      gap: '4px', height: '18px', alignItems: 'center', flexShrink: 0,
    }}>
      {!compact && (
        <div className="skeleton-shimmer" style={{ width: '10px', height: '7px', borderRadius: 2 }} />
      )}
      <div className="skeleton-shimmer" style={{ width: pw + '%', height: '7px', borderRadius: 2, marginLeft: 'auto' }} />
      <div className="skeleton-shimmer" style={{ width: sw + '%', height: '7px', borderRadius: 2, marginLeft: 'auto' }} />
      <div className="skeleton-shimmer" style={{ width: tw + '%', height: '7px', borderRadius: 2, marginLeft: 'auto' }} />
    </div>
  );
});
SkeletonOBRow.displayName = 'SkeletonOBRow';

export const SkeletonOrderBook: React.FC<{ rows?: number; compact?: boolean }> = React.memo(
  ({ rows = 14, compact }) => (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: rows }).map((_, i) => <SkeletonOBRow key={i} idx={i} compact={compact} />)}
    </div>
  )
);
SkeletonOrderBook.displayName = 'SkeletonOrderBook';

// ── RecentTrades skeleton ─────────────────────────────────────────────────────

const SkeletonTradeRow: React.FC<{ idx: number }> = React.memo(({ idx }) => {
  const pw = TRD_P[idx % TRD_P.length];
  const sw = TRD_S[idx % TRD_S.length];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '50px 1fr 1fr',
      padding: '2.5px 10px', gap: '4px', height: '18px', alignItems: 'center',
    }}>
      <div className="skeleton-shimmer" style={{ width: '36px', height: '7px', borderRadius: 2 }} />
      <div className="skeleton-shimmer" style={{ width: pw + '%', height: '7px', borderRadius: 2, marginLeft: 'auto' }} />
      <div className="skeleton-shimmer" style={{ width: sw + '%', height: '7px', borderRadius: 2, marginLeft: 'auto' }} />
    </div>
  );
});
SkeletonTradeRow.displayName = 'SkeletonTradeRow';

export const SkeletonTrades: React.FC<{ rows?: number }> = React.memo(({ rows = 22 }) => (
  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    {Array.from({ length: rows }).map((_, i) => <SkeletonTradeRow key={i} idx={i} />)}
  </div>
));
SkeletonTrades.displayName = 'SkeletonTrades';

// ── CVD chart skeleton ────────────────────────────────────────────────────────

export const SkeletonCvd: React.FC = React.memo(() => (
  <div style={{
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(14,17,26,1)', gap: '10px',
  }}>
    <svg width="82%" height="44%" viewBox="0 0 300 80" preserveAspectRatio="none" style={{ opacity: 0.12 }}>
      <polyline
        points="0,55 30,48 60,35 90,28 120,40 150,20 180,32 210,18 240,30 270,22 300,28"
        fill="none" stroke="rgba(0,255,157,1)" strokeWidth="2" strokeLinecap="round"
      />
      <line x1="0" y1="40" x2="300" y2="40" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeDasharray="4,4" />
    </svg>
    <div className="skeleton-shimmer" style={{ width: '32%', height: '7px', borderRadius: 3 }} />
  </div>
));
SkeletonCvd.displayName = 'SkeletonCvd';

// ── LightweightChart skeleton — candle silhouette ────────────────────────────

const CANDLE_DATA = [
  { x: 14,  o: 58, c: 48, h: 44, l: 62 },
  { x: 30,  o: 50, c: 42, h: 38, l: 54 },
  { x: 46,  o: 44, c: 52, h: 40, l: 56 },
  { x: 62,  o: 51, c: 44, h: 41, l: 55 },
  { x: 78,  o: 46, c: 38, h: 34, l: 50 },
  { x: 94,  o: 40, c: 50, h: 36, l: 54 },
  { x: 110, o: 49, c: 42, h: 38, l: 53 },
  { x: 126, o: 44, c: 35, h: 31, l: 48 },
  { x: 142, o: 37, c: 47, h: 33, l: 51 },
  { x: 158, o: 46, c: 39, h: 35, l: 50 },
  { x: 174, o: 41, c: 32, h: 28, l: 45 },
  { x: 190, o: 34, c: 44, h: 30, l: 48 },
  { x: 206, o: 43, c: 36, h: 32, l: 47 },
  { x: 222, o: 38, c: 28, h: 24, l: 42 },
  { x: 238, o: 30, c: 40, h: 26, l: 44 },
  { x: 254, o: 38, c: 30, h: 26, l: 42 },
  { x: 270, o: 32, c: 24, h: 20, l: 36 },
  { x: 286, o: 26, c: 36, h: 22, l: 40 },
];

export const SkeletonChart: React.FC = React.memo(() => (
  <div style={{
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'rgba(10,13,20,1)',
    alignItems: 'center', justifyContent: 'center', gap: '14px',
  }}>
    <svg width="88%" height="52%" viewBox="0 0 300 100" preserveAspectRatio="none" style={{ opacity: 0.13 }}>
      {CANDLE_DATA.map((c) => {
        const isUp = c.c < c.o;
        const col = isUp ? 'rgba(0,255,157,1)' : 'rgba(255,59,92,1)';
        const top = Math.min(c.o, c.c);
        const ht  = Math.max(Math.abs(c.o - c.c), 2);
        return (
          <g key={c.x}>
            <line x1={c.x} y1={c.h} x2={c.x} y2={c.l} stroke={col} strokeWidth="1" />
            <rect x={c.x - 5} y={top} width="10" height={ht} fill={col} rx="1" />
          </g>
        );
      })}
    </svg>
    {/* Shimmer bars mimic toolbar skeleton */}
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {[28, 22, 28, 22, 28, 22].map((w, i) => (
        <div key={i} className="skeleton-shimmer" style={{ width: w, height: '7px', borderRadius: 3 }} />
      ))}
    </div>
  </div>
));
SkeletonChart.displayName = 'SkeletonChart';

// ── DepthChart skeleton ───────────────────────────────────────────────────────
// Silhouette depth curve — langsung keliatan konteksnya chart apa

export const SkeletonDepth: React.FC = React.memo(() => (
  <div style={{
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(16,19,28,1)', gap: '12px',
  }}>
    <svg
      width="82%" height="52%" viewBox="0 0 300 100"
      preserveAspectRatio="none"
      style={{ opacity: 0.14 }}
    >
      {/* Bid fill */}
      <path
        d="M0,95 L28,86 L58,70 L88,50 L112,28 L135,10 L150,2 L150,100 L0,100 Z"
        fill="rgba(0,255,157,1)"
      />
      {/* Ask fill */}
      <path
        d="M150,2 L165,10 L188,28 L212,50 L242,70 L272,86 L300,95 L300,100 L150,100 Z"
        fill="rgba(255,59,92,1)"
      />
      {/* Outline */}
      <path
        d="M0,95 L28,86 L58,70 L88,50 L112,28 L135,10 L150,2 L165,10 L188,28 L212,50 L242,70 L272,86 L300,95"
        stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" fill="none"
      />
    </svg>
    {/* Shimmer label */}
    <div className="skeleton-shimmer" style={{ width: '36%', height: '7px', borderRadius: 3 }} />
  </div>
));
SkeletonDepth.displayName = 'SkeletonDepth';
