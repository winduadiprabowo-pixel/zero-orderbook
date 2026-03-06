/**
 * TradingViewChart.tsx — ZERØ ORDER BOOK v35
 * Full TradingView toolbar · candle countdown timer · HD overrides
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useEffect, useRef, useCallback, useState, memo } from 'react';
import type { Interval } from '@/types/market';

interface TradingViewChartProps {
  symbol:           string;
  interval:         Interval;
  onIntervalChange: (i: Interval) => void;
}

const TV_INTERVAL_MAP: Record<Interval, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D',
};

// Interval in seconds
const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

function toTvSymbol(symbol: string): string {
  const up = symbol.toUpperCase();
  // Handle all quote assets
  for (const q of ['USDT','USDC','BUSD','BTC','ETH','BNB','FDUSD']) {
    if (up.endsWith(q)) return 'BINANCE:' + up;
  }
  return 'BINANCE:' + up + 'USDT';
}

// ── Candle Countdown ──────────────────────────────────────────────────────────

const CandleCountdown: React.FC<{ interval: Interval }> = React.memo(({ interval }) => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const totalSecs = INTERVAL_SECONDS[interval];
    const tick = () => {
      const now  = Math.floor(Date.now() / 1000);
      const rem  = totalSecs - (now % totalSecs);
      setRemaining(rem);
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
      borderRadius: '3px',
      flexShrink: 0,
    }}>
      {/* Candle icon */}
      <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
        <rect x="3" y="0" width="2" height="2" rx="0.5"
          fill={isUrgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.35)'} />
        <rect x="1" y="2" width="6" height="6" rx="0.5"
          fill={isUrgent ? 'rgba(242,142,44,0.8)' : 'rgba(255,255,255,0.25)'} />
        <rect x="3" y="8" width="2" height="2" rx="0.5"
          fill={isUrgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.35)'} />
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

// ── Main Chart ────────────────────────────────────────────────────────────────

const TradingViewChart: React.FC<TradingViewChartProps> = memo(({
  symbol, interval, onIntervalChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef    = useRef<HTMLDivElement | null>(null);
  const scriptRef    = useRef<HTMLScriptElement | null>(null);

  const buildWidget = useCallback(() => {
    if (!containerRef.current) return;
    if (widgetRef.current) { widgetRef.current.remove(); widgetRef.current = null; }
    if (scriptRef.current) { scriptRef.current.remove(); scriptRef.current = null; }

    const tvSymbol   = toTvSymbol(symbol);
    const tvInterval = TV_INTERVAL_MAP[interval];

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
      // Show full toolbar
      hide_top_toolbar:     false,
      hide_side_toolbar:    false,
      allow_symbol_change:  false,
      hide_legend:          false,
      save_image:           true,
      withdateranges:       true,
      container_id:         inner.id,
      backgroundColor:      'rgba(10,13,20,1)',
      gridColor:            'rgba(255,255,255,0.03)',
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
        'volume.volume.color.0':       'rgba(239,83,80,0.45)',
        'volume.volume.color.1':       'rgba(38,166,154,0.45)',
        'volume.volume ma.color':      'rgba(242,142,44,0.8)',
        'volume.volume ma.linewidth':  1,
        'volume.show ma':              false,
      },
      loading_screen: {
        backgroundColor: 'rgba(10,13,20,1)',
        foregroundColor: 'rgba(242,142,44,0.7)',
      },
      custom_css_url: '',
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
  }, [symbol, interval]);

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
      {/* Interval bar + countdown */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '4px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        background: 'rgba(14,17,26,1)',
        flexShrink: 0,
      }}>
        <span className="label-xs" style={{ marginRight: '6px', flexShrink: 0 }}>INTERVAL</span>
        {(['1m','5m','15m','1h','4h','1d'] as Interval[]).map((i) => (
          <button
            key={i}
            onClick={() => onIntervalChange(i)}
            style={{
              padding: '3px 8px', fontSize: '10px', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', borderRadius: '3px',
              border: 'none', transition: 'all 80ms',
              background: interval === i ? 'rgba(242,142,44,0.14)' : 'transparent',
              color:      interval === i ? 'rgba(242,142,44,1)'     : 'rgba(255,255,255,0.30)',
              letterSpacing: '0.04em',
            }}
          >
            {i.toUpperCase()}
          </button>
        ))}

        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)', margin: '0 6px', flexShrink: 0 }} />

        {/* Candle countdown */}
        <CandleCountdown interval={interval} />

        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: '8px', fontWeight: 600,
          color: 'rgba(255,255,255,0.12)', letterSpacing: '0.06em',
        }}>
          TRADINGVIEW
        </span>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
export default TradingViewChart;
