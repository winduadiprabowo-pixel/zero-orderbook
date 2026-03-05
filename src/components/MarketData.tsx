/**
 * MarketData.tsx — ZERØ ORDER BOOK v26
 * Futures data + 24h stats. Clean data panel.
 * rgba() only ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo } from 'react';
import type { TickerData, SymbolInfo } from '@/types/market';
import { useMarketCap } from '@/hooks/useMarketCap';
import { useFutures }   from '@/hooks/useFutures';
import {
  formatCompact, formatCompactNum, formatFundingRate, formatPct,
} from '@/lib/formatters';

interface MarketDataProps {
  ticker:     TickerData | null;
  symbolInfo: SymbolInfo;
}

const MarketData: React.FC<MarketDataProps> = React.memo(({ ticker, symbolInfo }) => {
  const { marketCap, error: mcError }    = useMarketCap(symbolInfo.coingeckoId);
  const { data: futures, error: fError } = useFutures(symbolInfo.symbol);

  const changeColor = useMemo(() => {
    if (!ticker) return 'rgba(255,255,255,0.55)';
    return ticker.priceChangePercent >= 0 ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  }, [ticker]);

  const lsrColor = useMemo(() => {
    if (!futures) return 'rgba(255,255,255,0.55)';
    return futures.longShortRatio >= 1 ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  }, [futures]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(16,19,28,1)' }}>

      {/* 24H Stats */}
      <Section title="24H Stats">
        {ticker ? (
          <>
            <DataRow label="Price"
              value={ticker.lastPrice.toLocaleString('en-US', {
                minimumFractionDigits: Math.min(symbolInfo.priceDec, 6),
                maximumFractionDigits: Math.min(symbolInfo.priceDec, 6),
              })}
              color="rgba(255,255,255,0.92)"
            />
            <DataRow label="Change"
              value={`${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%`}
              color={changeColor}
            />
            <DataRow label="High"
              value={ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              color="rgba(38,166,154,1)"
            />
            <DataRow label="Low"
              value={ticker.lowPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              color="rgba(239,83,80,1)"
            />
            <DataRow label="Volume"
              value={formatCompact(ticker.quoteVolume)}
              color="rgba(255,255,255,0.80)"
            />
            <DataRow label="Mkt Cap"
              value={marketCap ? formatCompact(marketCap) : mcError ? 'N/A' : '...'}
              color="rgba(255,255,255,0.80)"
            />
          </>
        ) : <SkeletonRows n={6} />}
      </Section>

      {/* Futures */}
      <Section title="Futures">
        {futures ? (
          <>
            <DataRow label="Mark Price"
              value={futures.markPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              color="rgba(255,255,255,0.92)"
            />
            <DataRow label="Funding"
              value={formatFundingRate(futures.fundingRate)}
              color={futures.fundingRate >= 0 ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)'}
            />
            <DataRow label="Open Int."
              value={futures.openInterestUsd > 0
                ? formatCompact(futures.openInterestUsd)
                : formatCompactNum(futures.openInterest)}
              color="rgba(242,142,44,1)"
            />

            {/* Long/Short bar */}
            <div style={{ marginTop: '8px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
              }}>
                <span style={{
                  fontSize: '9px', fontWeight: 700, color: 'rgba(38,166,154,1)',
                }}>
                  L {formatPct(futures.longPct, 1)}
                </span>
                <span className="label-xs">L/S RATIO</span>
                <span style={{
                  fontSize: '9px', fontWeight: 700, color: 'rgba(239,83,80,1)',
                }}>
                  S {formatPct(futures.shortPct, 1)}
                </span>
              </div>
              <div style={{
                height: '4px', borderRadius: '2px',
                background: 'rgba(239,83,80,0.20)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${futures.longPct}%`,
                  background: 'rgba(38,166,154,1)',
                  borderRadius: '2px', transition: 'width 300ms',
                }} />
              </div>
              <div style={{
                display: 'flex', justifyContent: 'center', marginTop: '4px',
              }}>
                <span className="mono-num" style={{
                  fontSize: '10px', fontWeight: 700, color: lsrColor,
                }}>
                  LSR {futures.longShortRatio.toFixed(3)}
                </span>
              </div>
            </div>
          </>
        ) : fError ? (
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
            Futures unavailable
          </span>
        ) : (
          <SkeletonRows n={4} />
        )}
      </Section>

      {/* PRO Features teaser */}
      <Section title="PRO Features">
        <ProFeatureRow label="Price Alerts" desc="Browser push notification" />
        <ProFeatureRow label="Watchlist"    desc="Save & persist pairs"       />
        <ProFeatureRow label="Multi-View"   desc="Watch 4 pairs at once"      />
        <a
          href="https://zerobuildlab.gumroad.com/l/atbwr"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: '10px', padding: '7px',
            background: 'rgba(242,142,44,0.10)',
            border: '1px solid rgba(242,142,44,0.35)',
            borderRadius: '3px', cursor: 'pointer',
            textDecoration: 'none',
            fontSize: '10px', fontWeight: 700,
            color: 'rgba(242,142,44,1)', letterSpacing: '0.07em',
          }}
        >
          ⚡ UPGRADE PRO — $9
        </a>
      </Section>
    </div>
  );
});
MarketData.displayName = 'MarketData';

// ── Sub-components ────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = React.memo(
  ({ title, children }) => (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{
        padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span className="label-sm">{title}</span>
      </div>
      <div style={{
        padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px',
      }}>
        {children}
      </div>
    </div>
  )
);
Section.displayName = 'Section';

const DataRow: React.FC<{ label: string; value: string; color: string }> = React.memo(
  ({ label, value, color }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span className="label-xs">{label}</span>
      <span className="mono-num" style={{ fontSize: '11px', fontWeight: 700, color }}>{value}</span>
    </div>
  )
);
DataRow.displayName = 'DataRow';

const ProFeatureRow: React.FC<{ label: string; desc: string }> = React.memo(({ label, desc }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0',
  }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{
        fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.55)',
      }}>
        {label}
      </span>
      <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.22)' }}>
        {desc}
      </span>
    </div>
    <span style={{
      fontSize: '8px', fontWeight: 700,
      color: 'rgba(242,142,44,0.7)',
      padding: '2px 5px',
      border: '1px solid rgba(242,142,44,0.20)',
      borderRadius: '2px',
      letterSpacing: '0.06em',
    }}>
      PRO
    </span>
  </div>
));
ProFeatureRow.displayName = 'ProFeatureRow';

const SkeletonRows: React.FC<{ n: number }> = React.memo(({ n }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className="skeleton-shimmer" style={{ height: '12px', borderRadius: '2px' }} />
    ))}
  </div>
));
SkeletonRows.displayName = 'SkeletonRows';

export default MarketData;
