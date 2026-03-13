/**
 * CvdChart.tsx — ZERØ ORDER BOOK v39 — NEW COMPONENT
 * Cumulative Volume Delta chart — SVG canvas, zero deps
 *
 * CVD = running sum of (buyVol - sellVol) per trade
 * Rising CVD + flat/falling price = hidden accumulation (BULLISH)
 * Falling CVD + rising price = distribution (BEARISH)
 *
 * Visual: Line chart with zero-line reference + gradient fill
 * rgba() only ✓ · React.memo ✓ · displayName ✓ · ResizeObserver ✓
 */
import React, { useMemo, useRef, useEffect, useState } from 'react';
import type { CvdPoint } from '@/hooks/useTrades';
import { SkeletonCvd } from './Skeleton';

interface CvdChartProps {
  points: CvdPoint[];
}

const PAD = { t: 8, b: 20, l: 8, r: 8 };

const CvdChart: React.FC<CvdChartProps> = React.memo(({ points }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 400, h: 120 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDims({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const { path, fillPath, zeroY, minCvd, maxCvd, lastCvd, isPositive, sparkLabel } = useMemo(() => {
    if (points.length < 2) {
      return { path: '', fillPath: '', zeroY: dims.h / 2, minCvd: 0, maxCvd: 0, lastCvd: 0, isPositive: true, sparkLabel: '' };
    }

    const cw = dims.w - PAD.l - PAD.r;
    const ch = dims.h - PAD.t - PAD.b;

    const cvdValues = points.map((p) => p.cvd);
    const minC = Math.min(...cvdValues);
    const maxC = Math.max(...cvdValues);
    const range = maxC - minC || 1;

    // Zero line Y position
    const zY = PAD.t + ch - ((0 - minC) / range) * ch;

    const toX = (i: number) => PAD.l + (i / (points.length - 1)) * cw;
    const toY = (v: number) => PAD.t + ch - ((v - minC) / range) * ch;

    let d = '';
    for (let i = 0; i < points.length; i++) {
      const x = toX(i);
      const y = toY(points[i].cvd);
      d += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
    }

    // Fill path: close down to zero line
    const lastX = toX(points.length - 1);
    const firstX = toX(0);
    const fp = d + ` L${lastX},${zY} L${firstX},${zY} Z`;

    const last = points[points.length - 1].cvd;
    const first = points[0].cvd;
    const delta = last - first;
    const label = (delta >= 0 ? '+' : '') + (delta > 1000 ? (delta/1000).toFixed(1) + 'K' : delta.toFixed(2));

    return {
      path: d,
      fillPath: fp,
      zeroY: zY,
      minCvd: minC,
      maxCvd: maxC,
      lastCvd: last,
      isPositive: last >= 0,
      sparkLabel: label,
    };
  }, [points, dims]);

  const lineColor = isPositive ? 'rgba(0,205,115,1)' : 'rgba(255,60,82,1)';
  const fillId    = isPositive ? 'cvdFillPos' : 'cvdFillNeg';
  const fillColorA = isPositive ? 'rgba(0,205,115,0.22)' : 'rgba(255,60,82,0.22)';
  const fillColorB = isPositive ? 'rgba(0,205,115,0.01)' : 'rgba(255,60,82,0.01)';

  const lastCvdLabel = lastCvd > 1000
    ? (lastCvd / 1000).toFixed(1) + 'K'
    : lastCvd < -1000
    ? (lastCvd / 1000).toFixed(1) + 'K'
    : lastCvd.toFixed(2);

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(14,17,26,1)' }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="label-sm">CVD</span>
          <span style={{
            fontSize: '8px', fontWeight: 600, color: 'rgba(255,255,255,0.28)',
            letterSpacing: '0.04em',
          }}>CUMULATIVE VOL DELTA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {points.length > 1 && (
            <span style={{
              fontSize: '9px', fontWeight: 700,
              color: isPositive ? 'rgba(0,205,115,1)' : 'rgba(255,60,82,1)',
              letterSpacing: '0.04em',
            }}>
              {isPositive ? '▲' : '▼'} {sparkLabel}
            </span>
          )}
          <span className="mono-num" style={{
            fontSize: '10px', fontWeight: 800,
            color: isPositive ? 'rgba(0,205,115,1)' : 'rgba(255,60,82,1)',
          }}>
            {points.length > 0 ? lastCvdLabel : '—'}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {points.length < 2 ? (
          <SkeletonCvd />
        ) : (
          <svg
            width={dims.w} height={dims.h}
            style={{ display: 'block', overflow: 'visible' }}
            aria-label="Cumulative Volume Delta"
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={fillColorA} />
                <stop offset="100%" stopColor={fillColorB} />
              </linearGradient>
            </defs>

            {/* Zero reference line */}
            <line
              x1={PAD.l} y1={zeroY}
              x2={dims.w - PAD.r} y2={zeroY}
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="1"
              strokeDasharray="2,3"
            />
            <text
              x={dims.w - PAD.r - 2} y={zeroY - 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.20)"
              fontSize="7"
              fontFamily="'IBM Plex Mono', monospace"
              fontWeight="600"
            >
              ZERO
            </text>

            {/* Fill */}
            <path d={fillPath} fill={`url(#${fillId})`} />

            {/* Line */}
            <path
              d={path}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Last point dot */}
            {points.length > 0 && (() => {
              const cw = dims.w - PAD.l - PAD.r;
              const ch = dims.h - PAD.t - PAD.b;
              const cvdValues = points.map((p) => p.cvd);
              const minC = Math.min(...cvdValues);
              const maxC = Math.max(...cvdValues);
              const range = maxC - minC || 1;
              const lx = PAD.l + cw;
              const ly = PAD.t + ch - ((lastCvd - minC) / range) * ch;
              return (
                <circle cx={lx} cy={ly} r={3}
                  fill={lineColor}
                  stroke="rgba(14,17,26,1)"
                  strokeWidth="2"
                />
              );
            })()}
          </svg>
        )}
      </div>
    </div>
  );
});

CvdChart.displayName = 'CvdChart';
export default CvdChart;
