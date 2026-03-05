import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode } from 'lightweight-charts';
import type { KlineData, Interval } from '@/types/market';

interface CandlestickChartProps {
  candles: KlineData[];
  interval: Interval;
  onIntervalChange: (i: Interval) => void;
  symbol: string;
}

const INTERVALS: { value: Interval; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

const CandlestickChart: React.FC<CandlestickChartProps> = React.memo(({
  candles, interval, onIntervalChange, symbol,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const prevSymbolRef = useRef(symbol);
  const prevIntervalRef = useRef(interval);

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'rgba(16,18,26,1)' },
        textColor: 'rgba(255,255,255,0.45)',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 2 },
        horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: 'rgba(0,200,100,1)',
      downColor: 'rgba(220,50,70,1)',
      borderUpColor: 'rgba(0,200,100,1)',
      borderDownColor: 'rgba(220,50,70,1)',
      wickUpColor: 'rgba(0,200,100,0.6)',
      wickDownColor: 'rgba(220,50,70,0.6)',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData = candles.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map((c) => ({
      time: c.time as any,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(0,200,100,0.25)' : 'rgba(220,50,70,0.25)',
    }));

    const shouldFit = prevSymbolRef.current !== symbol || prevIntervalRef.current !== interval;

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    if (shouldFit && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      prevSymbolRef.current = symbol;
      prevIntervalRef.current = interval;
    }
  }, [candles, symbol, interval]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel-bg)', boxShadow: 'var(--panel-glow)' }}>
      {/* Interval selector */}
      <div style={{
        display: 'flex', gap: '2px', padding: '6px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        alignItems: 'center',
      }}>
        <span style={{
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text-muted)', marginRight: '8px',
        }}>Chart</span>
        {INTERVALS.map((i) => (
          <button
            key={i.value}
            aria-label={`Set interval ${i.label}`}
            onClick={() => onIntervalChange(i.value)}
            style={{
              padding: '2px 8px', fontSize: '10px', fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer', border: 'none',
              borderRadius: '3px', transition: 'all 150ms',
              background: interval === i.value ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: interval === i.value ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {i.label}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
});

CandlestickChart.displayName = 'CandlestickChart';
export default CandlestickChart;
