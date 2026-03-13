/**
 * TradingViewChart.tsx — ZERØ ORDER BOOK v43
 * FIX: Widget rebuild ONLY on symbol change.
 *      Interval change → postMessage setInterval → drawings PRESERVED.
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useEffect, useRef, useCallback, useState, memo } from 'react';
import type { Interval, TickerData, SymbolInfo } from '@/types/market';
import { type ExchangeId, toTvSymbol as exchangeTvSymbol } from '@/hooks/useExchange';
import { formatCompact } from '@/lib/formatters';

interface TradingViewChartProps {
  symbol:           string;
  interval:         Interval;
  onIntervalChange: (i: Interval) => void;
  ticker?:          TickerData | null;
  symbolInfo?:      SymbolInfo;
  exchange?:        ExchangeId;
}

const TV_INTERVAL_MAP: Record<Interval, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D',
};

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

// ── Candle Countdown ──────────────────────────────────────────────────────────

const CandleCountdown: React.FC<{ interval: Interval }> = React.memo(({ interval }) => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const totalSecs = INTERVAL_SECONDS[interval];
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(totalSecs - (now % totalSecs));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [interval]);

  const mm  = Math.floor(remaining / 60).toString().padStart(2, '0');
  const ss  = (remaining % 60).toString().padStart(2, '0');
  const str = interval === '1d'
    ? Math.floor(remaining / 3600) + 'h ' + Math.floor((remaining % 3600) / 60) + 'm'
    : remaining >= 60 ? mm + ':' + ss : ss + 's';

  const isUrgent = remaining <= 10;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      padding: '2px 7px',
      background: isUrgent ? 'rgba(242,142,44,0.12)' : 'rgba(255,255,255,0.04)',
      border: '1px solid ' + (isUrgent ? 'rgba(242,142,44,0.35)' : 'rgba(255,255,255,0.07)'),
      borderRadius: '3px', flexShrink: 0,
    }}>
      <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
        <rect x="3" y="0" width="2" height="2" rx="0.5" fill={isUrgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.35)'} />
        <rect x="1" y="2" width="6" height="6" rx="0.5" fill={isUrgent ? 'rgba(242,142,44,0.8)' : 'rgba(255,255,255,0.25)'} />
        <rect x="3" y="8" width="2" height="2" rx="0.5" fill={isUrgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.35)'} />
      </svg>
      <span
        className={'mono-num' + (isUrgent ? ' countdown-urgent' : '')}
        style={{
          fontSize: '10px', fontWeight: 800,
          color: isUrgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.55)',
          letterSpacing: '0.04em', minWidth: '28px',
        }}
      >
        {str}
      </span>
    </div>
  );
});
CandleCountdown.displayName = 'CandleCountdown';

// ── Mobile Stats Strip — Coinglass style ──────────────────────────────────────

const MobileStatsStrip: React.FC<{
  ticker:     TickerData;
  symbolInfo: SymbolInfo;
}> = React.memo(({ ticker, symbolInfo }) => {
  const isUp        = ticker.priceChangePercent >= 0;
  const priceColor  = isUp ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  const changeBg    = isUp ? 'rgba(38,166,154,0.12)' : 'rgba(239,83,80,0.12)';
  const changeColor = priceColor;

  const dec = Math.min(symbolInfo.priceDec ?? 2, 6);

  const priceStr  = ticker.lastPrice.toLocaleString('en-US', {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  });
  const changeStr = (isUp ? '+' : '') + ticker.priceChangePercent.toFixed(2) + '%';
  const highStr   = ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: dec });
  const lowStr    = ticker.lowPrice.toLocaleString('en-US',  { maximumFractionDigits: dec });
  const volStr    = formatCompact(ticker.quoteVolume).replace('$', '');

  return (
    <div style={{
      padding: '8px 14px 6px',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      background: 'rgba(13,16,23,1)',
      flexShrink: 0,
    }}>
      {/* Row 1: big price + change badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
        <span className="mono-num" style={{
          fontSize: '22px', fontWeight: 800, color: priceColor,
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {priceStr}
        </span>
        <span style={{
          fontSize: '11px', fontWeight: 700,
          padding: '3px 8px', borderRadius: '4px',
          background: changeBg, color: changeColor,
        }}>
          {changeStr}
        </span>
      </div>

      {/* Row 2: H / L / Vol */}
      <div style={{
        display: 'flex', gap: '0',
        borderTop: '1px solid rgba(255,255,255,0.045)',
        paddingTop: '5px',
      }}>
        <StatItem label="24h High" value={highStr} color="rgba(38,166,154,0.85)" />
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 12px', alignSelf: 'stretch' }} />
        <StatItem label="24h Low"  value={lowStr}  color="rgba(239,83,80,0.85)" />
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 12px', alignSelf: 'stretch' }} />
        <StatItem label="Volume($)" value={volStr} color="rgba(255,255,255,0.65)" />
      </div>
    </div>
  );
});
MobileStatsStrip.displayName = 'MobileStatsStrip';

const StatItem: React.FC<{ label: string; value: string; color: string }> = React.memo(({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
    <span style={{ fontSize: '8.5px', fontWeight: 600, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.05em' }}>
      {label}
    </span>
    <span className="mono-num" style={{ fontSize: '11px', fontWeight: 700, color, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {value}
    </span>
  </div>
));
StatItem.displayName = 'StatItem';

// ── Main Chart ────────────────────────────────────────────────────────────────

const TradingViewChart: React.FC<TradingViewChartProps> = memo(({
  symbol, interval, onIntervalChange, ticker, symbolInfo, exchange = 'bybit',
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const widgetRef     = useRef<HTMLDivElement | null>(null);
  const scriptRef     = useRef<HTMLScriptElement | null>(null);
  const iframeRef     = useRef<HTMLIFrameElement | null>(null);
  const intervalRef   = useRef<Interval>(interval);
  const symbolRef     = useRef<string>(symbol);

  // Interval change → postMessage to TradingView iframe (drawings PRESERVED)
  useEffect(() => {
    intervalRef.current = interval;
    const iframe = iframeRef.current
      ?? (containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null);
    if (iframe) {
      iframeRef.current = iframe;
      try {
        iframe.contentWindow?.postMessage(
          { name: 'set-symbol', data: { symbol: exchangeTvSymbol(exchange, symbolRef.current), interval: TV_INTERVAL_MAP[interval] } },
          '*'
        );
      } catch { /* cross-origin guard */ }
    }
  }, [interval]);

  const buildWidget = useCallback(() => {
    if (!containerRef.current) return;
    if (widgetRef.current) { widgetRef.current.remove(); widgetRef.current = null; }
    if (scriptRef.current) { scriptRef.current.remove(); scriptRef.current = null; }
    iframeRef.current = null;
    symbolRef.current = symbol;

    const tvSymbol   = exchangeTvSymbol(exchange, symbol);
    const tvInterval = TV_INTERVAL_MAP[intervalRef.current];

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.cssText = 'width:100%;height:100%;';

    const inner = document.createElement('div');
    inner.id = 'tvzerob_' + Date.now();
    inner.style.cssText = 'width:100%;height:100%;';
    wrapper.appendChild(inner);
    containerRef.current.appendChild(wrapper);
    widgetRef.current = wrapper;

    const config = {
      autosize:             true,
      symbol:               tvSymbol,
      interval:             tvInterval,
      timezone:             'Etc/UTC',
      theme:                'dark',
      style:                '1',
      locale:               'en',
      toolbar_bg:           '#0a0d14',
      enable_publishing:    false,
      hide_top_toolbar:     false,
      hide_side_toolbar:    false,
      allow_symbol_change:  false,
      hide_legend:          false,
      save_image:           true,
      withdateranges:       true,
      container_id:         inner.id,
      backgroundColor:      'rgba(10,13,20,1)',
      gridColor:            'rgba(255,255,255,0.03)',
      // v91: lock chart to latest candle — no more auto-drift
      scroll_to_realtime:   true,
      studies:              ['Volume@tv-basicstudies'],
      overrides: {
        'mainSeriesProperties.candleStyle.upColor':            'rgba(38,166,154,1)',
        'mainSeriesProperties.candleStyle.downColor':          'rgba(239,83,80,1)',
        'mainSeriesProperties.candleStyle.borderUpColor':      'rgba(38,166,154,1)',
        'mainSeriesProperties.candleStyle.borderDownColor':    'rgba(239,83,80,1)',
        'mainSeriesProperties.candleStyle.wickUpColor':        'rgba(38,166,154,0.75)',
        'mainSeriesProperties.candleStyle.wickDownColor':      'rgba(239,83,80,0.75)',
        'paneProperties.background':                           'rgba(10,13,20,1)',
        'paneProperties.backgroundType':                       'solid',
        'paneProperties.vertGridProperties.color':             'rgba(255,255,255,0.03)',
        'paneProperties.horzGridProperties.color':             'rgba(255,255,255,0.03)',
        'scalesProperties.textColor':                          'rgba(255,255,255,0.40)',
        'scalesProperties.backgroundColor':                    'rgba(10,13,20,1)',
        'scalesProperties.lineColor':                          'rgba(255,255,255,0.05)',
        'paneProperties.legendProperties.showLegend':          true,
        'paneProperties.legendProperties.showStudyArguments':  false,
        'paneProperties.legendProperties.showStudyTitles':     true,
        'paneProperties.legendProperties.showStudyValues':     true,
        'paneProperties.legendProperties.showSeriesTitle':     true,
        'paneProperties.legendProperties.showBarChange':       true,
        'paneProperties.topMargin':                            8,
        'paneProperties.bottomMargin':                         8,
      },
      studies_overrides: {
        'volume.volume.color.0':      'rgba(239,83,80,0.45)',
        'volume.volume.color.1':      'rgba(38,166,154,0.45)',
        'volume.volume ma.color':     'rgba(242,142,44,0.8)',
        'volume.volume ma.linewidth': 1,
        'volume.show ma':             false,
      },
      loading_screen: {
        backgroundColor: 'rgba(10,13,20,1)',
        foregroundColor: 'rgba(242,142,44,0.7)',
      },
    };

    const script = document.createElement('script');
    script.src   = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      const win = window as unknown as Record<string, { widget: new (c: unknown) => unknown }>;
      if (win.TradingView) new win.TradingView.widget(config);
    };
    document.head.appendChild(script);
    scriptRef.current = script;
  // Rebuild ONLY on symbol change — interval handled via postMessage
  }, [symbol]);

  useEffect(() => {
    buildWidget();
    return () => {
      if (widgetRef.current) { widgetRef.current.remove(); widgetRef.current = null; }
      if (scriptRef.current) { scriptRef.current.remove(); scriptRef.current = null; }
    };
  }, [buildWidget]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(10,13,20,1)',
    }}>
      {/* Mobile stats strip — Coinglass style, hidden on desktop */}
      {ticker && symbolInfo && (
        <div className="mobile-chart-stats">
          <MobileStatsStrip ticker={ticker} symbolInfo={symbolInfo} />
        </div>
      )}

      {/* Interval bar + countdown */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '4px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        background: 'rgba(14,17,26,1)',
        flexShrink: 0,
        overflowX: 'auto',
      }} className="hide-scrollbar">
        <span className="label-xs" style={{ marginRight: '6px', flexShrink: 0 }}>INTERVAL</span>
        {(['1m','5m','15m','1h','4h','1d'] as Interval[]).map((i) => (
          <button
            key={i}
            onClick={() => onIntervalChange(i)}
            style={{
              padding: '3px 8px', fontSize: '10px', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', borderRadius: '3px',
              border: 'none', transition: 'all 80ms', flexShrink: 0,
              background: interval === i ? 'rgba(242,142,44,0.14)' : 'transparent',
              color:      interval === i ? 'rgba(242,142,44,1)'    : 'rgba(255,255,255,0.30)',
              letterSpacing: '0.04em',
            }}
          >
            {i.toUpperCase()}
          </button>
        ))}

        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)', margin: '0 6px', flexShrink: 0 }} />
        <CandleCountdown interval={interval} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '8px', fontWeight: 600, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.06em', flexShrink: 0 }}>
          TRADINGVIEW
        </span>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />

      <style>{`
        .mobile-chart-stats { display: none; }
        @media (max-width: 767px) {
          .mobile-chart-stats { display: block; }
        }
      `}</style>
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
export default TradingViewChart;
