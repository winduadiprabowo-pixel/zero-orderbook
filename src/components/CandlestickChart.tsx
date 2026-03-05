import React, { useEffect, useRef, useMemo } from 'react';
import {
  createChart, type IChartApi, type ISeriesApi,
  ColorType, CrosshairMode,
} from 'lightweight-charts';
import type { KlineData, Interval } from '@/types/market';

interface CandlestickChartProps {
  candles:          KlineData[];
  interval:         Interval;
  onIntervalChange: (i: Interval) => void;
  symbol:           string;
}

const INTERVALS: { value: Interval; label: string }[] = [
  { value: '1m',  label: '1m'  },
  { value: '5m',  label: '5m'  },
  { value: '15m', label: '15m' },
  { value: '1h',  label: '1H'  },
  { value: '4h',  label: '4H'  },
  { value: '1d',  label: '1D'  },
];

const CandlestickChart: React.FC<CandlestickChartProps> = React.memo(({
  candles, interval, onIntervalChange, symbol,
}) => {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const prevSymRef      = useRef(symbol);
  const prevIntvRef     = useRef(interval);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { type: ColorType.Solid, color: 'rgba(16,19,28,1)' },
        textColor:   'rgba(255,255,255,0.28)',
        fontFamily:  "'IBM Plex Mono', monospace",
        fontSize:    10,
        attributionLogo: false, // ← hides TradingView watermark (v4+)
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.12)', width: 1, style: 2, labelVisible: true },
        horzLine: { color: 'rgba(255,255,255,0.12)', width: 1, style: 2, labelVisible: true },
      },
      rightPriceScale: {
        borderColor:  'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor:    'rgba(255,255,255,0.06)',
        timeVisible:    true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale:  true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:         'rgba(38,166,154,1)',
      downColor:       'rgba(239,83,80,1)',
      borderUpColor:   'rgba(38,166,154,1)',
      borderDownColor: 'rgba(239,83,80,1)',
      wickUpColor:     'rgba(38,166,154,0.7)',
      wickDownColor:   'rgba(239,83,80,0.7)',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current        = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // CSS-nuke any remaining TV watermark that slips through
    const killWatermark = () => {
      const el = containerRef.current?.querySelector<HTMLElement>('a[href*="tradingview"]');
      if (el) el.style.display = 'none';
    };
    const observer = new MutationObserver(killWatermark);
    observer.observe(containerRef.current, { childList: true, subtree: true });
    setTimeout(killWatermark, 500);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({
          width:  entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ro.disconnect();
      chart.remove();
      chartRef.current        = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !candles.length) return;

    const shouldFit = prevSymRef.current !== symbol || prevIntvRef.current !== interval;

    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time:  c.time as number & { readonly __type: unique symbol },
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      }))
    );
    volumeSeriesRef.current.setData(
      candles.map((c) => ({
        time:  c.time as number & { readonly __type: unique symbol },
        value: c.volume,
        color: c.close >= c.open ? 'rgba(38,166,154,0.22)' : 'rgba(239,83,80,0.22)',
      }))
    );

    if (shouldFit) {
      chartRef.current?.timeScale().fitContent();
      prevSymRef.current  = symbol;
      prevIntvRef.current = interval;
    }
  }, [candles, symbol, interval]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)',
    }}>
      {/* Interval selector */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '5px 12px', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span className="label-sm" style={{ marginRight: '8px' }}>Chart</span>
        {INTERVALS.map((i) => (
          <button
            key={i.value}
            aria-label={`Set interval ${i.label}`}
            onClick={() => onIntervalChange(i.value)}
            style={{
              padding: '2px 8px', height: '22px',
              fontSize: '10px', fontWeight: interval === i.value ? 700 : 500,
              fontFamily: 'inherit', cursor: 'pointer',
              borderRadius: '2px', border: 'none', transition: 'all 100ms',
              background: interval === i.value ? 'rgba(38,166,154,0.15)' : 'transparent',
              color: interval === i.value ? 'var(--bid-color)' : 'var(--text-muted)',
            }}
          >
            {i.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Extra CSS kill for watermark */}
        <style>{`
          .tv-lightweight-charts a,
          .tv-lightweight-charts td > a,
          a[href*="tradingview"],
          [class*="watermark"] { display: none !important; opacity: 0 !important; }
        `}</style>
      </div>
    </div>
  );
});
CandlestickChart.displayName = 'CandlestickChart';
export default CandlestickChart;
