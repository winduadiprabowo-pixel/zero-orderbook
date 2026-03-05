import React, { useMemo, useState, useCallback, useRef } from 'react';
import type { OrderBookLevel } from '@/types/market';

interface DepthChartProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number | null;
}

const DepthChart: React.FC<DepthChartProps> = React.memo(({ bids, asks, midPrice }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; price: number; total: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 200 });

  const containerRef = useCallback((node: HTMLDivElement | null) => {
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
    if (!bids.length || !asks.length) return { bidPoints: [], askPoints: [], priceMin: 0, priceMax: 0, totalMax: 0 };

    const sortedBids = [...bids].sort((a, b) => a.price - b.price);
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

    // Cumulate bids from high to low
    let cum = 0;
    const bidCum: { price: number; total: number }[] = [];
    for (let i = bids.length - 1; i >= 0; i--) {
      cum += bids[i].size;
      bidCum.unshift({ price: bids[i].price, total: cum });
    }

    // Cumulate asks from low to high
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

  const { w, h } = dims;
  const pad = { top: 10, bottom: 25, left: 5, right: 5 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const toX = useCallback((price: number) => {
    if (priceMax === priceMin) return pad.left;
    return pad.left + ((price - priceMin) / (priceMax - priceMin)) * cw;
  }, [priceMin, priceMax, cw, pad.left]);

  const toY = useCallback((total: number) => {
    return pad.top + ch - (total / totalMax) * ch;
  }, [totalMax, ch, pad.top]);

  const bidPath = useMemo(() => {
    if (!bidPoints.length) return '';
    const pts = bidPoints.map((p) => `${toX(p.price)},${toY(p.total)}`);
    return `M${toX(bidPoints[0].price)},${toY(0)} L${pts.join(' L')} L${toX(bidPoints[bidPoints.length - 1].price)},${toY(0)} Z`;
  }, [bidPoints, toX, toY]);

  const askPath = useMemo(() => {
    if (!askPoints.length) return '';
    const pts = askPoints.map((p) => `${toX(p.price)},${toY(p.total)}`);
    return `M${toX(askPoints[0].price)},${toY(0)} L${pts.join(' L')} L${toX(askPoints[askPoints.length - 1].price)},${toY(0)} Z`;
  }, [askPoints, toX, toY]);

  const bidStroke = useMemo(() => {
    if (!bidPoints.length) return '';
    return `M${bidPoints.map((p) => `${toX(p.price)},${toY(p.total)}`).join(' L')}`;
  }, [bidPoints, toX, toY]);

  const askStroke = useMemo(() => {
    if (!askPoints.length) return '';
    return `M${askPoints.map((p) => `${toX(p.price)},${toY(p.total)}`).join(' L')}`;
  }, [askPoints, toX, toY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const price = priceMin + ((mx - pad.left) / cw) * (priceMax - priceMin);

    // Find closest point
    const allPts = [...bidPoints, ...askPoints];
    let closest = allPts[0];
    let minDist = Infinity;
    for (const pt of allPts) {
      const d = Math.abs(pt.price - price);
      if (d < minDist) { minDist = d; closest = pt; }
    }
    if (closest) {
      setTooltip({ x: toX(closest.price), y: toY(closest.total), price: closest.price, total: closest.total });
    }
  }, [bidPoints, askPoints, priceMin, priceMax, cw, pad.left, toX, toY]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (!bids.length || !asks.length) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-bg)' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading depth...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)' }}>
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-muted)',
      }}>Depth</div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <svg
          ref={svgRef}
          width={w}
          height={h}
          style={{ display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Market depth chart"
        >
          {/* Bid fill */}
          <path d={bidPath} fill="rgba(0,200,100,0.15)" />
          <path d={bidStroke} fill="none" stroke="rgba(0,200,100,0.8)" strokeWidth="1.5" />

          {/* Ask fill */}
          <path d={askPath} fill="rgba(220,50,70,0.15)" />
          <path d={askStroke} fill="none" stroke="rgba(220,50,70,0.8)" strokeWidth="1.5" />

          {/* Mid price line */}
          {midPrice && (
            <line
              x1={toX(midPrice)} y1={pad.top} x2={toX(midPrice)} y2={pad.top + ch}
              stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,4"
            />
          )}

          {/* X-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const price = priceMin + (priceMax - priceMin) * pct;
            return (
              <text
                key={pct}
                x={toX(price)}
                y={h - 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.25)"
                fontSize="9"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {price.toFixed(price > 100 ? 0 : 2)}
              </text>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <>
              <circle cx={tooltip.x} cy={tooltip.y} r={4} fill="rgba(255,255,255,0.8)" />
              <rect
                x={tooltip.x + 8} y={tooltip.y - 28}
                width={140} height={24} rx={3}
                fill="rgba(20,22,32,0.95)" stroke="rgba(255,255,255,0.12)"
              />
              <text
                x={tooltip.x + 14} y={tooltip.y - 12}
                fill="rgba(255,255,255,0.85)"
                fontSize="10"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {tooltip.price.toFixed(2)} | {tooltip.total.toFixed(4)}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
});

DepthChart.displayName = 'DepthChart';
export default DepthChart;
