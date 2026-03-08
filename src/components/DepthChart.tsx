/**
 * DepthChart.tsx — ZERØ ORDER BOOK v26
 * SVG depth chart — smooth curves, crosshair, tooltip, price axis.
 * rgba() only ✓ · React.memo ✓ · displayName ✓ · ResizeObserver ✓
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { OrderBookLevel } from '@/types/market';
import { SkeletonDepth } from './Skeleton';

interface DepthChartProps {
  bids:     OrderBookLevel[];
  asks:     OrderBookLevel[];
  midPrice: number | null;
}

const PAD = { t: 10, b: 28, l: 8, r: 8 };

const DepthChart: React.FC<DepthChartProps> = React.memo(({ bids, asks, midPrice }) => {
  const containerRef                = useRef<HTMLDivElement>(null);
  const [dims, setDims]             = useState({ w: 600, h: 200 });
  const [tooltip, setTooltip]       = useState<{
    x: number; y: number; price: number; total: number; side: 'bid' | 'ask';
  } | null>(null);
  const [crosshairX, setCrosshairX] = useState<number | null>(null);

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

  const { bidPoints, askPoints, priceMin, priceMax, totalMax } = useMemo(() => {
    if (!bids.length || !asks.length) {
      return { bidPoints: [], askPoints: [], priceMin: 0, priceMax: 0, totalMax: 0 };
    }
    const sortedBids = [...bids].sort((a, b) => a.price - b.price);
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

    let cum = 0;
    const bidCum: { price: number; total: number }[] = [];
    for (let i = sortedBids.length - 1; i >= 0; i--) {
      cum += sortedBids[i].size;
      bidCum.unshift({ price: sortedBids[i].price, total: cum });
    }
    cum = 0;
    const askCum: { price: number; total: number }[] = [];
    for (const a of sortedAsks) {
      cum += a.size;
      askCum.push({ price: a.price, total: cum });
    }

    const pMin = sortedBids[0]?.price ?? 0;
    const pMax = sortedAsks[sortedAsks.length - 1]?.price ?? 0;
    const tMax = Math.max(bidCum[0]?.total ?? 0, askCum[askCum.length - 1]?.total ?? 0, 1);
    return { bidPoints: bidCum, askPoints: askCum, priceMin: pMin, priceMax: pMax, totalMax: tMax };
  }, [bids, asks]);

  const cw = dims.w - PAD.l - PAD.r;
  const ch = dims.h - PAD.t - PAD.b;

  const toX = useCallback((price: number) => {
    if (priceMax === priceMin) return PAD.l;
    return PAD.l + ((price - priceMin) / (priceMax - priceMin)) * cw;
  }, [priceMin, priceMax, cw]);

  const toY = useCallback((total: number) =>
    PAD.t + ch - (total / totalMax) * ch,
  [totalMax, ch]);

  // Stepped path for professional depth chart look
  const buildStepPath = useCallback((
    points: { price: number; total: number }[],
    filled: boolean,
    side: 'bid' | 'ask',
  ) => {
    if (!points.length) return '';
    const pts = points.map((p) => ({ x: toX(p.price), y: toY(p.total) }));
    let d = '';
    if (side === 'bid') {
      d = `M${pts[0].x},${toY(0)}`;
      for (const pt of pts) d += ` L${pt.x},${pt.y}`;
      if (filled) d += ` L${pts[pts.length - 1].x},${toY(0)} Z`;
    } else {
      d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` L${pts[i].x},${pts[i - 1].y} L${pts[i].x},${pts[i].y}`;
      }
      if (filled) d += ` L${pts[pts.length - 1].x},${toY(0)} L${pts[0].x},${toY(0)} Z`;
    }
    return d;
  }, [toX, toY]);

  const bidFillPath   = useMemo(() => buildStepPath(bidPoints, true,  'bid'), [bidPoints, buildStepPath]);
  const bidLinePath   = useMemo(() => buildStepPath(bidPoints, false, 'bid'), [bidPoints, buildStepPath]);
  const askFillPath   = useMemo(() => buildStepPath(askPoints, true,  'ask'), [askPoints, buildStepPath]);
  const askLinePath   = useMemo(() => buildStepPath(askPoints, false, 'ask'), [askPoints, buildStepPath]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    setCrosshairX(mx);
    if (priceMax === priceMin) return;
    const price = priceMin + ((mx - PAD.l) / cw) * (priceMax - priceMin);
    const all   = [
      ...bidPoints.map((p) => ({ ...p, side: 'bid' as const })),
      ...askPoints.map((p) => ({ ...p, side: 'ask' as const })),
    ];
    let closest = all[0];
    let minDist = Infinity;
    for (const pt of all) {
      const d = Math.abs(pt.price - price);
      if (d < minDist) { minDist = d; closest = pt; }
    }
    if (closest) {
      setTooltip({
        x: toX(closest.price),
        y: toY(closest.total),
        price: closest.price,
        total: closest.total,
        side: closest.side,
      });
    }
  }, [bidPoints, askPoints, priceMin, priceMax, cw, toX, toY]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setCrosshairX(null);
  }, []);

  // Price axis labels
  const priceLabels = useMemo(() => {
    const count = 5;
    return Array.from({ length: count }, (_, i) => {
      const price = priceMin + (priceMax - priceMin) * (i / (count - 1));
      return { price, x: toX(price) };
    });
  }, [priceMin, priceMax, toX]);

  if (!bids.length || !asks.length) {
    return <SkeletonDepth />;
  }

  const tooltipColor = tooltip?.side === 'bid' ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  const tooltipW     = 160;
  const tooltipH     = 38;

  return (
    <div ref={containerRef} style={{ height: '100%', background: 'rgba(16,19,28,1)', position: 'relative' }}>
      <svg
        width={dims.w} height={dims.h}
        style={{ display: 'block', userSelect: 'none', overflow: 'visible' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label="Market depth chart"
      >
        {/* Gradient defs */}
        <defs>
          <linearGradient id="bidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(38,166,154,0.18)" />
            <stop offset="100%" stopColor="rgba(38,166,154,0.02)" />
          </linearGradient>
          <linearGradient id="askGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(239,83,80,0.18)" />
            <stop offset="100%" stopColor="rgba(239,83,80,0.02)" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={pct}
            x1={PAD.l} y1={PAD.t + ch * (1 - pct)}
            x2={PAD.l + cw} y2={PAD.t + ch * (1 - pct)}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}

        {/* Bid fill + line */}
        <path d={bidFillPath} fill="url(#bidGrad)" />
        <path d={bidLinePath} fill="none" stroke="rgba(38,166,154,0.9)" strokeWidth="1.5" />

        {/* Ask fill + line */}
        <path d={askFillPath} fill="url(#askGrad)" />
        <path d={askLinePath} fill="none" stroke="rgba(239,83,80,0.9)" strokeWidth="1.5" />

        {/* Mid price line */}
        {midPrice && (
          <>
            <line
              x1={toX(midPrice)} y1={PAD.t}
              x2={toX(midPrice)} y2={PAD.t + ch}
              stroke="rgba(255,255,255,0.20)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <text
              x={toX(midPrice)}
              y={PAD.t - 2}
              textAnchor="middle"
              fill="rgba(255,255,255,0.35)"
              fontSize="8"
              fontFamily="'IBM Plex Mono', monospace"
              fontWeight="600"
            >
              MID
            </text>
          </>
        )}

        {/* Crosshair */}
        {crosshairX !== null && (
          <line
            x1={crosshairX} y1={PAD.t}
            x2={crosshairX} y2={PAD.t + ch}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="2,2"
            pointerEvents="none"
          />
        )}

        {/* Price axis */}
        {priceLabels.map(({ price, x }) => (
          <text
            key={price}
            x={x} y={dims.h - 6}
            textAnchor="middle"
            fill="rgba(255,255,255,0.22)"
            fontSize="8"
            fontFamily="'IBM Plex Mono', monospace"
          >
            {price > 1000
              ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
              : price.toFixed(price > 1 ? 2 : 4)}
          </text>
        ))}

        {/* Tooltip */}
        {tooltip && (() => {
          const tx = Math.min(tooltip.x + 10, dims.w - tooltipW - 4);
          const ty = Math.max(tooltip.y - tooltipH - 6, PAD.t);
          return (
            <>
              {/* Dot */}
              <circle cx={tooltip.x} cy={tooltip.y} r={4}
                fill={tooltipColor} stroke="rgba(16,19,28,1)" strokeWidth="2" />
              {/* Tooltip box */}
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={3}
                fill="rgba(18,22,34,0.97)" stroke="rgba(255,255,255,0.10)" />
              <text
                x={tx + 8} y={ty + 13}
                fill="rgba(255,255,255,0.45)"
                fontSize="8"
                fontFamily="'IBM Plex Mono', monospace"
                fontWeight="600"
              >
                {tooltip.side === 'bid' ? 'BID' : 'ASK'} PRICE
              </text>
              <text
                x={tx + 8} y={ty + 27}
                fill={tooltipColor}
                fontSize="10"
                fontFamily="'IBM Plex Mono', monospace"
                fontWeight="700"
              >
                {tooltip.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                {'  ·  '}
                {tooltip.total.toFixed(3)}
              </text>
            </>
          );
        })()}
      </svg>
    </div>
  );
});

DepthChart.displayName = 'DepthChart';
export default DepthChart;
