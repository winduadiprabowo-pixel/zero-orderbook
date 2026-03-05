import React, { useMemo, useState, useCallback, useRef } from 'react';
import type { OrderBookLevel } from '@/types/market';

interface DepthChartProps {
  bids:     OrderBookLevel[];
  asks:     OrderBookLevel[];
  midPrice: number | null;
}

const DepthChart: React.FC<DepthChartProps> = React.memo(({ bids, asks, midPrice }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; price: number; total: number; side: 'bid' | 'ask' } | null>(null);
  const [dims, setDims]       = useState({ w: 600, h: 180 });

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setDims({ w: e.contentRect.width, h: e.contentRect.height });
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

    const pMin  = sortedBids[0]?.price ?? 0;
    const pMax  = sortedAsks[sortedAsks.length - 1]?.price ?? 0;
    const tMax  = Math.max(bidCum[0]?.total ?? 0, askCum[askCum.length - 1]?.total ?? 0, 1);
    return { bidPoints: bidCum, askPoints: askCum, priceMin: pMin, priceMax: pMax, totalMax: tMax };
  }, [bids, asks]);

  const PAD = useMemo(() => ({ t: 8, b: 22, l: 4, r: 4 }), []);
  const cw = dims.w - PAD.l - PAD.r;
  const ch = dims.h - PAD.t - PAD.b;

  const toX = useCallback((price: number) => {
    if (priceMax === priceMin) return PAD.l;
    return PAD.l + ((price - priceMin) / (priceMax - priceMin)) * cw;
  }, [priceMin, priceMax, cw, PAD.l]);

  const toY = useCallback((total: number) =>
    PAD.t + ch - (total / totalMax) * ch,
  [totalMax, ch, PAD.t]);

  const bidPath  = useMemo(() => {
    if (!bidPoints.length) return '';
    const pts = bidPoints.map((p) => `${toX(p.price)},${toY(p.total)}`).join(' L');
    return `M${toX(bidPoints[0].price)},${toY(0)} L${pts} L${toX(bidPoints[bidPoints.length - 1].price)},${toY(0)} Z`;
  }, [bidPoints, toX, toY]);

  const askPath  = useMemo(() => {
    if (!askPoints.length) return '';
    const pts = askPoints.map((p) => `${toX(p.price)},${toY(p.total)}`).join(' L');
    return `M${toX(askPoints[0].price)},${toY(0)} L${pts} L${toX(askPoints[askPoints.length - 1].price)},${toY(0)} Z`;
  }, [askPoints, toX, toY]);

  const bidStroke = useMemo(() =>
    bidPoints.length ? `M${bidPoints.map((p) => `${toX(p.price)},${toY(p.total)}`).join(' L')}` : '',
  [bidPoints, toX, toY]);

  const askStroke = useMemo(() =>
    askPoints.length ? `M${askPoints.map((p) => `${toX(p.price)},${toY(p.total)}`).join(' L')}` : '',
  [askPoints, toX, toY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
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
      setTooltip({ x: toX(closest.price), y: toY(closest.total), price: closest.price, total: closest.total, side: closest.side });
    }
  }, [bidPoints, askPoints, priceMin, priceMax, cw, PAD.l, toX, toY]);

  if (!bids.length || !asks.length) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-bg)' }}>
        <span className="label-sm">Loading depth...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)' }}>
      <div style={{ padding: '5px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span className="label-sm">Depth</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <svg
          width={dims.w} height={dims.h}
          style={{ display: 'block', userSelect: 'none' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          aria-label="Market depth chart"
        >
          <path d={bidPath}   fill="rgba(38,166,154,0.10)" />
          <path d={bidStroke} fill="none" stroke="rgba(38,166,154,0.85)" strokeWidth="1.5" />
          <path d={askPath}   fill="rgba(239,83,80,0.10)" />
          <path d={askStroke} fill="none" stroke="rgba(239,83,80,0.85)" strokeWidth="1.5" />

          {midPrice && (
            <line
              x1={toX(midPrice)} y1={PAD.t}
              x2={toX(midPrice)} y2={PAD.t + ch}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,3"
            />
          )}

          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const price = priceMin + (priceMax - priceMin) * pct;
            return (
              <text
                key={pct}
                x={toX(price)} y={dims.h - 5}
                textAnchor="middle"
                fill="rgba(255,255,255,0.20)"
                fontSize="9"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {price.toFixed(price > 100 ? 0 : 2)}
              </text>
            );
          })}

          {tooltip && (
            <>
              <circle
                cx={tooltip.x} cy={tooltip.y} r={3.5}
                fill={tooltip.side === 'bid' ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)'}
              />
              <rect
                x={Math.min(tooltip.x + 8, dims.w - 155)} y={Math.max(tooltip.y - 30, 4)}
                width={148} height={26} rx={3}
                fill="rgba(22,26,38,0.97)"
                stroke="rgba(255,255,255,0.10)"
              />
              <text
                x={Math.min(tooltip.x + 14, dims.w - 149)} y={Math.max(tooltip.y - 12, 20)}
                fill="rgba(255,255,255,0.85)"
                fontSize="10"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {tooltip.price.toFixed(2)} · {tooltip.total.toFixed(3)}
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
