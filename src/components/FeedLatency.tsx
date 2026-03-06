/**
 * FeedLatency.tsx — ZERØ ORDER BOOK v39 — NEW COMPONENT
 * Bloomberg Terminal-style feed latency indicator
 * Shows exchange timestamp → browser latency in ms
 *
 * Color coding:
 *   0-50ms   → green  (excellent — co-located or same region)
 *   51-150ms → yellow (good — normal retail)
 *   151-300ms → orange (fair — degraded)
 *   300ms+   → red    (poor — potential data issues)
 *
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */
import React, { useMemo } from 'react';

interface FeedLatencyProps {
  latencyMs: number | null;
}

const FeedLatency: React.FC<FeedLatencyProps> = React.memo(({ latencyMs }) => {
  const { color, label, bars } = useMemo(() => {
    if (latencyMs === null) {
      return { color: 'rgba(255,255,255,0.22)', label: '—', bars: 0 };
    }
    if (latencyMs <= 50)  return { color: 'rgba(38,166,154,1)',  label: latencyMs + 'ms', bars: 4 };
    if (latencyMs <= 150) return { color: 'rgba(130,200,100,1)', label: latencyMs + 'ms', bars: 3 };
    if (latencyMs <= 300) return { color: 'rgba(242,142,44,1)',  label: latencyMs + 'ms', bars: 2 };
    return                       { color: 'rgba(239,83,80,1)',   label: latencyMs + 'ms', bars: 1 };
  }, [latencyMs]);

  return (
    <div
      title={'Feed latency: ' + (latencyMs !== null ? latencyMs + 'ms (exchange → browser)' : 'measuring...')}
      style={{
        display: 'flex', alignItems: 'center', gap: '3px',
        cursor: 'default', userSelect: 'none', flexShrink: 0,
      }}
    >
      {/* Signal strength bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5px', height: '10px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: '3px',
              height: 3 + i * 1.8 + 'px',
              borderRadius: '1px',
              background: i <= bars ? color : 'rgba(255,255,255,0.12)',
              transition: 'background 400ms',
            }}
          />
        ))}
      </div>
      <span style={{
        fontSize: '8.5px', fontWeight: 700,
        color, letterSpacing: '0.04em',
        fontFamily: "'IBM Plex Mono', monospace",
        minWidth: '28px',
      }}>
        {label}
      </span>
    </div>
  );
});

FeedLatency.displayName = 'FeedLatency';
export default FeedLatency;
