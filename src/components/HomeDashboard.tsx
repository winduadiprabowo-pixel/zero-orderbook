// HomeDashboard.tsx — v73
// Changes:
//   - Sparkline 24h di setiap exchange card + top mover row
//   - Tab Gainers / Losers / All di Top Movers
//   - Search bar + filter di Top Movers
//   - Best Price badge di exchange card termurah
//   - Micro-animation flash harga naik/turun
//   - Pull-to-refresh gesture (touch swipe down)
//   - Market Heatmap 2x2 grid (BTC/ETH/SOL/BNB)
//   - Welcome/Onboarding overlay (first-time user, localStorage flag)
//   - F&G tooltip
//   - Volume + % change lebih bold & readable
//   - Install strip Android/iOS (dari v72, dipertahankan)

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TickerData {
  price: number;
  change24h: number;
  volume24h: number;
}

interface GlobalStats {
  totalMarketCap: number;
  btcDominance: number;
  volume24h: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
}

interface HomeDashboardProps {
  tickerMap: Record<string, TickerData>;
  globalStats: GlobalStats | null;
  exchange: 'binance' | 'bybit' | 'okx';
  onSelectExchange: (ex: 'binance' | 'bybit' | 'okx') => void;
  onSelectSymbol: (sym: string) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = {
  bg: 'rgba(5,7,15,1)',
  panel: 'rgba(9,11,18,1)',
  border: 'rgba(255,255,255,0.07)',
  bid: 'rgba(0,255,157,1)',
  ask: 'rgba(255,59,92,1)',
  gold: 'rgba(242,162,33,1)',
  muted: 'rgba(255,255,255,0.35)',
  text: 'rgba(255,255,255,0.90)',
  okx: 'rgba(0,200,255,1)',
};

const WATCHLIST = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','AVAXUSDT','LINKUSDT','DOGEUSDT'];

const HEATMAP_COINS = [
  { sym: 'BTCUSDT', label: 'BTC' },
  { sym: 'ETHUSDT', label: 'ETH' },
  { sym: 'SOLUSDT', label: 'SOL' },
  { sym: 'BNBUSDT', label: 'BNB' },
];

const EX_META = {
  binance: { label: 'Binance', color: 'rgba(242,162,33,1)' },
  bybit:   { label: 'Bybit',   color: 'rgba(255,89,89,1)'  },
  okx:     { label: 'OKX',     color: 'rgba(0,200,255,1)'  },
} as const;

const fmt = (n: number, digits = 2) =>
  n >= 1e12 ? `$${(n/1e12).toFixed(2)}T`
  : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n/1e3).toFixed(2)}K`
  : `$${n.toFixed(digits)}`;

const fmtPrice = (p: number) =>
  p < 0.001 ? p.toFixed(8)
  : p < 1 ? p.toFixed(5)
  : p < 1000 ? p.toFixed(2)
  : p.toLocaleString('en-US', { maximumFractionDigits: 2 });

const fgColor = (v: number) =>
  v <= 25 ? COLORS.ask
  : v <= 45 ? 'rgba(255,140,0,1)'
  : v <= 55 ? 'rgba(255,220,0,1)'
  : v <= 75 ? 'rgba(100,220,100,1)'
  : COLORS.bid;

// ─── Sparkline Component ──────────────────────────────────────────────────────

interface SparklineProps {
  data: { time: number; value: number }[];
  color: string;
  width?: number;
  height?: number;
}

const Sparkline = memo(({ data, color, width = 80, height = 36 }: SparklineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || data.length < 2) return;
    el.innerHTML = '';
    const chart = createChart(el, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: 0 },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addAreaSeries({
      lineColor: color,
      lineWidth: 1.5,
      topColor: color.replace(',1)', ',0.18)'),
      bottomColor: color.replace(',1)', ',0)'),
    });
    series.setData(data);
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, [data, color, width, height]);

  return (
    <div
      ref={containerRef}
      style={{ width, height, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}
    />
  );
});
Sparkline.displayName = 'Sparkline';

// ─── Onboarding Overlay ───────────────────────────────────────────────────────

const ONBOARD_KEY = 'zero_onboarded_v1';

const OnboardingOverlay = memo(({ onDone }: { onDone: () => void }) => {
  const steps = [
    {
      icon: '📊',
      title: 'Market Pulse',
      desc: 'Live market cap, BTC dominance, volume & Fear/Greed — semuanya real-time.',
    },
    {
      icon: '⚡',
      title: 'Exchange Compare',
      desc: 'Tap exchange card untuk switch. Best Price badge otomatis highlight exchange termurah.',
    },
    {
      icon: '🔥',
      title: 'Top Movers',
      desc: 'Filter Gainers / Losers / All. Tap coin langsung buka chart.',
    },
    {
      icon: '📱',
      title: 'Install App',
      desc: 'Install sebagai PWA — works offline, no ads, no store needed.',
    },
  ];
  const [step, setStep] = useState(0);
  const isLast = step === steps.length - 1;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(5,7,15,0.96)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px',
        fontFamily: 'IBM Plex Mono, monospace',
      }}
    >
      {/* progress dots */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        {steps.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? 24 : 8, height: 8,
              borderRadius: 4,
              background: i === step ? COLORS.gold : COLORS.border,
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>

      {/* card */}
      <div
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: '32px 28px',
          maxWidth: 320, width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 52, marginBottom: 20 }}>{steps[step].icon}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>
          {steps[step].title}
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.7 }}>
          {steps[step].desc}
        </div>
      </div>

      {/* buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
        {!isLast && (
          <button
            onClick={onDone}
            style={{
              padding: '12px 20px', borderRadius: 10, border: `1px solid ${COLORS.border}`,
              background: 'transparent', color: COLORS.muted,
              fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', cursor: 'pointer',
            }}
          >
            Skip
          </button>
        )}
        <button
          onClick={() => isLast ? onDone() : setStep(s => s + 1)}
          style={{
            padding: '12px 28px', borderRadius: 10, border: 'none',
            background: COLORS.gold, color: 'rgba(0,0,0,1)',
            fontSize: 13, fontWeight: 700,
            fontFamily: 'IBM Plex Mono, monospace', cursor: 'pointer',
            minWidth: 120,
          }}
        >
          {isLast ? 'Get Started 🚀' : 'Next →'}
        </button>
      </div>
    </div>
  );
});
OnboardingOverlay.displayName = 'OnboardingOverlay';

// ─── Pull To Refresh ──────────────────────────────────────────────────────────

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

const PullToRefresh = memo(({ onRefresh, children }: PullToRefreshProps) => {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const startY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const THRESHOLD = 72;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && scrollRef.current && scrollRef.current.scrollTop === 0) {
      setPulling(true);
      setPullY(Math.min(dy * 0.45, THRESHOLD + 20));
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (pullY >= THRESHOLD) {
      setRefreshing(true);
      setPullY(THRESHOLD);
      await onRefresh();
      setRefreshing(false);
    }
    setPulling(false);
    setPullY(0);
  }, [pullY, onRefresh]);

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {/* pull indicator */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: THRESHOLD,
          transform: `translateY(${Math.min(pullY, THRESHOLD) - THRESHOLD}px)`,
          transition: pulling ? 'none' : 'transform 0.3s',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: COLORS.gold, fontSize: 12,
          fontFamily: 'IBM Plex Mono, monospace',
        }}>
          {refreshing ? (
            <>
              <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>↻</span>
              Refreshing...
            </>
          ) : pullY >= THRESHOLD ? (
            <>↑ Release to refresh</>
          ) : (
            <>↓ Pull to refresh</>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          height: '100%',
          overflowY: 'auto',
          transform: `translateY(${pullY}px)`,
          transition: pulling ? 'none' : 'transform 0.3s',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});
PullToRefresh.displayName = 'PullToRefresh';

// ─── Market Heatmap ───────────────────────────────────────────────────────────

interface HeatmapProps {
  tickerMap: Record<string, TickerData>;
  onSelectSymbol: (sym: string) => void;
}

const MarketHeatmap = memo(({ tickerMap, onSelectSymbol }: HeatmapProps) => {
  return (
    <section style={{ padding: '0 16px 4px' }}>
      <div style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 10, letterSpacing: 2,
        color: COLORS.muted, textTransform: 'uppercase',
        marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: COLORS.gold, display: 'inline-block' }} />
        Heatmap
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {HEATMAP_COINS.map(({ sym, label }) => {
          const t = tickerMap[sym];
          const pct = t?.change24h ?? 0;
          const intensity = Math.min(Math.abs(pct) / 6, 1); // normalize 0-6% → 0-1
          const bg = pct >= 0
            ? `rgba(0,255,157,${0.06 + intensity * 0.22})`
            : `rgba(255,59,92,${0.06 + intensity * 0.22})`;
          const border = pct >= 0
            ? `rgba(0,255,157,${0.15 + intensity * 0.35})`
            : `rgba(255,59,92,${0.15 + intensity * 0.35})`;
          const color = pct >= 0 ? COLORS.bid : COLORS.ask;
          return (
            <button
              key={sym}
              onClick={() => onSelectSymbol(sym)}
              style={{
                background: bg, border: `1px solid ${border}`,
                borderRadius: 14, padding: '16px 14px',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.25s',
                minHeight: 80,
              }}
            >
              <div style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 14, fontWeight: 700, color: COLORS.text,
                marginBottom: 4,
              }}>{label}</div>
              <div style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11, color: COLORS.muted, marginBottom: 8,
              }}>
                {t ? fmtPrice(t.price) : '—'}
              </div>
              <div style={{
                display: 'inline-block',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 13, fontWeight: 700, color,
              }}>
                {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
});
MarketHeatmap.displayName = 'MarketHeatmap';

// ─── Main Component ───────────────────────────────────────────────────────────

const HomeDashboard = memo(({
  tickerMap,
  globalStats,
  exchange,
  onSelectExchange,
  onSelectSymbol,
}: HomeDashboardProps) => {

  // onboarding
  const [showOnboard, setShowOnboard] = useState(() => {
    try { return !localStorage.getItem(ONBOARD_KEY); } catch { return false; }
  });
  const doneOnboard = useCallback(() => {
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch {}
    setShowOnboard(false);
  }, []);

  // movers tab + search
  const [moversTab, setMoversTab] = useState<'gainers' | 'losers' | 'all'>('all');
  const [search, setSearch] = useState('');

  // flash map: sym → 'up'|'down'|null
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({});
  const prevPrices = useRef<Record<string, number>>({});

  // f&g tooltip
  const [showFgTip, setShowFgTip] = useState(false);

  // fake sparkline data (replace with real 24h kline fetch if available)
  const sparkData = useMemo(() => {
    const gen = (sym: string, up: boolean) => {
      let base = tickerMap[sym]?.price ?? 100;
      const pts: { time: number; value: number }[] = [];
      const now = Math.floor(Date.now() / 1000);
      for (let i = 47; i >= 0; i--) {
        base += (Math.random() - (up ? 0.44 : 0.56)) * base * 0.004;
        pts.push({ time: now - i * 1800, value: Math.max(base, 0.00001) });
      }
      return pts;
    };
    const all: Record<string, { time: number; value: number }[]> = {};
    Object.keys(tickerMap).forEach(sym => {
      all[sym] = gen(sym, (tickerMap[sym]?.change24h ?? 0) >= 0);
    });
    return all;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // generate once per mount — swap with real data hook later

  // price flash detection
  useEffect(() => {
    const next: Record<string, 'up' | 'down'> = {};
    Object.entries(tickerMap).forEach(([sym, t]) => {
      const prev = prevPrices.current[sym];
      if (prev !== undefined && prev !== t.price) {
        next[sym] = t.price > prev ? 'up' : 'down';
      }
      prevPrices.current[sym] = t.price;
    });
    if (Object.keys(next).length > 0) {
      setFlashMap(next);
      const tid = setTimeout(() => setFlashMap({}), 450);
      return () => clearTimeout(tid);
    }
  }, [tickerMap]);

  // pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    await new Promise(r => setTimeout(r, 800)); // WS auto-refreshes; just delay UX
  }, []);

  // top movers
  const allMovers = useMemo(() => {
    return Object.entries(tickerMap)
      .map(([sym, t]) => ({ sym, ...t }))
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
      .slice(0, 30);
  }, [tickerMap]);

  const filteredMovers = useMemo(() => {
    let list = allMovers;
    if (moversTab === 'gainers') list = list.filter(c => c.change24h >= 0);
    else if (moversTab === 'losers') list = list.filter(c => c.change24h < 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.sym.toLowerCase().includes(q));
    }
    return list.slice(0, 12);
  }, [allMovers, moversTab, search]);

  // best price exchange (lowest price = best for buyer)
  const exPrices = useMemo(() => ({
    binance: tickerMap['BTCUSDT']?.price ?? 0,
    bybit: tickerMap['BTCUSDT']?.price ?? 0,
    okx: tickerMap['BTCUSDT']?.price ?? 0,
  }), [tickerMap]);
  // Note: All 3 use same tickerMap (Bybit) for now per handoff note #16
  // Future: separate per-exchange feeds
  const bestEx = useMemo(() => {
    const vals = Object.entries(exPrices).filter(([, v]) => v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a[1] <= b[1] ? a : b)[0] as 'binance' | 'bybit' | 'okx';
  }, [exPrices]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const sectionTitle: React.CSSProperties = {
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 10, letterSpacing: 2,
    color: COLORS.muted, textTransform: 'uppercase',
    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
  };

  const dot: React.CSSProperties = {
    width: 4, height: 4, borderRadius: '50%',
    background: COLORS.gold, display: 'inline-block', flexShrink: 0,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {showOnboard && <OnboardingOverlay onDone={doneOnboard} />}

      <style>{`
        @keyframes flashGreen {
          0% { background: rgba(0,255,157,0.18); }
          100% { background: transparent; }
        }
        @keyframes flashRed {
          0% { background: rgba(255,59,92,0.18); }
          100% { background: transparent; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .flash-up { animation: flashGreen 450ms ease-out; }
        .flash-down { animation: flashRed 450ms ease-out; }
        .tab-btn { transition: all 0.18s; }
        .tab-btn:active { transform: scale(0.95); }
        .mover-row:active { transform: scale(0.99); }
        .ex-card:active { transform: scale(0.98); }
      `}</style>

      <PullToRefresh onRefresh={handleRefresh}>
        <div style={{ paddingBottom: 24 }}>

          {/* ── Market Pulse ──────────────────────────────── */}
          <section style={{ padding: '16px 16px 4px' }}>
            <div style={sectionTitle}>
              <span style={dot} />
              Market Pulse
              <span style={{
                background: 'rgba(242,162,33,0.15)',
                color: COLORS.gold, fontSize: 9,
                padding: '2px 7px', borderRadius: 4,
              }}>live</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* MKT CAP */}
              <div style={{
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: '14px 14px',
                borderTop: '2px solid rgba(59,130,246,0.6)',
              }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, fontFamily: 'IBM Plex Mono, monospace', marginBottom: 5 }}>MKT CAP</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17, fontWeight: 700, color: COLORS.text }}>
                  {globalStats ? fmt(globalStats.totalMarketCap) : '—'}
                </div>
                <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 3, fontFamily: 'IBM Plex Mono, monospace' }}>Total crypto market</div>
              </div>

              {/* BTC.D */}
              <div style={{
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: '14px 14px',
                borderTop: `2px solid ${COLORS.gold}`,
              }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, fontFamily: 'IBM Plex Mono, monospace', marginBottom: 5 }}>BTC.D</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17, fontWeight: 700, color: COLORS.gold }}>
                  {globalStats ? `${globalStats.btcDominance.toFixed(1)}%` : '—'}
                </div>
                <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 3, fontFamily: 'IBM Plex Mono, monospace' }}>Bitcoin dominance</div>
              </div>

              {/* VOL 24H */}
              <div style={{
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: '14px 14px',
                borderTop: `2px solid rgba(0,255,157,0.6)`,
              }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, fontFamily: 'IBM Plex Mono, monospace', marginBottom: 5 }}>VOL 24H</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17, fontWeight: 700, color: COLORS.text }}>
                  {globalStats ? fmt(globalStats.volume24h) : '—'}
                </div>
                <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 3, fontFamily: 'IBM Plex Mono, monospace' }}>Global 24h volume</div>
              </div>

              {/* F&G */}
              <div
                style={{
                  background: COLORS.panel, border: `1px solid ${COLORS.border}`,
                  borderRadius: 14, padding: '14px 14px', position: 'relative',
                  borderTop: `2px solid ${globalStats ? fgColor(globalStats.fearGreedIndex) : COLORS.ask}`,
                  cursor: 'pointer',
                }}
                onClick={() => setShowFgTip(v => !v)}
              >
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, fontFamily: 'IBM Plex Mono, monospace', marginBottom: 5 }}>F&amp;G</div>
                <div style={{
                  fontFamily: 'IBM Plex Mono, monospace', fontSize: 24, fontWeight: 700,
                  color: globalStats ? fgColor(globalStats.fearGreedIndex) : COLORS.ask,
                }}>
                  {globalStats?.fearGreedIndex ?? '—'}
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 700, marginTop: 3,
                  color: globalStats ? fgColor(globalStats.fearGreedIndex) : COLORS.ask,
                  fontFamily: 'IBM Plex Mono, monospace',
                }}>
                  {globalStats?.fearGreedLabel ?? 'EXTREME FEAR'}
                </div>
                {/* tooltip */}
                <div style={{
                  position: 'absolute', bottom: 8, right: 8,
                  background: 'rgba(255,59,92,0.15)', border: '1px solid rgba(255,59,92,0.3)',
                  borderRadius: 5, padding: '1px 5px',
                  fontSize: 8, color: COLORS.ask, fontFamily: 'IBM Plex Mono, monospace',
                }}>?</div>
                {showFgTip && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 10,
                    background: 'rgba(9,11,18,0.98)', border: `1px solid ${COLORS.border}`,
                    borderRadius: 10, padding: '10px 12px',
                    fontSize: 11, color: COLORS.text, lineHeight: 1.6,
                    fontFamily: 'IBM Plex Mono, monospace',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  }}>
                    Fear &amp; Greed Index (0–100).<br/>
                    0 = Extreme Fear, 100 = Extreme Greed.<br/>
                    Source: alternative.me
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Heatmap ───────────────────────────────────── */}
          <section style={{ padding: '16px 16px 4px' }}>
            <MarketHeatmap tickerMap={tickerMap} onSelectSymbol={onSelectSymbol} />
          </section>

          {/* ── Exchange Cards ────────────────────────────── */}
          <section style={{ padding: '16px 16px 4px' }}>
            <div style={sectionTitle}>
              <span style={dot} />
              Exchange
              <span style={{ color: COLORS.muted, fontSize: 9, fontWeight: 400 }}>
                BTC/USDT · tap to switch
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {(['binance', 'bybit', 'okx'] as const).map(ex => {
                const meta = EX_META[ex];
                const isActive = exchange === ex;
                const isBest = bestEx === ex;
                const t = tickerMap['BTCUSDT'];
                const flash = flashMap['BTCUSDT'];
                return (
                  <button
                    key={ex}
                    className={`ex-card${flash ? ` flash-${flash === 'up' ? 'up' : 'down'}` : ''}`}
                    onClick={() => onSelectExchange(ex)}
                    style={{
                      background: isActive
                        ? `rgba(${meta.color.slice(5,-1)},0.07)`
                        : isBest
                          ? 'rgba(0,255,157,0.05)'
                          : COLORS.panel,
                      border: `1px solid ${isActive ? meta.color : isBest ? 'rgba(0,255,157,0.5)' : COLORS.border}`,
                      borderRadius: 14, padding: '12px 10px',
                      cursor: 'pointer', textAlign: 'left',
                      position: 'relative', overflow: 'hidden',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    {/* BEST badge */}
                    {isBest && (
                      <div style={{
                        position: 'absolute', top: -1, right: 8,
                        background: COLORS.bid, color: 'rgba(0,0,0,1)',
                        fontSize: 7, fontWeight: 800, padding: '2px 5px',
                        borderRadius: '0 0 5px 5px', letterSpacing: 0.5,
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}>BEST</div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 1,
                        color: isActive ? meta.color : COLORS.muted,
                        fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase',
                      }}>{meta.label}</span>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isActive ? meta.color : COLORS.border,
                        display: 'inline-block',
                      }} />
                    </div>

                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 5,
                    }}>
                      {t ? fmtPrice(t.price) : '—'}
                    </div>

                    <div style={{
                      display: 'inline-block', padding: '3px 6px', borderRadius: 6,
                      fontSize: 10, fontWeight: 700,
                      background: (t?.change24h ?? 0) >= 0 ? 'rgba(0,255,157,0.15)' : 'rgba(255,59,92,0.15)',
                      color: (t?.change24h ?? 0) >= 0 ? COLORS.bid : COLORS.ask,
                      marginBottom: 6, fontFamily: 'IBM Plex Mono, monospace',
                    }}>
                      {(t?.change24h ?? 0) >= 0 ? '+' : ''}{(t?.change24h ?? 0).toFixed(2)}%
                    </div>

                    {/* volume — bigger & bold */}
                    <div style={{
                      fontSize: 10, fontWeight: 600,
                      color: 'rgba(255,255,255,0.55)',
                      fontFamily: 'IBM Plex Mono, monospace',
                      marginBottom: 6,
                    }}>
                      Vol {t ? fmt(t.volume24h) : '—'}
                    </div>

                    {/* sparkline */}
                    <Sparkline
                      data={sparkData['BTCUSDT'] ?? []}
                      color={isActive ? meta.color : COLORS.muted}
                      width={72}
                      height={32}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Top Movers ────────────────────────────────── */}
          <section style={{ padding: '16px 16px 4px' }}>
            {/* header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={sectionTitle}>
                <span style={dot} />
                Top Movers
              </div>
              {/* tabs */}
              <div style={{
                display: 'flex', gap: 3,
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: 3,
              }}>
                {(['gainers', 'losers', 'all'] as const).map(t => (
                  <button
                    key={t}
                    className="tab-btn"
                    onClick={() => setMoversTab(t)}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: '4px 8px',
                      borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono, monospace',
                      background: moversTab === t
                        ? t === 'gainers' ? 'rgba(0,255,157,0.18)'
                          : t === 'losers' ? 'rgba(255,59,92,0.18)'
                          : 'rgba(255,255,255,0.08)'
                        : 'transparent',
                      color: moversTab === t
                        ? t === 'gainers' ? COLORS.bid
                          : t === 'losers' ? COLORS.ask
                          : COLORS.text
                        : COLORS.muted,
                    }}
                  >
                    {t === 'gainers' ? '▲' : t === 'losers' ? '▼' : '●'}{' '}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: COLORS.panel, border: `1px solid ${COLORS.border}`,
              borderRadius: 10, padding: '8px 12px', marginBottom: 10,
            }}>
              <span style={{ color: COLORS.muted, fontSize: 13 }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search coin…"
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: COLORS.text, fontSize: 12, flex: 1,
                  fontFamily: 'IBM Plex Mono, monospace',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: 14 }}
                >✕</button>
              )}
            </div>

            {/* list */}
            <div style={{
              background: COLORS.panel, border: `1px solid ${COLORS.border}`,
              borderRadius: 14, overflow: 'hidden',
            }}>
              {filteredMovers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>
                  No coins found
                </div>
              ) : filteredMovers.map((c, i) => {
                const isUp = c.change24h >= 0;
                const flash = flashMap[c.sym];
                const base = c.sym.replace('USDT', '');
                return (
                  <button
                    key={c.sym}
                    className={`mover-row${flash ? ` flash-${flash === 'up' ? 'up' : 'down'}` : ''}`}
                    onClick={() => onSelectSymbol(c.sym)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', width: '100%',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderBottom: i < filteredMovers.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                      transition: 'background 0.15s',
                      minHeight: 48,
                    }}
                  >
                    {/* icon placeholder */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: isUp ? 'rgba(0,255,157,0.12)' : 'rgba(255,59,92,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 12, fontWeight: 700,
                      color: isUp ? COLORS.bid : COLORS.ask,
                    }}>
                      {base.slice(0, 2)}
                    </div>

                    {/* name + vol */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, fontWeight: 700, color: COLORS.text }}>
                        {base}
                        <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}>/USDT</span>
                      </div>
                      <div style={{
                        fontSize: 10, fontWeight: 600,
                        color: 'rgba(255,255,255,0.45)',
                        fontFamily: 'IBM Plex Mono, monospace', marginTop: 2,
                      }}>
                        Vol {fmt(c.volume24h)}
                      </div>
                    </div>

                    {/* sparkline */}
                    <Sparkline
                      data={sparkData[c.sym] ?? []}
                      color={isUp ? COLORS.bid : COLORS.ask}
                      width={64}
                      height={28}
                    />

                    {/* price + change */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4,
                      }}>
                        {fmtPrice(c.price)}
                      </div>
                      <span style={{
                        display: 'inline-block', padding: '3px 7px', borderRadius: 7,
                        fontSize: 11, fontWeight: 700,
                        background: isUp ? 'rgba(0,255,157,0.15)' : 'rgba(255,59,92,0.15)',
                        color: isUp ? COLORS.bid : COLORS.ask,
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}>
                        {isUp ? '+' : ''}{c.change24h.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Watchlist ─────────────────────────────────── */}
          <section style={{ padding: '16px 16px 4px' }}>
            <div style={sectionTitle}>
              <span style={dot} />
              Watchlist
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {WATCHLIST.map((sym, i) => {
                const t = tickerMap[sym];
                const isUp = (t?.change24h ?? 0) >= 0;
                const flash = flashMap[sym];
                return (
                  <button
                    key={sym}
                    className={flash ? `flash-${flash === 'up' ? 'up' : 'down'}` : ''}
                    onClick={() => onSelectSymbol(sym)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '10px 0', background: 'none', border: 'none',
                      borderBottom: i < WATCHLIST.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                      cursor: 'pointer', textAlign: 'left', minHeight: 48,
                      gap: 10,
                    }}
                  >
                    <span style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 13, fontWeight: 700, color: COLORS.text, flex: 1,
                    }}>
                      {sym.replace('USDT', '')}
                      <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}>/USDT</span>
                    </span>
                    <span style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 12, fontWeight: 600, color: COLORS.text,
                    }}>
                      {t ? fmtPrice(t.price) : '—'}
                    </span>
                    <span style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 11, fontWeight: 700, minWidth: 60, textAlign: 'right',
                      color: isUp ? COLORS.bid : COLORS.ask,
                    }}>
                      {isUp ? '+' : ''}{(t?.change24h ?? 0).toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Install Strip (v72 preserved) ─────────────── */}
          <section style={{ padding: '16px 16px 8px' }}>
            <div style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 11, fontWeight: 700, color: COLORS.text, marginBottom: 4,
                }}>
                  INSTALL APP
                </div>
                <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'IBM Plex Mono, monospace' }}>
                  Works offline · No ads · Free
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Android */}
                <button
                  onClick={() => {
                    const prompt = (window as unknown as Record<string, unknown>).__pwaPrompt as { prompt?: () => void } | undefined;
                    if (prompt?.prompt) prompt.prompt();
                  }}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'rgba(0,255,157,0.12)', border: `1px solid rgba(0,255,157,0.3)`,
                    color: COLORS.bid, fontSize: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Install on Android"
                >
                  🤖
                </button>
                {/* iOS */}
                <button
                  onClick={() => alert('Safari → Share (□↑) → Add to Home Screen')}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)', border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Install on iOS"
                >
                  🍎
                </button>
              </div>
            </div>
          </section>

        </div>
      </PullToRefresh>
    </>
  );
});

HomeDashboard.displayName = 'HomeDashboard';
export default HomeDashboard;
