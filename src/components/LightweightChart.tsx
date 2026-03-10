// LightweightChart.tsx — v82
// Changes vs v43 (TradingViewChart):
//  - Compact top toolbar: interval + chart type + indicators (MA/BB/RSI/MACD) + drawing tools
//  - RAF-batched chart updates (skip if data unchanged via hash guard)
//  - Memoized series update (only update if new candle differs)
//  - Drawing tools overlay (trendline, fib, rect) via canvas — non-blocking
//  - Indicators rendered as lightweight-charts native series
//  - Props interface IDENTICAL to TradingViewChart (drop-in replacement)
// rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  memo,
} from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  UTCTimestamp,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type { Interval, TickerData, SymbolInfo } from '@/types/market';
import { type ExchangeId } from '@/hooks/useExchange';
import { formatCompact } from '@/lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartType    = 'candle' | 'line' | 'bar' | 'area';
type IndicatorKey = 'MA' | 'RSI' | 'MACD' | 'BB';
type DrawTool     = 'none' | 'trendline' | 'fib' | 'rect';

interface OHLCBar {
  time:    UTCTimestamp;
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume?: number;
}

// Drop-in replacement for TradingViewChart — same props
interface LightweightChartProps {
  symbol:           string;
  interval:         Interval;
  onIntervalChange: (i: Interval) => void;
  ticker?:          TickerData | null;
  symbolInfo?:      SymbolInfo;
  exchange?:        ExchangeId;
  hoveredPrice?:    number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

const CHART_TYPES: { key: ChartType; icon: string }[] = [
  { key: 'candle', icon: '◫' },
  { key: 'line',   icon: '∿' },
  { key: 'bar',    icon: '⦀' },
  { key: 'area',   icon: '◭' },
];

const INDICATORS: { key: IndicatorKey; label: string }[] = [
  { key: 'MA',   label: 'MA' },
  { key: 'BB',   label: 'BB' },
  { key: 'RSI',  label: 'RSI' },
  { key: 'MACD', label: 'MACD' },
];

const DRAW_TOOLS: { key: DrawTool; icon: string; tip: string }[] = [
  { key: 'trendline', icon: '╱', tip: 'Trendline' },
  { key: 'fib',       icon: '≡', tip: 'Fibonacci' },
  { key: 'rect',      icon: '▭', tip: 'Rectangle' },
];

// ─── Bybit interval map ───────────────────────────────────────────────────────

const BYBIT_TF: Record<Interval, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D',
};
const BINANCE_TF: Record<Interval, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d',
};

// ─── Candle countdown (identical to TradingViewChart) ─────────────────────────

const CandleCountdown = memo(function CandleCountdown({ interval }: { interval: Interval }) {
  CandleCountdown.displayName = 'CandleCountdown';
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
      <span style={{
        fontSize: '10px', fontWeight: 800,
        color: isUrgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.55)',
        letterSpacing: '0.04em', minWidth: '28px',
        fontFamily: 'IBM Plex Mono, monospace',
      }}>
        {str}
      </span>
    </div>
  );
});

// ─── Mobile stats strip ───────────────────────────────────────────────────────

const MobileStatsStrip = memo(function MobileStatsStrip({
  ticker, symbolInfo,
}: { ticker: TickerData; symbolInfo: SymbolInfo }) {
  MobileStatsStrip.displayName = 'MobileStatsStrip';
  const isUp       = ticker.priceChangePercent >= 0;
  const priceColor = isUp ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  const dec        = Math.min(symbolInfo.priceDec ?? 2, 6);
  const priceStr   = ticker.lastPrice.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const changeStr  = (isUp ? '+' : '') + ticker.priceChangePercent.toFixed(2) + '%';
  const volStr     = formatCompact(ticker.quoteVolume).replace('$', '');

  return (
    <div style={{
      padding: '8px 14px 6px',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      background: 'rgba(13,16,23,1)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
        <span style={{ fontSize: '22px', fontWeight: 800, color: priceColor, fontFamily: 'IBM Plex Mono, monospace' }}>
          {priceStr}
        </span>
        <span style={{
          fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
          background: isUp ? 'rgba(38,166,154,0.12)' : 'rgba(239,83,80,0.12)',
          color: priceColor,
        }}>
          {changeStr}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0', borderTop: '1px solid rgba(255,255,255,0.045)', paddingTop: '5px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.28)' }}>24h High</div>
          <div style={{ fontSize: '11px', color: 'rgba(38,166,154,0.85)', fontFamily: 'IBM Plex Mono, monospace' }}>
            {ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: dec })}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.28)' }}>24h Low</div>
          <div style={{ fontSize: '11px', color: 'rgba(239,83,80,0.85)', fontFamily: 'IBM Plex Mono, monospace' }}>
            {ticker.lowPrice.toLocaleString('en-US', { maximumFractionDigits: dec })}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.28)' }}>Volume($)</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', fontFamily: 'IBM Plex Mono, monospace' }}>
            {volStr}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcSMA(data: OHLCBar[], period: number): LineData[] {
  const out: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg   = slice.reduce((s, b) => s + b.close, 0) / period;
    out.push({ time: data[i].time, value: avg });
  }
  return out;
}

function calcBB(data: OHLCBar[], period = 20, mult = 2) {
  const upper: LineData[] = [], lower: LineData[] = [], mid: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice    = data.slice(i - period + 1, i + 1);
    const avg      = slice.reduce((s, b) => s + b.close, 0) / period;
    const variance = slice.reduce((s, b) => s + (b.close - avg) ** 2, 0) / period;
    const sd       = Math.sqrt(variance);
    mid.push({ time: data[i].time, value: avg });
    upper.push({ time: data[i].time, value: avg + mult * sd });
    lower.push({ time: data[i].time, value: avg - mult * sd });
  }
  return { upper, lower, mid };
}

function calcRSI(data: OHLCBar[], period = 14): LineData[] {
  const out: LineData[] = [];
  if (data.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i].close - data[i - 1].close;
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  out.push({ time: data[period].time, value: 100 - 100 / (1 + avgG / (avgL || 1)) });
  for (let i = period + 1; i < data.length; i++) {
    const d  = data[i].close - data[i - 1].close;
    const g  = d > 0 ? d : 0;
    const l  = d < 0 ? -d : 0;
    avgG     = (avgG * (period - 1) + g) / period;
    avgL     = (avgL * (period - 1) + l) / period;
    out.push({ time: data[i].time, value: 100 - 100 / (1 + avgG / (avgL || 1)) });
  }
  return out;
}

function calcMACD(data: OHLCBar[], fast = 12, slow = 26, signal = 9) {
  const ema = (arr: number[], p: number) => {
    const k = 2 / (p + 1);
    const r = [arr[0]];
    for (let i = 1; i < arr.length; i++) r.push(arr[i] * k + r[i - 1] * (1 - k));
    return r;
  };
  const closes     = data.map((b) => b.close);
  const fastEma    = ema(closes, fast);
  const slowEma    = ema(closes, slow);
  const macdLine   = fastEma.map((v, i) => v - slowEma[i]);
  const signalLine = ema(macdLine.slice(slow - 1), signal);
  const macdSeries: LineData[] = [], signalSeries: LineData[] = [];
  const offset = slow - 1;
  signalLine.forEach((sv, i) => {
    const idx = offset + signal - 1 + i;
    if (idx >= data.length) return;
    macdSeries.push({ time: data[idx].time, value: macdLine[offset + signal - 1 + i] });
    signalSeries.push({ time: data[idx].time, value: sv });
  });
  return { macdSeries, signalSeries };
}

// ─── Drawing overlay ──────────────────────────────────────────────────────────

interface DrawPoint { x: number; y: number }
interface Drawing   { tool: DrawTool; p1: DrawPoint; p2: DrawPoint }

function renderDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  active: { tool: DrawTool; p1: DrawPoint | null; p2: DrawPoint | null } | null,
  w: number, h: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,200,50,0.85)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([]);
  const all = [...drawings];
  if (active?.p1 && active?.p2) all.push({ tool: active.tool, p1: active.p1, p2: active.p2 });
  for (const d of all) {
    const { tool, p1, p2 } = d;
    ctx.beginPath();
    if (tool === 'trendline') {
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      if (Math.abs(dx) < 1) { ctx.moveTo(p1.x, 0); ctx.lineTo(p1.x, h); }
      else {
        const slope = dy / dx;
        ctx.moveTo(0, p1.y + slope * (0 - p1.x));
        ctx.lineTo(w, p1.y + slope * (w - p1.x));
      }
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.fillStyle = 'rgba(255,200,50,0.06)';
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    } else if (tool === 'fib') {
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const top    = Math.min(p1.y, p2.y), bot = Math.max(p1.y, p2.y);
      const range  = bot - top;
      ctx.setLineDash([4, 4]);
      for (const lvl of levels) {
        const y = bot - lvl * range;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,200,50,0.7)';
        ctx.font      = '9px IBM Plex Mono';
        ctx.fillText(`${(lvl * 100).toFixed(1)}%`, 4, y - 2);
      }
      ctx.setLineDash([]);
    }
  }
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  interval:          Interval;
  chartType:         ChartType;
  indicators:        Set<IndicatorKey>;
  drawTool:          DrawTool;
  onInterval:        (i: Interval) => void;
  onChartType:       (ct: ChartType) => void;
  onToggleIndicator: (k: IndicatorKey) => void;
  onDrawTool:        (dt: DrawTool) => void;
}

const Toolbar = memo(function Toolbar({
  interval, chartType, indicators, drawTool,
  onInterval, onChartType, onToggleIndicator, onDrawTool,
}: ToolbarProps) {
  Toolbar.displayName = 'Toolbar';
  const [indOpen, setIndOpen] = useState(false);
  const indRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!indOpen) return;
    const handler = (e: MouseEvent) => {
      if (indRef.current && !indRef.current.contains(e.target as Node)) setIndOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [indOpen]);

  const btn = (active: boolean): React.CSSProperties => ({
    background:  active ? 'rgba(242,142,44,0.14)' : 'transparent',
    color:       active ? 'rgba(242,142,44,1)'    : 'rgba(255,255,255,0.30)',
    border:      'none', cursor: 'pointer',
    fontFamily:  'IBM Plex Mono, monospace',
    fontSize:    '10px', fontWeight: 700,
    padding:     '3px 7px', borderRadius: '3px',
    letterSpacing: '0.04em', lineHeight: '18px',
    transition:  'all 80ms', flexShrink: 0,
  });

  const sep: React.CSSProperties = {
    width: '1px', height: '14px',
    background: 'rgba(255,255,255,0.07)',
    flexShrink: 0, alignSelf: 'center', margin: '0 4px',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1px',
      padding: '4px 10px',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      background: 'rgba(14,17,26,1)',
      flexShrink: 0, overflowX: 'auto',
      scrollbarWidth: 'none' as const,
      minHeight: '32px', userSelect: 'none' as const,
    }}>
      {/* Interval */}
      {INTERVALS.map((i) => (
        <button key={i} style={btn(interval === i)} onClick={() => onInterval(i)}>
          {i.toUpperCase()}
        </button>
      ))}

      <div style={sep} />

      {/* Candle countdown */}
      <CandleCountdown interval={interval} />

      <div style={sep} />

      {/* Chart type */}
      {CHART_TYPES.map(({ key, icon }) => (
        <button key={key} title={key} style={{ ...btn(chartType === key), fontSize: '13px' }} onClick={() => onChartType(key)}>
          {icon}
        </button>
      ))}

      <div style={sep} />

      {/* Indicators dropdown */}
      <div ref={indRef} style={{ position: 'relative' }}>
        <button
          style={{ ...btn(indicators.size > 0), display: 'flex', alignItems: 'center', gap: '3px' }}
          onClick={() => setIndOpen((v) => !v)}
        >
          <span>fx</span>
          {indicators.size > 0 && (
            <span style={{
              background: 'rgba(242,142,44,0.8)', color: 'rgba(0,0,0,1)',
              borderRadius: '9px', padding: '0 4px', fontSize: '9px', lineHeight: '13px',
            }}>
              {indicators.size}
            </span>
          )}
        </button>
        {indOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            background: 'rgba(18,21,32,0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '5px', zIndex: 999, padding: '4px',
            display: 'flex', flexDirection: 'column', gap: '2px',
            minWidth: '90px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}>
            {INDICATORS.map(({ key, label }) => {
              const on = indicators.has(key);
              return (
                <button
                  key={key}
                  style={{ ...btn(on), textAlign: 'left' as const, fontSize: '11px' }}
                  onClick={() => onToggleIndicator(key)}
                >
                  {on ? '✓ ' : '  '}{label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={sep} />

      {/* Draw tools */}
      {DRAW_TOOLS.map(({ key, icon, tip }) => (
        <button
          key={key} title={tip}
          style={{ ...btn(drawTool === key), fontSize: '14px' }}
          onClick={() => onDrawTool(drawTool === key ? 'none' : key)}
        >
          {icon}
        </button>
      ))}
      {drawTool !== 'none' && (
        <button style={{ ...btn(false), fontSize: '10px' }} onClick={() => onDrawTool('none')}>✕</button>
      )}

      <div style={{ flex: 1 }} />
      <span style={{ fontSize: '8px', fontWeight: 600, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.06em', flexShrink: 0 }}>
        LIGHTWEIGHT
      </span>
    </div>
  );
});

// ─── Main LightweightChart ────────────────────────────────────────────────────

const LightweightChart = memo(function LightweightChart({
  symbol, interval, onIntervalChange, ticker, symbolInfo, exchange = 'bybit', hoveredPrice,
}: LightweightChartProps) {
  LightweightChart.displayName = 'LightweightChart';

  const [chartType,  setChartType]  = useState<ChartType>('candle');
  const [indicators, setIndicators] = useState<Set<IndicatorKey>>(new Set());
  const [drawTool,   setDrawTool]   = useState<DrawTool>('none');

  const containerRef         = useRef<HTMLDivElement>(null);
  const canvasRef            = useRef<HTMLCanvasElement>(null);
  const chartRef             = useRef<IChartApi | null>(null);
  const mainSeriesRef        = useRef<ISeriesApi<'Candlestick' | 'Bar' | 'Line' | 'Area'> | null>(null);
  const indicatorSeriesRefs  = useRef<ISeriesApi<'Line'>[]>([]);
  const hoveredLineRef       = useRef<ISeriesApi<'Line'> | null>(null);
  const mountedRef           = useRef(true);
  const rafRef               = useRef<number>(0);
  const lastBarsHash         = useRef('');
  const rawBarsRef           = useRef<OHLCBar[]>([]);
  const abortRef             = useRef<AbortController | null>(null);

  // drawing refs
  const drawings      = useRef<Drawing[]>([]);
  const activeDrawing = useRef<{ tool: DrawTool; p1: DrawPoint | null; p2: DrawPoint | null }>({ tool: 'none', p1: null, p2: null });
  const isDrawing     = useRef(false);

  // ── chart init
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background:  { color: 'rgba(10,13,20,0)' },
        textColor:   'rgba(255,255,255,0.40)',
        fontFamily:  'IBM Plex Mono, monospace',
        fontSize:    10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair:       { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.05)' },
      timeScale: {
        borderColor:    'rgba(255,255,255,0.05)',
        timeVisible:    true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  // ── hovered price line
  useEffect(() => {
    if (!chartRef.current) return;
    if (hoveredLineRef.current) {
      try { chartRef.current.removeSeries(hoveredLineRef.current); } catch {}
      hoveredLineRef.current = null;
    }
    if (hoveredPrice && rawBarsRef.current.length) {
      const s = chartRef.current.addLineSeries({
        color: 'rgba(255,200,50,0.5)', lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false, lastValueVisible: false,
      });
      const times = rawBarsRef.current.map((b) => b.time);
      s.setData(times.map((t) => ({ time: t, value: hoveredPrice })));
      hoveredLineRef.current = s;
    }
  }, [hoveredPrice]);

  // ── clear indicator series
  const clearIndicators = useCallback(() => {
    if (!chartRef.current) return;
    for (const s of indicatorSeriesRefs.current) try { chartRef.current.removeSeries(s); } catch {}
    indicatorSeriesRefs.current = [];
  }, []);

  // ── apply indicators
  const applyIndicators = useCallback((bars: OHLCBar[], inds: Set<IndicatorKey>) => {
    if (!chartRef.current || bars.length < 30) return;
    clearIndicators();
    const chart = chartRef.current;

    if (inds.has('MA')) {
      const s20 = chart.addLineSeries({ color: 'rgba(100,180,255,0.8)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s20.setData(calcSMA(bars, 20));
      const s50 = chart.addLineSeries({ color: 'rgba(255,160,50,0.8)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s50.setData(calcSMA(bars, 50));
      indicatorSeriesRefs.current.push(s20, s50);
    }
    if (inds.has('BB')) {
      const { upper, lower, mid } = calcBB(bars);
      const sU = chart.addLineSeries({ color: 'rgba(130,100,255,0.6)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: LineStyle.Dashed });
      const sM = chart.addLineSeries({ color: 'rgba(130,100,255,0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const sL = chart.addLineSeries({ color: 'rgba(130,100,255,0.6)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: LineStyle.Dashed });
      sU.setData(upper); sM.setData(mid); sL.setData(lower);
      indicatorSeriesRefs.current.push(sU, sM, sL);
    }
    if (inds.has('RSI')) {
      const rsi = chart.addLineSeries({ color: 'rgba(255,100,150,0.85)', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, priceScaleId: 'rsi' });
      chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderColor: 'rgba(255,255,255,0.06)' });
      rsi.setData(calcRSI(bars));
      indicatorSeriesRefs.current.push(rsi);
    }
    if (inds.has('MACD')) {
      const { macdSeries, signalSeries } = calcMACD(bars);
      const sM = chart.addLineSeries({ color: 'rgba(80,200,255,0.85)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: 'macd' });
      const sS = chart.addLineSeries({ color: 'rgba(255,120,80,0.85)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: 'macd' });
      chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, borderColor: 'rgba(255,255,255,0.06)' });
      sM.setData(macdSeries); sS.setData(signalSeries);
      indicatorSeriesRefs.current.push(sM, sS);
    }
  }, [clearIndicators]);

  // ── build main series
  const buildMainSeries = useCallback(() => {
    if (!chartRef.current) return;
    if (mainSeriesRef.current) { try { chartRef.current.removeSeries(mainSeriesRef.current); } catch {} mainSeriesRef.current = null; }
    const chart = chartRef.current;
    if (chartType === 'candle') {
      mainSeriesRef.current = chart.addCandlestickSeries({
        upColor: 'rgba(38,166,154,1)', downColor: 'rgba(239,83,80,1)',
        borderVisible: false,
        wickUpColor: 'rgba(38,166,154,0.75)', wickDownColor: 'rgba(239,83,80,0.75)',
      });
    } else if (chartType === 'bar') {
      mainSeriesRef.current = chart.addBarSeries({ upColor: 'rgba(38,166,154,1)', downColor: 'rgba(239,83,80,1)' });
    } else if (chartType === 'line') {
      mainSeriesRef.current = chart.addLineSeries({ color: 'rgba(80,160,255,0.9)', lineWidth: 2, priceLineVisible: false });
    } else if (chartType === 'area') {
      mainSeriesRef.current = chart.addAreaSeries({ lineColor: 'rgba(80,160,255,0.9)', topColor: 'rgba(80,160,255,0.25)', bottomColor: 'rgba(80,160,255,0)', lineWidth: 2, priceLineVisible: false });
    }
  }, [chartType]);

  // rebuild series on chart type change, re-feed bars
  useEffect(() => {
    buildMainSeries();
    if (rawBarsRef.current.length && mainSeriesRef.current) {
      const bars = rawBarsRef.current;
      if (chartType === 'line' || chartType === 'area') {
        (mainSeriesRef.current as ISeriesApi<'Line'>).setData(bars.map((b) => ({ time: b.time, value: b.close })));
      } else {
        (mainSeriesRef.current as ISeriesApi<'Candlestick'>).setData(bars as CandlestickData[]);
      }
      clearIndicators();
      applyIndicators(bars, indicators);
    }
  }, [chartType, buildMainSeries, clearIndicators, applyIndicators, indicators]);

  // ── fetch candles (RAF-batched + hash-guarded)
  const fetchCandles = useCallback(async () => {
    if (!mountedRef.current) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      let bars: OHLCBar[] = [];
      const sym = symbol.replace('/', '').replace('-', '').toUpperCase();

      if (exchange === 'bybit' || exchange === 'okx') {
        // prefer Bybit for all (works from CF SG, avoids fapi 403)
        const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${BYBIT_TF[interval]}&limit=300`;
        const res = await fetch(url, { signal: ac.signal });
        const json = await res.json();
        bars = (json?.result?.list ?? []).reverse().map((c: string[]) => ({
          time:   Math.floor(Number(c[0]) / 1000) as UTCTimestamp,
          open:   Number(c[1]), high: Number(c[2]),
          low:    Number(c[3]), close: Number(c[4]),
          volume: Number(c[5]),
        }));
      } else {
        const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${BINANCE_TF[interval]}&limit=300`;
        const res = await fetch(url, { signal: ac.signal });
        const json = await res.json();
        bars = (Array.isArray(json) ? json : []).map((c: unknown[]) => ({
          time:   Math.floor(Number(c[0]) / 1000) as UTCTimestamp,
          open:   Number(c[1]), high: Number(c[2]),
          low:    Number(c[3]), close: Number(c[4]),
          volume: Number(c[5]),
        }));
      }

      if (!mountedRef.current || ac.signal.aborted || !bars.length) return;

      // hash guard — skip identical data
      const newHash = `${bars.length}-${bars[bars.length - 1]?.close}`;
      if (newHash === lastBarsHash.current) return;
      lastBarsHash.current = newHash;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!mountedRef.current || !mainSeriesRef.current) return;
        rawBarsRef.current = bars;
        if (chartType === 'line' || chartType === 'area') {
          (mainSeriesRef.current as ISeriesApi<'Line'>).setData(bars.map((b) => ({ time: b.time, value: b.close })));
        } else {
          (mainSeriesRef.current as ISeriesApi<'Candlestick'>).setData(bars as CandlestickData[]);
        }
        applyIndicators(bars, indicators);
        chartRef.current?.timeScale().fitContent();
      });
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') console.warn('[LightweightChart] fetch err', e);
    }
  }, [symbol, exchange, interval, chartType, indicators, applyIndicators]);

  useEffect(() => { buildMainSeries(); }, [buildMainSeries]);

  useEffect(() => {
    lastBarsHash.current = '';
    fetchCandles();
    const id = setInterval(fetchCandles, interval === '1m' ? 15_000 : 60_000);
    return () => { clearInterval(id); cancelAnimationFrame(rafRef.current); abortRef.current?.abort(); };
  }, [fetchCandles, interval]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);

  // clear drawings on symbol/interval change
  useEffect(() => {
    drawings.current = [];
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [symbol, interval]);

  // ── drawing canvas events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.style.cursor       = drawTool !== 'none' ? 'crosshair' : 'default';
    canvas.style.pointerEvents = drawTool !== 'none' ? 'auto' : 'none';

    const pt = (e: MouseEvent): DrawPoint => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: MouseEvent) => {
      if (drawTool === 'none') return;
      isDrawing.current = true;
      activeDrawing.current = { tool: drawTool, p1: pt(e), p2: pt(e) };
    };
    const onMove = (e: MouseEvent) => {
      if (!isDrawing.current || !activeDrawing.current.p1) return;
      activeDrawing.current.p2 = pt(e);
      renderDrawings(ctx, drawings.current, activeDrawing.current, canvas.width, canvas.height);
    };
    const onUp = (e: MouseEvent) => {
      if (!isDrawing.current || !activeDrawing.current.p1) return;
      isDrawing.current = false;
      drawings.current.push({ tool: drawTool, p1: activeDrawing.current.p1!, p2: pt(e) });
      activeDrawing.current = { tool: drawTool, p1: null, p2: null };
      renderDrawings(ctx, drawings.current, null, canvas.width, canvas.height);
    };
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
    };
  }, [drawTool]);

  // ── indicator toggle
  const handleToggleIndicator = useCallback((k: IndicatorKey) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(10,13,20,1)' }}>
      {/* Mobile stats strip */}
      {ticker && symbolInfo && (
        <div className="mobile-chart-stats">
          <MobileStatsStrip ticker={ticker} symbolInfo={symbolInfo} />
        </div>
      )}

      {/* Compact toolbar */}
      <Toolbar
        interval={interval}
        chartType={chartType}
        indicators={indicators}
        drawTool={drawTool}
        onInterval={onIntervalChange}
        onChartType={setChartType}
        onToggleIndicator={handleToggleIndicator}
        onDrawTool={setDrawTool}
      />

      {/* Chart + drawing canvas stacked */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>

      <style>{`.mobile-chart-stats{display:none}@media(max-width:767px){.mobile-chart-stats{display:block}}`}</style>
    </div>
  );
});

export default LightweightChart;
