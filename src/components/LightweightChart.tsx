// LightweightChart.tsx — v82
// Changes:
//  - Compact top toolbar: timeframe + chart type + indicators + drawing tools
//  - RAF-batched chart updates (skip if data unchanged)
//  - Memoized series update (only update if new candle differs)
//  - Drawing tools overlay (trendline, fib, rect) via canvas
//  - Indicators rendered as lightweight-charts price/pane series

import React, {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
  memo,
} from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  UTCTimestamp,
  CrosshairMode,
  LineStyle,
  SeriesType,
} from "lightweight-charts";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TF = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type ChartType = "candle" | "line" | "bar" | "area";
export type IndicatorKey = "MA" | "RSI" | "MACD" | "BB";
export type DrawTool = "none" | "trendline" | "fib" | "rect";

interface OHLCBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface LightweightChartProps {
  symbol: string;
  exchange?: "binance" | "bybit" | "okx";
  height?: number;
  onTimeframeChange?: (tf: TF) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEFRAMES: TF[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const CHART_TYPES: { key: ChartType; icon: string }[] = [
  { key: "candle", icon: "◫" },
  { key: "line",   icon: "∿" },
  { key: "bar",    icon: "⦀" },
  { key: "area",   icon: "◭" },
];

const INDICATORS: { key: IndicatorKey; label: string }[] = [
  { key: "MA",   label: "MA" },
  { key: "BB",   label: "BB" },
  { key: "RSI",  label: "RSI" },
  { key: "MACD", label: "MACD" },
];

const DRAW_TOOLS: { key: DrawTool; icon: string; tip: string }[] = [
  { key: "trendline", icon: "╱", tip: "Trendline" },
  { key: "fib",       icon: "≡", tip: "Fibonacci" },
  { key: "rect",      icon: "▭", tip: "Rectangle" },
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcSMA(data: OHLCBar[], period: number): LineData[] {
  const out: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, b) => s + b.close, 0) / period;
    out.push({ time: data[i].time, value: avg });
  }
  return out;
}

function calcBB(data: OHLCBar[], period = 20, mult = 2) {
  const upper: LineData[] = [];
  const lower: LineData[] = [];
  const mid: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, b) => s + b.close, 0) / period;
    const variance = slice.reduce((s, b) => s + (b.close - avg) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
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
    const d = data[i].close - data[i - 1].close;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out.push({ time: data[i].time, value: 100 - 100 / (1 + avgG / (avgL || 1)) });
  }
  return out;
}

function calcMACD(data: OHLCBar[], fast = 12, slow = 26, signal = 9) {
  const ema = (arr: number[], p: number) => {
    const k = 2 / (p + 1);
    const result: number[] = [arr[0]];
    for (let i = 1; i < arr.length; i++)
      result.push(arr[i] * k + result[i - 1] * (1 - k));
    return result;
  };
  const closes = data.map((b) => b.close);
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = fastEma.map((v, i) => v - slowEma[i]);
  const signalLine = ema(macdLine.slice(slow - 1), signal);
  const macdSeries: LineData[] = [];
  const signalSeries: LineData[] = [];
  const histSeries: LineData[] = [];
  const offset = slow - 1;
  signalLine.forEach((sv, i) => {
    const idx = offset + signal - 1 + i;
    if (idx >= data.length) return;
    const mv = macdLine[offset + signal - 1 + i];
    macdSeries.push({ time: data[idx].time, value: mv });
    signalSeries.push({ time: data[idx].time, value: sv });
    histSeries.push({ time: data[idx].time, value: mv - sv });
  });
  return { macdSeries, signalSeries, histSeries };
}

// ─── Drawing overlay ──────────────────────────────────────────────────────────

interface DrawPoint { x: number; y: number }
interface Drawing {
  tool: DrawTool;
  p1: DrawPoint;
  p2: DrawPoint;
}

function renderDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  active: { tool: DrawTool; p1: DrawPoint | null; p2: DrawPoint | null } | null,
  w: number,
  h: number
) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 200, 50, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);

  const drawAll = [...drawings];
  if (active?.p1 && active?.p2) {
    drawAll.push({ tool: active.tool, p1: active.p1, p2: active.p2 });
  }

  for (const d of drawAll) {
    const { tool, p1, p2 } = d;
    ctx.beginPath();
    if (tool === "trendline") {
      // extend line across canvas
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      if (Math.abs(dx) < 1) { ctx.moveTo(p1.x, 0); ctx.lineTo(p1.x, h); }
      else {
        const slope = dy / dx;
        const x0 = 0;
        const y0 = p1.y + slope * (x0 - p1.x);
        const x1 = w;
        const y1 = p1.y + slope * (x1 - p1.x);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    } else if (tool === "rect") {
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.fillStyle = "rgba(255, 200, 50, 0.06)";
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    } else if (tool === "fib") {
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const top = Math.min(p1.y, p2.y);
      const bot = Math.max(p1.y, p2.y);
      const range = bot - top;
      ctx.setLineDash([4, 4]);
      for (const lvl of levels) {
        const y = bot - lvl * range;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 200, 50, 0.7)";
        ctx.font = "9px IBM Plex Mono";
        ctx.fillText(`${(lvl * 100).toFixed(1)}%`, 4, y - 2);
      }
      ctx.setLineDash([]);
    }
  }
}

// ─── Toolbar component ────────────────────────────────────────────────────────

interface ToolbarProps {
  tf: TF;
  chartType: ChartType;
  indicators: Set<IndicatorKey>;
  drawTool: DrawTool;
  onTF: (tf: TF) => void;
  onChartType: (ct: ChartType) => void;
  onToggleIndicator: (k: IndicatorKey) => void;
  onDrawTool: (dt: DrawTool) => void;
}

const Toolbar = memo(function Toolbar({
  tf, chartType, indicators, drawTool,
  onTF, onChartType, onToggleIndicator, onDrawTool,
}: ToolbarProps) {
  Toolbar.displayName = "Toolbar";
  const [indOpen, setIndOpen] = useState(false);
  const indRef = useRef<HTMLDivElement>(null);

  // close dropdown on outside click
  useEffect(() => {
    if (!indOpen) return;
    const handler = (e: MouseEvent) => {
      if (indRef.current && !indRef.current.contains(e.target as Node)) {
        setIndOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [indOpen]);

  const btnBase: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "3px",
    lineHeight: "18px",
    transition: "background 0.15s, color 0.15s",
  };

  const active: React.CSSProperties = {
    background: "rgba(255,200,50,0.15)",
    color: "rgba(255,200,50,1)",
  };

  const inactive: React.CSSProperties = {
    color: "rgba(180,180,180,0.7)",
  };

  const sep: React.CSSProperties = {
    width: "1px",
    height: "14px",
    background: "rgba(255,255,255,0.1)",
    flexShrink: 0,
    alignSelf: "center",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "3px 8px",
        background: "rgba(12,12,16,0.95)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        overflowX: "auto",
        flexWrap: "nowrap",
        scrollbarWidth: "none",
        minHeight: "28px",
        userSelect: "none",
      }}
    >
      {/* Timeframes */}
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          style={{ ...btnBase, ...(tf === t ? active : inactive) }}
          onClick={() => onTF(t)}
        >
          {t}
        </button>
      ))}

      <div style={sep} />

      {/* Chart type */}
      {CHART_TYPES.map(({ key, icon }) => (
        <button
          key={key}
          title={key}
          style={{ ...btnBase, fontSize: "12px", ...(chartType === key ? active : inactive) }}
          onClick={() => onChartType(key)}
        >
          {icon}
        </button>
      ))}

      <div style={sep} />

      {/* Indicators dropdown */}
      <div ref={indRef} style={{ position: "relative" }}>
        <button
          style={{
            ...btnBase,
            ...(indicators.size > 0 ? active : inactive),
            display: "flex",
            alignItems: "center",
            gap: "3px",
          }}
          onClick={() => setIndOpen((v) => !v)}
        >
          <span>fx</span>
          {indicators.size > 0 && (
            <span
              style={{
                background: "rgba(255,200,50,0.8)",
                color: "#000",
                borderRadius: "9px",
                padding: "0 4px",
                fontSize: "9px",
                lineHeight: "13px",
              }}
            >
              {indicators.size}
            </span>
          )}
        </button>

        {indOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              background: "rgba(18,18,24,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "5px",
              zIndex: 999,
              padding: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              minWidth: "90px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
            }}
          >
            {INDICATORS.map(({ key, label }) => {
              const on = indicators.has(key);
              return (
                <button
                  key={key}
                  style={{
                    ...btnBase,
                    textAlign: "left",
                    fontSize: "11px",
                    ...(on ? active : inactive),
                  }}
                  onClick={() => onToggleIndicator(key)}
                >
                  {on ? "✓ " : "  "}{label}
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
          key={key}
          title={tip}
          style={{
            ...btnBase,
            fontSize: "13px",
            ...(drawTool === key ? active : inactive),
          }}
          onClick={() => onDrawTool(drawTool === key ? "none" : key)}
        >
          {icon}
        </button>
      ))}

      {/* Clear drawings shortcut */}
      {drawTool !== "none" && (
        <button
          title="Cancel drawing"
          style={{ ...btnBase, ...inactive, fontSize: "10px" }}
          onClick={() => onDrawTool("none")}
        >
          ✕
        </button>
      )}
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

const LightweightChart = memo(function LightweightChart({
  symbol,
  exchange = "bybit",
  height = 400,
  onTimeframeChange,
}: LightweightChartProps) {
  LightweightChart.displayName = "LightweightChart";

  // ── state
  const [tf, setTF] = useState<TF>("15m");
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [indicators, setIndicators] = useState<Set<IndicatorKey>>(new Set());
  const [drawTool, setDrawTool] = useState<DrawTool>("none");

  // ── refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const indicatorSeriesRefs = useRef<ISeriesApi<SeriesType>[]>([]);
  const mountedRef = useRef(true);
  const rafRef = useRef<number>(0);
  const lastBarsHash = useRef<string>("");
  const rawBarsRef = useRef<OHLCBar[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // drawing state
  const drawings = useRef<Drawing[]>([]);
  const activeDrawing = useRef<{ tool: DrawTool; p1: DrawPoint | null; p2: DrawPoint | null }>({
    tool: "none", p1: null, p2: null,
  });
  const isDrawing = useRef(false);

  // ── chart init
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: "rgba(10,10,14,0)" },
        textColor: "rgba(180,180,190,0.85)",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, height);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  // ── clear indicator series helper
  const clearIndicatorSeries = useCallback(() => {
    if (!chartRef.current) return;
    for (const s of indicatorSeriesRefs.current) {
      try { chartRef.current.removeSeries(s); } catch {}
    }
    indicatorSeriesRefs.current = [];
  }, []);

  // ── apply indicators
  const applyIndicators = useCallback((bars: OHLCBar[], inds: Set<IndicatorKey>) => {
    if (!chartRef.current || bars.length < 30) return;
    clearIndicatorSeries();
    const chart = chartRef.current;

    for (const ind of inds) {
      if (ind === "MA") {
        const s20 = chart.addLineSeries({
          color: "rgba(100,180,255,0.8)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false,
        });
        s20.setData(calcSMA(bars, 20));
        const s50 = chart.addLineSeries({
          color: "rgba(255,160,50,0.8)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false,
        });
        s50.setData(calcSMA(bars, 50));
        indicatorSeriesRefs.current.push(s20, s50);
      }

      if (ind === "BB") {
        const { upper, lower, mid } = calcBB(bars);
        const sU = chart.addLineSeries({
          color: "rgba(130,100,255,0.6)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, lineStyle: LineStyle.Dashed,
        });
        const sM = chart.addLineSeries({
          color: "rgba(130,100,255,0.4)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false,
        });
        const sL = chart.addLineSeries({
          color: "rgba(130,100,255,0.6)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, lineStyle: LineStyle.Dashed,
        });
        sU.setData(upper); sM.setData(mid); sL.setData(lower);
        indicatorSeriesRefs.current.push(sU, sM, sL);
      }

      if (ind === "RSI") {
        const rsiPane = chart.addLineSeries({
          color: "rgba(255,100,150,0.85)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: true,
          priceScaleId: "rsi",
        });
        chart.priceScale("rsi").applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
          borderColor: "rgba(255,255,255,0.06)",
        });
        rsiPane.setData(calcRSI(bars));
        indicatorSeriesRefs.current.push(rsiPane);
      }

      if (ind === "MACD") {
        const { macdSeries, signalSeries, histSeries } = calcMACD(bars);
        const sM = chart.addLineSeries({
          color: "rgba(80,200,255,0.85)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false,
          priceScaleId: "macd",
        });
        const sS = chart.addLineSeries({
          color: "rgba(255,120,80,0.85)", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false,
          priceScaleId: "macd",
        });
        chart.priceScale("macd").applyOptions({
          scaleMargins: { top: 0.75, bottom: 0 },
          borderColor: "rgba(255,255,255,0.06)",
        });
        sM.setData(macdSeries); sS.setData(signalSeries);
        indicatorSeriesRefs.current.push(sM, sS);
        void histSeries; // histogram todo — needs HistogramSeries
      }
    }
  }, [clearIndicatorSeries]);

  // ── rebuild main series on chartType change
  const buildMainSeries = useCallback(() => {
    if (!chartRef.current) return;
    if (mainSeriesRef.current) {
      try { chartRef.current.removeSeries(mainSeriesRef.current); } catch {}
      mainSeriesRef.current = null;
    }
    const chart = chartRef.current;
    if (chartType === "candle") {
      mainSeriesRef.current = chart.addCandlestickSeries({
        upColor: "rgba(0,220,110,0.9)",
        downColor: "rgba(230,50,80,0.9)",
        borderVisible: false,
        wickUpColor: "rgba(0,220,110,0.6)",
        wickDownColor: "rgba(230,50,80,0.6)",
      });
    } else if (chartType === "bar") {
      mainSeriesRef.current = chart.addBarSeries({
        upColor: "rgba(0,220,110,0.9)",
        downColor: "rgba(230,50,80,0.9)",
      });
    } else if (chartType === "line") {
      mainSeriesRef.current = chart.addLineSeries({
        color: "rgba(80,160,255,0.9)",
        lineWidth: 2,
        priceLineVisible: false,
      });
    } else if (chartType === "area") {
      mainSeriesRef.current = chart.addAreaSeries({
        lineColor: "rgba(80,160,255,0.9)",
        topColor: "rgba(80,160,255,0.25)",
        bottomColor: "rgba(80,160,255,0.0)",
        lineWidth: 2,
        priceLineVisible: false,
      });
    }
  }, [chartType]);

  useEffect(() => {
    buildMainSeries();
    // re-apply bars if we have them
    if (rawBarsRef.current.length && mainSeriesRef.current) {
      const bars = rawBarsRef.current;
      if (chartType === "line" || chartType === "area") {
        (mainSeriesRef.current as ISeriesApi<"Line">).setData(
          bars.map((b) => ({ time: b.time, value: b.close }))
        );
      } else {
        (mainSeriesRef.current as ISeriesApi<"Candlestick">).setData(bars as CandlestickData[]);
      }
      clearIndicatorSeries();
      applyIndicators(bars, indicators);
    }
  }, [chartType, buildMainSeries, clearIndicatorSeries, applyIndicators, indicators]);

  // ── fetch candles
  const fetchCandles = useCallback(async () => {
    if (!mountedRef.current) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      let bars: OHLCBar[] = [];
      const tfMap: Record<TF, string> = {
        "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D",
      };
      const binanceTF: Record<TF, string> = {
        "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
      };

      if (exchange === "bybit") {
        const sym = symbol.replace("/", "").replace("-", "");
        const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${tfMap[tf]}&limit=300`;
        const res = await fetch(url, { signal: ac.signal });
        const json = await res.json();
        bars = (json?.result?.list ?? [])
          .reverse()
          .map((c: string[]) => ({
            time: Math.floor(Number(c[0]) / 1000) as UTCTimestamp,
            open: Number(c[1]),
            high: Number(c[2]),
            low: Number(c[3]),
            close: Number(c[4]),
            volume: Number(c[5]),
          }));
      } else if (exchange === "binance") {
        const sym = symbol.replace("/", "").replace("-", "").toUpperCase();
        const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${binanceTF[tf]}&limit=300`;
        const res = await fetch(url, { signal: ac.signal });
        const json = await res.json();
        bars = (Array.isArray(json) ? json : []).map((c: unknown[]) => ({
          time: Math.floor(Number(c[0]) / 1000) as UTCTimestamp,
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
          volume: Number(c[5]),
        }));
      } else if (exchange === "okx") {
        const sym = symbol.includes("-") ? symbol : `${symbol.slice(0, -4)}-${symbol.slice(-4)}`;
        const url = `https://www.okx.com/api/v5/market/candles?instId=${sym}&bar=${tfMap[tf]}&limit=300`;
        const res = await fetch(url, { signal: ac.signal });
        const json = await res.json();
        bars = (json?.data ?? [])
          .reverse()
          .map((c: string[]) => ({
            time: Math.floor(Number(c[0]) / 1000) as UTCTimestamp,
            open: Number(c[1]),
            high: Number(c[2]),
            low: Number(c[3]),
            close: Number(c[4]),
            volume: Number(c[5]),
          }));
      }

      if (!mountedRef.current || ac.signal.aborted || !bars.length) return;

      // ── RAF-batched + hash-guarded update
      const newHash = `${bars.length}-${bars[bars.length - 1]?.close}`;
      if (newHash === lastBarsHash.current) return;
      lastBarsHash.current = newHash;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!mountedRef.current || !mainSeriesRef.current) return;
        rawBarsRef.current = bars;

        if (chartType === "line" || chartType === "area") {
          (mainSeriesRef.current as ISeriesApi<"Line">).setData(
            bars.map((b) => ({ time: b.time, value: b.close }))
          );
        } else {
          (mainSeriesRef.current as ISeriesApi<"Candlestick">).setData(bars as CandlestickData[]);
        }
        applyIndicators(bars, indicators);
        chartRef.current?.timeScale().fitContent();
      });
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") console.warn("[LightweightChart] fetch err", e);
    }
  }, [symbol, exchange, tf, chartType, indicators, applyIndicators]);

  useEffect(() => {
    buildMainSeries();
  }, [buildMainSeries]);

  useEffect(() => {
    fetchCandles();
    const interval = setInterval(fetchCandles, tf === "1m" ? 15_000 : 60_000);
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafRef.current);
      abortRef.current?.abort();
    };
  }, [fetchCandles]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // ── indicator toggle
  const handleToggleIndicator = useCallback((k: IndicatorKey) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  // ── TF change
  const handleTF = useCallback((t: TF) => {
    setTF(t);
    lastBarsHash.current = "";
    onTimeframeChange?.(t);
  }, [onTimeframeChange]);

  // ── drawing canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    canvas.width = parent.clientWidth;
    canvas.height = height;
  }, [height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.style.cursor = drawTool !== "none" ? "crosshair" : "default";
    canvas.style.pointerEvents = drawTool !== "none" ? "auto" : "none";

    const getPoint = (e: MouseEvent): DrawPoint => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: MouseEvent) => {
      if (drawTool === "none") return;
      isDrawing.current = true;
      const p = getPoint(e);
      activeDrawing.current = { tool: drawTool, p1: p, p2: p };
    };

    const onMove = (e: MouseEvent) => {
      if (!isDrawing.current || !activeDrawing.current.p1) return;
      activeDrawing.current.p2 = getPoint(e);
      renderDrawings(ctx, drawings.current, activeDrawing.current, canvas.width, canvas.height);
    };

    const onUp = (e: MouseEvent) => {
      if (!isDrawing.current || !activeDrawing.current.p1) return;
      isDrawing.current = false;
      const p2 = getPoint(e);
      drawings.current.push({ tool: drawTool, p1: activeDrawing.current.p1!, p2 });
      activeDrawing.current = { tool: drawTool, p1: null, p2: null };
      renderDrawings(ctx, drawings.current, null, canvas.width, canvas.height);
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
    };
  }, [drawTool]);

  // clear drawings when symbol or tf changes
  useEffect(() => {
    drawings.current = [];
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [symbol, tf]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", background: "rgba(10,10,14,1)" }}>
      <Toolbar
        tf={tf}
        chartType={chartType}
        indicators={indicators}
        drawTool={drawTool}
        onTF={handleTF}
        onChartType={setChartType}
        onToggleIndicator={handleToggleIndicator}
        onDrawTool={setDrawTool}
      />

      {/* chart + drawing canvas stacked */}
      <div style={{ position: "relative", width: "100%", height }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
});

export default LightweightChart;
