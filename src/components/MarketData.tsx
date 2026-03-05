import React, { useMemo } from 'react';
import type { TickerData, SymbolInfo } from '@/types/market';
import { useMarketCap } from '@/hooks/useMarketCap';
import { useFutures } from '@/hooks/useFutures';
import { formatCompact, formatCompactNum, formatFundingRate, formatPct } from '@/lib/formatters';

interface MarketDataProps {
  ticker:     TickerData | null;
  symbolInfo: SymbolInfo;
}

const MarketData: React.FC<MarketDataProps> = React.memo(({ ticker, symbolInfo }) => {
  const { marketCap, error: mcError }   = useMarketCap(symbolInfo.coingeckoId);
  const { data: futures, error: fError } = useFutures(symbolInfo.symbol);

  const changeColor = useMemo(() => {
    if (!ticker) return 'var(--text-secondary)';
    return ticker.priceChangePercent >= 0 ? 'var(--bid-color)' : 'var(--ask-color)';
  }, [ticker]);

  const lsrColor = useMemo(() => {
    if (!futures) return 'var(--text-secondary)';
    return futures.longShortRatio >= 1 ? 'var(--bid-color)' : 'var(--ask-color)';
  }, [futures]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)',
    }}>
      {/* 24H Stats */}
      <Section title="24H Stats">
        {ticker ? (
          <>
            <DataRow label="High"    value={ticker.highPrice.toLocaleString('en-US',{minimumFractionDigits:2})} color="var(--bid-color)" />
            <DataRow label="Low"     value={ticker.lowPrice.toLocaleString('en-US',{minimumFractionDigits:2})}  color="var(--ask-color)" />
            <DataRow label="Volume"  value={formatCompact(ticker.quoteVolume)}                                  color="var(--text-primary)" />
            <DataRow
              label="Change"
              value={`${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%`}
              color={changeColor}
            />
            <DataRow
              label="Mkt Cap"
              value={marketCap ? formatCompact(marketCap) : mcError ? 'Unavail.' : '...'}
              color="var(--text-primary)"
            />
          </>
        ) : <SkeletonRows n={5} />}
      </Section>

      {/* Futures */}
      <Section title="Futures">
        {futures ? (
          <>
            <DataRow
              label="Funding"
              value={formatFundingRate(futures.fundingRate)}
              color={futures.fundingRate >= 0 ? 'var(--bid-color)' : 'var(--ask-color)'}
            />
            <DataRow label="Mark" value={futures.markPrice.toLocaleString('en-US',{minimumFractionDigits:2})} color="var(--text-primary)" />
            <DataRow
              label="Open Int."
              value={futures.openInterestUsd > 0 ? formatCompact(futures.openInterestUsd) : formatCompactNum(futures.openInterest)}
              color="var(--gold)"
            />

            {/* Long/Short ratio bar */}
            <div style={{ marginTop: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--bid-color)' }}>
                  L {formatPct(futures.longPct, 1)}
                </span>
                <span className="label-xs">L/S Ratio</span>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ask-color)' }}>
                  S {formatPct(futures.shortPct, 1)}
                </span>
              </div>
              <div style={{ height: '4px', borderRadius: '2px', background: 'var(--ask-fill)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${futures.longPct}%`,
                  background: 'var(--bid-color)',
                  borderRadius: '2px',
                  transition: 'width 300ms',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3px' }}>
                <span className="mono-num" style={{ fontSize: '10px', fontWeight: 700, color: lsrColor }}>
                  LSR {futures.longShortRatio.toFixed(3)}
                </span>
              </div>
            </div>
          </>
        ) : fError ? (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Futures data unavailable</span>
        ) : <SkeletonRows n={4} />}
      </Section>
    </div>
  );
});
MarketData.displayName = 'MarketData';

// ─── Sub-components ───────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = React.memo(({ title, children }) => (
  <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
    <div style={{ padding: '5px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="label-sm">{title}</span>
    </div>
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {children}
    </div>
  </div>
));
Section.displayName = 'Section';

const DataRow: React.FC<{ label: string; value: string; color: string }> = React.memo(({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span className="label-xs">{label}</span>
    <span className="mono-num" style={{ fontSize: '11px', fontWeight: 700, color }}>{value}</span>
  </div>
));
DataRow.displayName = 'DataRow';

const SkeletonRows: React.FC<{ n: number }> = React.memo(({ n }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className="skeleton-shimmer" style={{ height: '12px', borderRadius: '2px' }} />
    ))}
  </div>
));
SkeletonRows.displayName = 'SkeletonRows';

export default MarketData;
