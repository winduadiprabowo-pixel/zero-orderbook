import React, { useMemo } from 'react';
import type { TickerData, SymbolInfo } from '@/types/market';
import { useMarketCap } from '@/hooks/useMarketCap';
import { useFunding } from '@/hooks/useFunding';

interface MarketDataProps {
  ticker: TickerData | null;
  symbolInfo: SymbolInfo;
}

const MarketData: React.FC<MarketDataProps> = React.memo(({ ticker, symbolInfo }) => {
  const { marketCap, error: mcError } = useMarketCap(symbolInfo.coingeckoId);
  const { funding, error: fundError } = useFunding(symbolInfo.symbol);

  const changeColor = useMemo(() => {
    if (!ticker) return 'var(--text-secondary)';
    return ticker.priceChangePercent >= 0 ? 'var(--bid-color)' : 'var(--ask-color)';
  }, [ticker]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0',
      background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)', height: '100%',
    }}>
      {/* 24H Stats */}
      <Section title="24H Stats">
        {ticker ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <DataRow label="24H High" value={ticker.highPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} color="var(--bid-color)" />
            <DataRow label="24H Low" value={ticker.lowPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} color="var(--ask-color)" />
            <DataRow label="24H Volume" value={formatLargeNum(ticker.quoteVolume) + ' USDT'} color="var(--text-primary)" />
            <DataRow
              label="24H Change"
              value={`${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%`}
              color={changeColor}
            />
            <DataRow
              label="Market Cap"
              value={marketCap ? formatLargeNum(marketCap) : mcError ? 'Unavailable' : '...'}
              color="var(--text-primary)"
            />
          </div>
        ) : <Skeleton />}
      </Section>

      {/* Open Interest / Funding */}
      <Section title="Futures Data">
        {funding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <DataRow
              label="Funding Rate"
              value={(parseFloat(funding.fundingRate) * 100).toFixed(4) + '%'}
              color={parseFloat(funding.fundingRate) >= 0 ? 'var(--bid-color)' : 'var(--ask-color)'}
            />
            <DataRow
              label="Mark Price"
              value={parseFloat(funding.markPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              color="var(--text-primary)"
            />
          </div>
        ) : fundError ? (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Data unavailable</span>
        ) : <Skeleton />}
      </Section>
    </div>
  );
});

MarketData.displayName = 'MarketData';

const Section: React.FC<{ title: string; children: React.ReactNode }> = React.memo(({ title, children }) => (
  <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
    <div style={{
      padding: '8px 12px', fontSize: '10px', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>{title}</div>
    <div style={{ padding: '10px 12px' }}>{children}</div>
  </div>
));
Section.displayName = 'Section';

const DataRow: React.FC<{ label: string; value: string; color: string }> = React.memo(({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    <span style={{ fontSize: '12px', fontWeight: 700, color }}>{value}</span>
  </div>
));
DataRow.displayName = 'DataRow';

const Skeleton: React.FC = React.memo(() => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {[1, 2, 3].map((i) => (
      <div key={i} className="skeleton-shimmer" style={{ height: '14px', borderRadius: '3px' }} />
    ))}
  </div>
));
Skeleton.displayName = 'Skeleton';

function formatLargeNum(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export default MarketData;
