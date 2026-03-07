/**
 * LightweightChart.tsx — ZERØ ORDER BOOK v60
 * CHANGE: CandleCountdown pindah dari toolbar → overlay di chart container
 *   nempel di price axis kanan (TradingView style) — stack di bawah price label
 *
 * REPLACES TradingViewChart.tsx (iframe embed + 50+ chunk JS → ERR_INSUFFICIENT_RESOURCES)
 * NEW: TradingView Lightweight Charts v4 — self-contained, 200KB, 60fps, zero external chunks.
 *
 * Features:
 *   - Candlestick + Volume overlay (stacked pane)
 *   - Real-time candle update via Binance @kline WS (direct, no proxy)
 *   - Historical candles from Binance REST (direct, no proxy)
 *   - Interval switcher: 1m / 5m / 15m / 1h / 4h / 1d
 *   - Candle countdown timer
 *   - Crosshair OHLCV legend
 *   - Mobile stats strip (price + 24h high/low/vol)
 *   - Exchange-aware: Bybit/Binance/Coinbase → always fetch candles from Binance REST (public, no auth)
 *   - Auto-reconnect WS with exponential backoff
 *
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓ · mountedRef ✓ · AbortController ✓
 */

import React, {
  useEffect, useRef, useCallback, useState, useMemo, memo,
} from 'react';
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
  type MouseEventParams,
} from 'lightweight-charts';
import type { Interval, TickerData, SymbolInfo } from '@/types/market';
import type { ExchangeId } from '@/hooks/useExchange';
import { formatCompact } from '@/lib/formatters';
import { getReconnectDelay } from '@/lib/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LightweightChartProps {
  symbol:           string;
  interval:         Interval;
  onIntervalChange: (i: Interval) => void;
  ticker?:          TickerData | null;
  symbolInfo?:      SymbolInfo;
  exchange?:        ExchangeId;
}

interface OHLCVLegend {
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  isUp:   boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERVAL_MS: Record<Interval, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '1h':  3_600_000,
  '4h':  14_400_000,
  '1d':  86_400_000,
};

const BINANCE_INTERVAL: Record<Interval, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d',
};

// ── Binance REST fetch — v55: via CF Worker proxy (SG) bypass ISP block ───────
// Worker REST route: /api/v3/klines → https://api.binance.me/api/v3/klines
const PROXY_REST = import.meta.env.VITE_PROXY_URL
  ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';
const PROXY_WS_CHART = import.meta.env.VITE_PROXY_URL
  ? import.meta.env.VITE_PROXY_URL.replace('https://', 'wss://')
  : 'wss://zero-orderbook-proxy.winduadiprabowo.workers.dev';

async function fetchCandles(
  symbol: string,
  interval: Interval,
  signal: AbortSignal,
): Promise<CandlestickData<Time>[]> {
  const sym    = symbol.toUpperCase();
  const params = `?symbol=${sym}&interval=${BINANCE_INTERVAL[interval]}&limit=500`;
  // Primary: CF Worker proxy → binance.me (SG, bypass ISP)
  // Fallback: data-api.binance.vision (CDN mirror)
  let raw: unknown[][];
  try {
    const res = await fetch(`${PROXY_REST}/api/v3/klines${params}`, { signal });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    raw = await res.json() as unknown[][];
  } catch {
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines${params}`, { signal });
    if (!res.ok) throw new Error(`Klines ${res.status}`);
    raw = await res.json() as unknown[][];
  }
  return raw.map((k) => ({
    time:  ((k[0] as number) / 1000) as Time,
    open:  parseFloat(k[1] as string),
    high:  parseFloat(k[2] as string),
    low:   parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
  }));
}

async function fetchVolumes(
  symbol: string,
  interval: Interval,
  signal: AbortSignal,
): Promise<HistogramData<Time>[]> {
  const sym    = symbol.toUpperCase();
  const params = `?symbol=${sym}&interval=${BINANCE_INTERVAL[interval]}&limit=500`;
  let raw: unknown[][];
  try {
    const res = await fetch(`${PROXY_REST}/api/v3/klines${params}`, { signal });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    raw = await res.json() as unknown[][];
  } catch {
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines${params}`, { signal });
    if (!res.ok) throw new Error(`Vol ${res.status}`);
    raw = await res.json() as unknown[][];
  }
  return raw.map((k) => {
    const o = parseFloat(k[1] as string);
    const c = parseFloat(k[4] as string);
    return {
      time:  ((k[0] as number) / 1000) as Time,
      value: parseFloat(k[5] as string),
      color: c >= o ? 'rgba(38,166,154,0.40)' : 'rgba(239,83,80,0.40)',
    };
  });
}

// ── Candle Countdown ──────────────────────────────────────────────────────────

const CandleCountdown: React.FC<{ interval: Interval }> = React.memo(({ interval }) => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const totalMs = INTERVAL_MS[interval];
    const tick = () => {
      const now  = Date.now();
      const rem  = Math.ceil((totalMs - (now % totalMs)) / 1000);
      setRemaining(rem);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [interval]);

  const mm      = Math.floor(remaining / 60).toString().padStart(2, '0');
  const ss      = (remaining % 60).toString().padStart(2, '0');
  const str     = interval === '1d'
    ? Math.floor(remaining / 3600) + 'h ' + Math.floor((remaining % 3600) / 60) + 'm'
    : remaining >= 60 ? mm + ':' + ss : ss + 's';
  const urgent  = remaining <= 10;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      padding: '2px 7px',
      background: urgent ? 'rgba(242,142,44,0.12)' : 'rgba(255,255,255,0.04)',
      border: '1px solid ' + (urgent ? 'rgba(242,142,44,0.35)' : 'rgba(255,255,255,0.07)'),
      borderRadius: '3px', flexShrink: 0,
    }}>
      <span style={{ fontSize: '9px', color: urgent ? 'rgba(242,142,44,0.8)' : 'rgba(255,255,255,0.28)' }}>⏱</span>
      <span className="mono-num" style={{
        fontSize: '10px', fontWeight: 800,
        color: urgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.55)',
        letterSpacing: '0.04em', minWidth: '28px',
      }}>
        {str}
      </span>
    </div>
  );
});
CandleCountdown.displayName = 'CandleCountdown';

// ── Candle Countdown Overlay — TradingView style nempel di price axis ─────────

const CandleCountdownOverlay: React.FC<{ interval: Interval }> = React.memo(({ interval }) => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const totalMs = INTERVAL_MS[interval];
    const tick = () => {
      const now = Date.now();
      const rem = Math.ceil((totalMs - (now % totalMs)) / 1000);
      setRemaining(rem);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [interval]);

  const mm     = Math.floor(remaining / 60).toString().padStart(2, '0');
  const ss     = (remaining % 60).toString().padStart(2, '0');
  const str    = interval === '1d'
    ? Math.floor(remaining / 3600) + 'h ' + Math.floor((remaining % 3600) / 60) + 'm'
    : remaining >= 60 ? mm + ':' + ss : ss + 's';
  const urgent = remaining <= 10;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '52px',
      padding: '3px 8px',
      background: urgent ? 'rgba(242,142,44,0.18)' : 'rgba(9,11,18,0.85)',
      border: '1px solid ' + (urgent ? 'rgba(242,142,44,0.55)' : 'rgba(255,255,255,0.10)'),
      borderRadius: '3px',
      backdropFilter: 'blur(4px)',
    }}>
      <span className="mono-num" style={{
        fontSize: '11px', fontWeight: 800,
        color: urgent ? 'rgba(242,142,44,1)' : 'rgba(255,255,255,0.60)',
        letterSpacing: '0.05em',
        lineHeight: 1,
      }}>
        {str}
      </span>
    </div>
  );
});
CandleCountdownOverlay.displayName = 'CandleCountdownOverlay';

// ── Mobile Stats Strip ────────────────────────────────────────────────────────

const MobileStatsStrip: React.FC<{
  ticker:     TickerData;
  symbolInfo: SymbolInfo;
}> = React.memo(({ ticker, symbolInfo }) => {
  const isUp       = ticker.priceChangePercent >= 0;
  const priceColor = isUp ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  const changeBg   = isUp ? 'rgba(38,166,154,0.12)' : 'rgba(239,83,80,0.12)';
  const dec        = Math.min(symbolInfo.priceDec ?? 2, 6);

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
          background: changeBg, color: priceColor,
        }}>
          {changeStr}
        </span>
      </div>
      <div style={{
        display: 'flex', gap: '0',
        borderTop: '1px solid rgba(255,255,255,0.045)',
        paddingTop: '5px',
      }}>
        {[
          { label: '24h High', value: highStr, color: 'rgba(38,166,154,0.85)' },
          { label: '24h Low',  value: lowStr,  color: 'rgba(239,83,80,0.85)' },
          { label: 'Volume($)', value: volStr, color: 'rgba(255,255,255,0.65)' },
        ].map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 12px', alignSelf: 'stretch' }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '8.5px', fontWeight: 600, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.05em' }}>
                {s.label}
              </span>
              <span className="mono-num" style={{ fontSize: '11px', fontWeight: 700, color: s.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.value}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
});
MobileStatsStrip.displayName = 'MobileStatsStrip';

// ── OHLCV Legend ──────────────────────────────────────────────────────────────

const OHLCVLegend: React.FC<{ legend: OHLCVLegend | null; dec: number }> = React.memo(({ legend, dec }) => {
  if (!legend) return null;
  const c = legend.isUp ? 'rgba(38,166,154,1)' : 'rgba(239,83,80,1)';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (
    <div style={{
      display: 'flex', gap: '10px', alignItems: 'center',
      padding: '0 10px', flexShrink: 0, flexWrap: 'wrap',
    }}>
      {[
        { label: 'O', value: fmt(legend.open) },
        { label: 'H', value: fmt(legend.high),  color: 'rgba(38,166,154,1)' },
        { label: 'L', value: fmt(legend.low),   color: 'rgba(239,83,80,1)' },
        { label: 'C', value: fmt(legend.close), color: c },
        { label: 'V', value: formatCompact(legend.volume).replace('$', '') },
      ].map((item) => (
        <span key={item.label} className="mono-num" style={{ fontSize: '9.5px', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'rgba(255,255,255,0.28)', marginRight: '2px' }}>{item.label}</span>
          <span style={{ color: item.color ?? 'rgba(255,255,255,0.72)', fontWeight: 700 }}>{item.value}</span>
        </span>
      ))}
    </div>
  );
});
OHLCVLegend.displayName = 'OHLCVLegend';

// ── WS Status Dot ─────────────────────────────────────────────────────────────

const WsStatusDot: React.FC<{ connected: boolean }> = React.memo(({ connected }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
    <div style={{
      width: '5px', height: '5px', borderRadius: '50%',
      background: connected ? 'rgba(38,166,154,1)' : 'rgba(242,142,44,1)',
    }} className={connected ? 'live-dot' : undefined} />
    <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', color: connected ? 'rgba(38,166,154,1)' : 'rgba(242,142,44,1)' }}>
      {connected ? 'LIVE' : 'SYNC'}
    </span>
  </div>
));
WsStatusDot.displayName = 'WsStatusDot';

// ── Main Chart ────────────────────────────────────────────────────────────────

const LightweightChart: React.FC<LightweightChartProps> = memo(({
  symbol, interval, onIntervalChange, ticker, symbolInfo, exchange = 'bybit',
}) => {
  const containerRef   = useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const candleSerRef   = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSerRef      = useRef<ISeriesApi<'Histogram'> | null>(null);
  const mountedRef     = useRef(true);
  const wsRef          = useRef<WebSocket | null>(null);
  const retryRef       = useRef<ReturnType<typeof setTimeout>>();
  const attemptRef     = useRef(0);
  // v55d: store all candles so we can compute visible price range on zoom
  const candlesRef     = useRef<CandlestickData<Time>[]>([]);
  const [legend,     setLegend]     = useState<OHLCVLegend | null>(null);
  const [wsLive,     setWsLive]     = useState(false);
  const [chartReady, setChartReady] = useState(false);

  const dec = useMemo(() => Math.min(symbolInfo?.priceDec ?? 2, 6), [symbolInfo?.priceDec]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hiddenRef = useRef(false);

  // ── v50: Visibility throttle — pause render when tab hidden ─────────────────
  useEffect(() => {
    const onVis = () => {
      hiddenRef.current = document.hidden;
      if (!document.hidden && chartRef.current && containerRef.current) {
        const el = containerRef.current;
        chartRef.current.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ── Create chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background:   { color: 'rgba(10,13,20,1)' },
        textColor:    'rgba(255,255,255,0.40)',
        fontFamily:   "'IBM Plex Mono', monospace",
        fontSize:     11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.20)', labelBackgroundColor: 'rgba(16,19,28,1)' },
        horzLine: { color: 'rgba(255,255,255,0.20)', labelBackgroundColor: 'rgba(16,19,28,1)' },
      },
      rightPriceScale: {
        borderColor:    'rgba(255,255,255,0.06)',
        textColor:      'rgba(255,255,255,0.35)',
        scaleMargins:   { top: 0.04, bottom: 0.18 },
        autoScale:      true,
        // v55d: mode Normal = price axis follows visible candles
        mode:           0, // PriceScaleMode.Normal
      },
      timeScale: {
        borderColor:      'rgba(255,255,255,0.06)',
        timeVisible:      true,
        secondsVisible:   false,
        fixLeftEdge:      false,
        fixRightEdge:     false,
        // v55d: right offset so latest candle not stuck to edge
        rightOffset:      5,
        barSpacing:       8,
        minBarSpacing:    2,
      },
      // v55d: proper zoom/scroll for desktop + mobile
      handleScroll: {
        mouseWheel:       true,
        pressedMouseMove: true,
        horzTouchDrag:    true,
        vertTouchDrag:    true,  // v59: true = drag vertikal di chart zoom price axis
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel:           true,
        pinch:                true,  // mobile pinch-to-zoom
      },
    });

    // Candlestick series
    const candleSer = chart.addCandlestickSeries({
      upColor:            'rgba(0,255,157,1)',
      downColor:          'rgba(255,59,92,1)',
      borderUpColor:      'rgba(0,255,157,1)',
      borderDownColor:    'rgba(255,59,92,1)',
      wickUpColor:        'rgba(0,255,157,0.65)',
      wickDownColor:      'rgba(255,59,92,0.65)',
      priceLineVisible:   true,
      priceLineColor:     'rgba(255,255,255,0.15)',
      priceLineWidth:     1,
      lastValueVisible:   true,
    });

    // Volume histogram — separate price scale
    const volSer = chart.addHistogramSeries({
      color:            'rgba(38,166,154,0.35)',
      priceFormat:      { type: 'volume' },
      priceScaleId:     'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Crosshair legend
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!mountedRef.current) return;
      const c = param.seriesData.get(candleSer) as CandlestickData<Time> | undefined;
      const v = param.seriesData.get(volSer)    as HistogramData<Time>   | undefined;
      if (c) {
        setLegend({
          open: c.open, high: c.high, low: c.low, close: c.close,
          volume: v?.value ?? 0,
          isUp: c.close >= c.open,
        });
      } else {
        setLegend(null);
      }
    });

    // v59c: click/tap on price axis → reset Y zoom (autoScale candles)
    // Works on desktop (click) + mobile (tap on right price scale area)
    const resetPriceScale = () => {
      if (!mountedRef.current) return;
      candleSer.priceScale().applyOptions({ autoScale: true });
      chart.applyOptions({ rightPriceScale: { autoScale: true } });
    };

    // Native DOM: click on price axis area (right side of chart container)
    const handleAxisClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      // Lightweight Charts renders price axis in a canvas — check if click is in right price scale area
      const rect = el.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      const rightScaleWidth = 70; // approx price axis width
      if (clientX >= rect.right - rightScaleWidth) {
        resetPriceScale();
      }
    };

    // Double-click/tap anywhere on chart = fit all + reset Y
    const handleDblClick = () => {
      if (!mountedRef.current) return;
      chart.timeScale().fitContent();
      resetPriceScale();
    };

    el.addEventListener('click', handleAxisClick);
    el.addEventListener('touchend', handleAxisClick as EventListener);
    el.addEventListener('dblclick', handleDblClick);

    // Auto-resize
    const ro = new ResizeObserver(() => {
      if (el && chart) {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }
    });
    ro.observe(el);

    chartRef.current     = chart;
    candleSerRef.current = candleSer;
    volSerRef.current    = volSer;
    setChartReady(true);

    return () => {
      el.removeEventListener('click', handleAxisClick);
      el.removeEventListener('touchend', handleAxisClick as EventListener);
      el.removeEventListener('dblclick', handleDblClick);
      ro.disconnect();
      chart.remove();
      chartRef.current     = null;
      candleSerRef.current = null;
      volSerRef.current    = null;
      setChartReady(false);
    };
  }, []); // create once only

  // ── Load historical candles ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady) return;
    const ac = new AbortController();

    (async () => {
      try {
        const [candles, volumes] = await Promise.all([
          fetchCandles(symbol, interval, ac.signal),
          fetchVolumes(symbol, interval, ac.signal),
        ]);
        if (!mountedRef.current || ac.signal.aborted) return;
        candlesRef.current = candles; // store for visible range calc
        candleSerRef.current?.setData(candles);
        volSerRef.current?.setData(volumes);
        chartRef.current?.timeScale().fitContent();
      } catch {
        // aborted or network error — silently ignore, WS will update
      }
    })();

    return () => ac.abort();
  }, [symbol, interval, chartReady]);

  // ── Real-time kline WS (Binance direct — public, no auth, no proxy) ─────────
  const connectKlineWs = useCallback(() => {
    if (!mountedRef.current) return;
    const sym = symbol.toLowerCase();
    const iv  = BINANCE_INTERVAL[interval];
    // v55: kline WS via CF Worker proxy /ws/ route
    const url = `${PROXY_WS_CHART}/ws/${sym}@kline_${iv}`;

    setWsLive(false);
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        attemptRef.current = 0;
        setWsLive(true);
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;
        if (hiddenRef.current) return; // v50: skip render when tab hidden
        try {
          const d = JSON.parse(ev.data as string) as {
            k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean };
          };
          if (!d.k) return;
          const k = d.k;
          const candle: CandlestickData<Time> = {
            time:  (k.t / 1000) as Time,
            open:  parseFloat(k.o),
            high:  parseFloat(k.h),
            low:   parseFloat(k.l),
            close: parseFloat(k.c),
          };
          const vol: HistogramData<Time> = {
            time:  (k.t / 1000) as Time,
            value: parseFloat(k.v),
            color: parseFloat(k.c) >= parseFloat(k.o)
              ? 'rgba(0,255,157,0.35)'
              : 'rgba(255,59,92,0.35)',
          };
          candleSerRef.current?.update(candle);
          // v57: update priceLineColor dynamically — green if up, red if down
          const lineColor = parseFloat(k.c) >= parseFloat(k.o)
            ? 'rgba(0,255,157,1)'
            : 'rgba(255,59,92,1)';
          candleSerRef.current?.applyOptions({ priceLineColor: lineColor });
          volSerRef.current?.update(vol);
          // keep candlesRef in sync for visible range calculation
          const arr = candlesRef.current;
          if (arr.length && (arr[arr.length - 1].time as number) === (candle.time as number)) {
            arr[arr.length - 1] = candle; // update last candle
          } else if (arr.length) {
            arr.push(candle); // new candle
          }
        } catch { /* malformed */ }
      };

      ws.onclose = () => {
        setWsLive(false);
        if (!mountedRef.current) return;
        retryRef.current = setTimeout(() => {
          attemptRef.current++;
          connectKlineWs();
        }, getReconnectDelay(attemptRef.current));
      };

      ws.onerror = () => ws.close();
    } catch {
      retryRef.current = setTimeout(() => {
        attemptRef.current++;
        connectKlineWs();
      }, getReconnectDelay(attemptRef.current));
    }
  }, [symbol, interval]);

  useEffect(() => {
    if (!chartReady) return;
    mountedRef.current = true;
    attemptRef.current = 0;
    connectKlineWs();

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, interval, chartReady, connectKlineWs]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <div
      className={isFullscreen ? 'chart-fullscreen' : undefined}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: 'rgba(10,13,20,1)',
        position: isFullscreen ? 'fixed' : 'relative',
      }}
    >
      {/* v48: Fullscreen close button */}
      {isFullscreen && (
        <button
          className="chart-fullscreen-btn"
          onClick={() => setIsFullscreen(false)}
          aria-label="Exit fullscreen"
        >
          ✕ EXIT
        </button>
      )}
      {/* Mobile stats strip */}
      {ticker && symbolInfo && (
        <div className="mobile-chart-stats">
          <MobileStatsStrip ticker={ticker} symbolInfo={symbolInfo} />
        </div>
      )}

      {/* Toolbar: interval + countdown + legend + status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '4px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        background: 'rgba(14,17,26,1)',
        flexShrink: 0,
        overflowX: 'auto',
        minHeight: '34px',
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

        {/* OHLCV crosshair legend */}
        <OHLCVLegend legend={legend} dec={dec} />

        <div style={{ flex: 1 }} />
        <WsStatusDot connected={wsLive} />
        <button
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen chart'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '2px 6px', borderRadius: '3px',
            color: 'rgba(255,255,255,0.25)', fontSize: '11px',
            fontFamily: 'inherit', flexShrink: 0,
            transition: 'color 100ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; }}
          aria-label="Toggle fullscreen"
        >
          {isFullscreen ? '⊡' : '⊞'}
        </button>
        <span style={{ fontSize: '7.5px', fontWeight: 600, color: 'rgba(255,255,255,0.10)', letterSpacing: '0.06em', flexShrink: 0, marginLeft: '8px' }}>
          LIGHTWEIGHT
        </span>
      </div>

      {/* Chart container + countdown overlay */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {/* v60: Countdown overlay — TradingView style, nempel di price axis kanan */}
        <div style={{
          position: 'absolute',
          // right ~65px = approximate width of price axis
          right: 0,
          bottom: '28px', // above time axis
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <CandleCountdownOverlay interval={interval} />
        </div>
      </div>

      <style>{`
        .mobile-chart-stats { display: none; }
        @media (max-width: 767px) {
          .mobile-chart-stats { display: block; }
        }
      `}</style>
    </div>
  );
});

LightweightChart.displayName = 'LightweightChart';
export default LightweightChart;
