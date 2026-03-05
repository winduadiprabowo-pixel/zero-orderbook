/**
 * TradingViewChart.tsx — ZERØ ORDER BOOK
 * TradingView Advanced Chart Widget — full drawing tools, indicators, HD candles.
 * Docs: https://www.tradingview.com/widget/advanced-chart/
 */

import React, { useEffect, useRef, useCallback, memo } from 'react';
import type { Interval } from '@/types/market';

interface TradingViewChartProps {
  symbol:           string;  // e.g. 'btcusdt'
  interval:         Interval;
  onIntervalChange: (i: Interval) => void;
}

// Map our intervals to TradingView interval strings
const TV_INTERVAL_MAP: Record<Interval, string> = {
  '1m':  '1',
  '5m':  '5',
  '15m': '15',
  '1h':  '60',
  '4h':  '240',
  '1d':  'D',
};

// Map symbol to TradingView symbol
function toTvSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().replace('USDT', '');
  return `BINANCE:${upper}USDT`;
}

const TradingViewChart: React.FC<TradingViewChartProps> = memo(({
  symbol,
  interval,
  onIntervalChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef    = useRef<HTMLDivElement>(null);
  const scriptRef    = useRef<HTMLScriptElement | null>(null);

  const buildWidget = useCallback(() => {
    if (!containerRef.current) return;

    // Clear old widget
    if (widgetRef.current) {
      widgetRef.current.remove();
    }
    if (scriptRef.current) {
      scriptRef.current.remove();
      scriptRef.current = null;
    }

    const tvSymbol   = toTvSymbol(symbol);
    const tvInterval = TV_INTERVAL_MAP[interval];

    // Container div for widget
    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.cssText = 'width:100%;height:100%;';

    const inner = document.createElement('div');
    inner.id = 'tradingview_zerob_' + Date.now();
    inner.style.cssText = 'width:100%;height:calc(100% - 0px);';
    wrapper.appendChild(inner);

    containerRef.current.appendChild(wrapper);
    (widgetRef as React.MutableRefObject<HTMLDivElement>).current = wrapper;

    const config = {
      autosize:             true,
      symbol:               tvSymbol,
      interval:             tvInterval,
      timezone:             'Etc/UTC',
      theme:                'dark',
      style:                '1',       // Candlestick
      locale:               'en',
      toolbar_bg:           '#0d1017',
      enable_publishing:    false,
      hide_top_toolbar:     false,
      hide_legend:          false,
      save_image:           true,
      container_id:         inner.id,
      backgroundColor:      'rgba(13,16,23,1)',
      gridColor:            'rgba(255,255,255,0.04)',
      allow_symbol_change:  false,
      studies:              [],
      overrides: {
        'mainSeriesProperties.candleStyle.upColor':         'rgba(38,166,154,1)',
        'mainSeriesProperties.candleStyle.downColor':       'rgba(239,83,80,1)',
        'mainSeriesProperties.candleStyle.borderUpColor':   'rgba(38,166,154,1)',
        'mainSeriesProperties.candleStyle.borderDownColor': 'rgba(239,83,80,1)',
        'mainSeriesProperties.candleStyle.wickUpColor':     'rgba(38,166,154,0.7)',
        'mainSeriesProperties.candleStyle.wickDownColor':   'rgba(239,83,80,0.7)',
        'paneProperties.background':                        'rgba(13,16,23,1)',
        'paneProperties.backgroundType':                    'solid',
        'paneProperties.gridLinesMode':                     'vertical',
        'paneProperties.vertGridProperties.color':          'rgba(255,255,255,0.04)',
        'paneProperties.horzGridProperties.color':          'rgba(255,255,255,0.04)',
        'scalesProperties.textColor':                       'rgba(255,255,255,0.45)',
        'scalesProperties.backgroundColor':                 'rgba(13,16,23,1)',
        'scalesProperties.lineColor':                       'rgba(255,255,255,0.06)',
        'paneProperties.legendProperties.showLegend':       false,
      },
      loading_screen: {
        backgroundColor: 'rgba(13,16,23,1)',
        foregroundColor: 'rgba(242,142,44,0.6)',
      },
    };

    const script = document.createElement('script');
    script.src  = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if ((window as unknown as Record<string, unknown>).TradingView) {
        new (window as unknown as Record<string, { widget: new (c: unknown) => unknown }>)
          .TradingView.widget(config);
      }
    };
    document.head.appendChild(script);
    scriptRef.current = script;
  }, [symbol, interval]);

  useEffect(() => {
    buildWidget();
    return () => {
      if (widgetRef.current) {
        widgetRef.current.remove();
        (widgetRef as React.MutableRefObject<HTMLDivElement | null>).current = null;
      }
      if (scriptRef.current) {
        scriptRef.current.remove();
        scriptRef.current = null;
      }
    };
  }, [buildWidget]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(13,16,23,1)',
    }}>
      {/* Interval bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '5px 10px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--panel-bg)',
        flexShrink: 0,
      }}>
        <span className="label-xs" style={{ marginRight: '6px', flexShrink: 0 }}>INTERVAL</span>
        {(['1m','5m','15m','1h','4h','1d'] as Interval[]).map((i) => (
          <button
            key={i}
            onClick={() => onIntervalChange(i)}
            style={{
              padding: '2px 8px', fontSize: '10px', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', borderRadius: '2px',
              border: 'none', transition: 'all 100ms',
              background: interval === i ? 'rgba(242,142,44,0.15)' : 'transparent',
              color:      interval === i ? 'var(--gold)'            : 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            {i.toUpperCase()}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: '9px', fontWeight: 600,
          color: 'var(--text-disabled)', letterSpacing: '0.06em',
        }}>
          POWERED BY TRADINGVIEW
        </span>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      />
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
export default TradingViewChart;
