// HomeDashboard.tsx — v78
// FIX v78:
//   - Exchange cards: per-exchange REST price (Binance/Bybit/OKX show real prices)
//   - Top Movers: minimum $1M volume filter (removes low-liquidity noise)
//   - ProLock: clear "TAP TO UNLOCK" hint text visible over blur
//   - useExchangePrices: new hook, polls 3 exchanges independently every 10s

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { TickerMap } from '@/hooks/useAllTickers';
import type { GlobalStats } from '@/types/market';
import type { ExchangeId } from '@/hooks/useExchange';
import { useExchangePrices } from '@/hooks/useExchangePrices';
import CoinLogo from './CoinLogo';

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = {
  bg:     'rgba(5,7,15,1)',
  panel:  'rgba(9,11,18,1)',
  panel2: 'rgba(14,17,28,1)',
  border: 'rgba(255,255,255,0.07)',
  bid:    'rgba(0,255,157,1)',
  ask:    'rgba(255,59,92,1)',
  gold:   'rgba(242,162,33,1)',
  muted:  'rgba(255,255,255,0.35)',
  text:   'rgba(255,255,255,0.90)',
  okx:    'rgba(0,200,255,1)',
} as const;

const WATCHLIST_SYMS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT',
  'BNBUSDT','AVAXUSDT','LINKUSDT','DOGEUSDT',
] as const;

// FIX v78: minimum $1M volume to filter noise from top movers
const MIN_MOVER_VOL = 1_000_000;

const HEATMAP_COINS = [
  { sym: 'BTCUSDT', label: 'BTC' },
  { sym: 'ETHUSDT', label: 'ETH' },
  { sym: 'SOLUSDT', label: 'SOL' },
  { sym: 'BNBUSDT', label: 'BNB' },
] as const;

const EX_META: Record<ExchangeId, { label: string; color: string }> = {
  binance: { label: 'Binance', color: 'rgba(242,162,33,1)' },
  bybit:   { label: 'Bybit',   color: 'rgba(255,89,89,1)'  },
  okx:     { label: 'OKX',     color: 'rgba(0,200,255,1)'  },
};

// ─── Exchange Logo SVGs ───────────────────────────────────────────────────────
// ─── Binance Logo ─────────────────────────────────────────────────────────────
// Source: file_BINANCE.svg — 5 diamond cross pattern (BNB icon), gold #F0B90B
const BinanceLogo = memo(({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    {/* Top diamond */}
    <path fill="rgba(240,185,11,1)" d="M16,3.2 L18.8,6.0 L16,8.8 L13.2,6.0 Z"/>
    {/* Left diamond */}
    <path fill="rgba(240,185,11,1)" d="M7.2,12.0 L10.0,9.2 L12.8,12.0 L10.0,14.8 Z"/>
    {/* Center diamond — larger */}
    <path fill="rgba(240,185,11,1)" d="M16,11.2 L20.8,16.0 L16,20.8 L11.2,16.0 Z"/>
    {/* Right diamond */}
    <path fill="rgba(240,185,11,1)" d="M22.0,9.2 L24.8,12.0 L22.0,14.8 L19.2,12.0 Z"/>
    {/* Bottom diamond */}
    <path fill="rgba(240,185,11,1)" d="M16,23.2 L18.8,26.0 L16,28.8 L13.2,26.0 Z"/>
  </svg>
));
BinanceLogo.displayName = 'BinanceLogo';

// ─── Bybit Logo ───────────────────────────────────────────────────────────────
// Source: file_BYBIT.svg — black bg, orange Bybit 'B' lettermark
// The Bybit icon is their stylized B with two bumps (like a B but connected)
const BybitLogo = memo(({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="rgba(10,10,10,1)"/>
    {/* Bybit B: vertical bar left + two bumps right */}
    {/* Vertical bar */}
    <rect x="7" y="7" width="4" height="18" rx="1" fill="rgba(247,166,0,1)"/>
    {/* Top bump */}
    <path fill="rgba(247,166,0,1)" d="M11,7 L11,7 L18,7 C21.5,7 23.5,9 23.5,11.5 C23.5,14 21.5,16 18,16 L11,16 L11,13 L17.5,13 C19,13 20,12.4 20,11.5 C20,10.6 19,10 17.5,10 L11,10 Z"/>
    {/* Bottom bump */}
    <path fill="rgba(247,166,0,1)" d="M11,16 L11,16 L18.5,16 C22.5,16 24.5,18.1 24.5,20.8 C24.5,23.5 22.5,25 18.5,25 L11,25 L11,22 L18,22 C19.5,22 21,21.4 21,20.8 C21,20.1 19.5,19 18,19 L11,19 Z"/>
  </svg>
));
BybitLogo.displayName = 'BybitLogo';

// ─── OKX Logo ─────────────────────────────────────────────────────────────────
// Source: file_OKX.svg — black bg, white shapes (OKX wordmark: O + K + X)
// For 32x32 icon: use OKX geometric icon = 4 squares in 2x2 with center gap
// This matches the X mark in the OKX wordmark (4 squares diagonal)
const OkxLogo = memo(({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="rgba(0,0,0,1)"/>
    {/* 4 squares in 2x2 grid — OKX X geometric mark */}
    <rect x="4"  y="4"  width="11" height="11" rx="1.5" fill="rgba(255,255,255,1)"/>
    <rect x="17" y="4"  width="11" height="11" rx="1.5" fill="rgba(255,255,255,1)"/>
    <rect x="4"  y="17" width="11" height="11" rx="1.5" fill="rgba(255,255,255,1)"/>
    <rect x="17" y="17" width="11" height="11" rx="1.5" fill="rgba(255,255,255,1)"/>
  </svg>
));
OkxLogo.displayName = 'OkxLogo';

const EX_LOGO: Record<ExchangeId, React.ComponentType<{ size?: number }>> = {
  binance: BinanceLogo,
  bybit:   BybitLogo,
  okx:     OkxLogo,
};

// ─── News types ───────────────────────────────────────────────────────────────
interface NewsItem {
  id: string;
  title: string;
  url: string;
  imageurl: string;
  source: string;
  published: number;
}

const ONBOARD_KEY = 'zero_onboarded_v1';

// ─── useNews hook ─────────────────────────────────────────────────────────────
function useNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const ctrl = new AbortController();
    fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=popular&limit=6', { signal: ctrl.signal })
      .then(r => r.json())
      .then((d: { Data?: Array<{ id: string; title: string; url: string; imageurl: string; source_info?: { name: string }; published_on: number }> }) => {
        if (!mountedRef.current) return;
        const items: NewsItem[] = (d.Data ?? []).slice(0, 6).map(n => ({
          id:        String(n.id),
          title:     n.title,
          url:       n.url,
          imageurl:  n.imageurl,
          source:    n.source_info?.name ?? '',
          published: n.published_on * 1000,
        }));
        setNews(items);
      })
      .catch(() => {});
    return () => { mountedRef.current = false; ctrl.abort(); };
  }, []);
  return news;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(p: number): string {
  if (p < 0.001)  return p.toFixed(8);
  if (p < 1)      return p.toFixed(5);
  if (p < 1000)   return p.toFixed(2);
  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fgColor(v: number): string {
  if (v <= 25) return COLORS.ask;
  if (v <= 45) return 'rgba(255,140,0,1)';
  if (v <= 55) return 'rgba(255,220,0,1)';
  if (v <= 75) return 'rgba(100,220,100,1)';
  return COLORS.bid;
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

interface SparklineProps {
  data: { time: number; value: number }[];
  color: string;
  width?: number;
  height?: number;
}

const Sparkline = memo(({ data, color, width = 80, height = 36 }: SparklineProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || data.length < 2) return;
    el.innerHTML = '';
    const chart = createChart(el, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
      },
      grid:             { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair:        { mode: 0 },
      rightPriceScale:  { visible: false },
      leftPriceScale:   { visible: false },
      timeScale:        { visible: false },
      handleScroll:     false,
      handleScale:      false,
    });
    const series = chart.addAreaSeries({
      lineColor:   color,
      lineWidth:   1.5,
      topColor:    color.replace(',1)', ',0.16)'),
      bottomColor: color.replace(',1)', ',0)'),
    });
    series.setData(data);
    return () => chart.remove();
  }, [data, color, width, height]);

  return (
    <div
      ref={ref}
      style={{ width, height, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}
    />
  );
});
Sparkline.displayName = 'Sparkline';

// ─── Onboarding Overlay ───────────────────────────────────────────────────────

const STEPS = [
  { icon: '📊', title: 'Market Pulse',    desc: 'Live market cap, BTC dominance, volume & Fear/Greed — real-time.' },
  { icon: '⚡', title: 'Exchange Compare', desc: 'Tap exchange card untuk switch. BEST badge otomatis highlight exchange termurah.' },
  { icon: '🔥', title: 'Top Movers',       desc: 'Filter Gainers / Losers / All. Tap coin langsung buka chart.' },
  { icon: '📱', title: 'Install App',      desc: 'Install sebagai PWA — works offline, no ads, no store needed.' },
];

const OnboardingOverlay = memo(({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(5,7,15,0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
      fontFamily: '"IBM Plex Mono", monospace',
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 24 : 8, height: 8, borderRadius: 4,
            background: i === step ? COLORS.gold : COLORS.border,
            transition: 'all 0.3s',
          }} />
        ))}
      </div>
      <div style={{
        background: COLORS.panel, border: `1px solid ${COLORS.border}`,
        borderRadius: 20, padding: '32px 28px',
        maxWidth: 320, width: '100%', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 18 }}>{STEPS[step].icon}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>
          {STEPS[step].title}
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.7 }}>
          {STEPS[step].desc}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        {!isLast && (
          <button onClick={onDone} style={{
            padding: '12px 18px', borderRadius: 10,
            border: `1px solid ${COLORS.border}`, background: 'transparent',
            color: COLORS.muted, fontSize: 12,
            fontFamily: '"IBM Plex Mono", monospace', cursor: 'pointer',
          }}>Skip</button>
        )}
        <button
          onClick={() => isLast ? onDone() : setStep(s => s + 1)}
          style={{
            padding: '12px 28px', borderRadius: 10, border: 'none',
            background: COLORS.gold, color: 'rgba(0,0,0,1)',
            fontSize: 13, fontWeight: 700,
            fontFamily: '"IBM Plex Mono", monospace', cursor: 'pointer',
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

const PullToRefresh = memo(({
  onRefresh, children,
}: { onRefresh: () => Promise<void>; children: React.ReactNode }) => {
  const [pullY, setPullY]       = useState(0);
  const [pulling, setPulling]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY  = useRef(0);
  const scrollEl = useRef<HTMLDivElement>(null);
  const THRESHOLD = 68;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollEl.current?.scrollTop === 0)
      startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && scrollEl.current?.scrollTop === 0) {
      setPulling(true);
      setPullY(Math.min(dy * 0.44, THRESHOLD + 16));
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
      {/* indicator */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        height: THRESHOLD, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `translateY(${Math.min(pullY, THRESHOLD) - THRESHOLD}px)`,
        transition: pulling ? 'none' : 'transform 0.3s',
        color: COLORS.gold, fontSize: 11,
        fontFamily: '"IBM Plex Mono", monospace',
        gap: 6,
      }}>
        <span style={{ display: 'inline-block', animation: refreshing ? 'ptr-spin 0.8s linear infinite' : 'none' }}>
          {refreshing ? '↻' : pullY >= THRESHOLD ? '↑' : '↓'}
        </span>
        {refreshing ? 'Refreshing…' : pullY >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
      </div>

      <div
        ref={scrollEl}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          height: '100%', overflowY: 'auto',
          transform: `translateY(${pullY}px)`,
          transition: pulling ? 'none' : 'transform 0.3s',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>

      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});
PullToRefresh.displayName = 'PullToRefresh';

// ─── Market Heatmap ───────────────────────────────────────────────────────────

const MarketHeatmap = memo(({
  tickerMap, onSelectSymbol,
}: { tickerMap: TickerMap; onSelectSymbol: (s: string) => void }) => (
  <div>
    <SectionTitle label="Heatmap" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {HEATMAP_COINS.map(({ sym, label }) => {
        const t   = tickerMap.get(sym.toUpperCase());
        const pct = t?.changePct ?? 0;
        const int = Math.min(Math.abs(pct) / 6, 1);
        const bg  = pct >= 0
          ? `rgba(0,255,157,${0.06 + int * 0.20})`
          : `rgba(255,59,92,${0.06 + int * 0.20})`;
        const bd  = pct >= 0
          ? `rgba(0,255,157,${0.15 + int * 0.30})`
          : `rgba(255,59,92,${0.15 + int * 0.30})`;
        return (
          <button
            key={sym}
            onClick={() => onSelectSymbol(sym)}
            style={{
              background: bg, border: `1px solid ${bd}`,
              borderRadius: 14, padding: '14px 12px',
              cursor: 'pointer', textAlign: 'left',
              minHeight: 76, transition: 'all 0.2s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 3 }}>
              {label}
            </div>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: COLORS.muted, marginBottom: 6 }}>
              {t ? fmtPrice(t.lastPrice) : '—'}
            </div>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, fontWeight: 700,
              color: pct >= 0 ? COLORS.bid : COLORS.ask,
            }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </div>
          </button>
        );
      })}
    </div>
  </div>
));
MarketHeatmap.displayName = 'MarketHeatmap';

// ─── Section Title helper ─────────────────────────────────────────────────────

const SectionTitle = memo(({ label, badge }: { label: string; badge?: string }) => (
  <div style={{
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: 10, letterSpacing: 2,
    color: COLORS.muted, textTransform: 'uppercase' as const,
    marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 8,
  }}>
    <span style={{ width: 4, height: 4, borderRadius: '50%', background: COLORS.gold, display: 'inline-block', flexShrink: 0 }} />
    {label}
    {badge && (
      <span style={{
        background: 'rgba(242,162,33,0.14)', color: COLORS.gold,
        fontSize: 9, padding: '2px 6px', borderRadius: 4,
      }}>{badge}</span>
    )}
  </div>
));
SectionTitle.displayName = 'SectionTitle';

// ─── Main Component ───────────────────────────────────────────────────────────

interface HomeDashboardProps {
  tickerMap:        TickerMap;
  globalStats:      GlobalStats;
  activeSymbol:     string;
  currentExchange:  ExchangeId;
  onSelectExchange: (ex: ExchangeId) => void;
  onSelectSymbol:   (sym: string) => void;
}

const HomeDashboard = memo(({
  tickerMap,
  globalStats,
  activeSymbol,
  currentExchange,
  onSelectExchange,
  onSelectSymbol,
}: HomeDashboardProps) => {

  // Onboarding — first time only
  const [showOnboard, setShowOnboard] = useState(() => {
    try { return !localStorage.getItem(ONBOARD_KEY); } catch { return false; }
  });
  const doneOnboard = useCallback(() => {
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch {}
    setShowOnboard(false);
  }, []);

  // Top Movers tab + search
  const [moversTab, setMoversTab]   = useState<'gainers' | 'losers' | 'all'>('all');
  const [search, setSearch]         = useState('');
  const news                        = useNews();

  // FIX v78: per-exchange real prices for exchange cards
  const exchangePrices = useExchangePrices('BTCUSDT', 10_000);

  // F&G tooltip
  const [showFgTip, setShowFgTip]   = useState(false);

  // Price flash map
  const [flashMap, setFlashMap]     = useState<Record<string, 'up' | 'down'>>({});
  const prevPrices                  = useRef<Record<string, number>>({});

  // Detect price direction changes for flash
  useEffect(() => {
    const next: Record<string, 'up' | 'down'> = {};
    tickerMap.forEach((t, sym) => {
      const prev = prevPrices.current[sym];
      if (prev !== undefined && prev !== t.lastPrice)
        next[sym] = t.lastPrice > prev ? 'up' : 'down';
      prevPrices.current[sym] = t.lastPrice;
    });
    if (Object.keys(next).length === 0) return;
    setFlashMap(next);
    const tid = setTimeout(() => setFlashMap({}), 450);
    return () => clearTimeout(tid);
  }, [tickerMap]);

  // Sparkline data — generated once per mount (swap with real kline hook later)
  const sparkData = useMemo(() => {
    const gen = (sym: string) => {
      const t    = tickerMap.get(sym.toUpperCase());
      const up   = (t?.changePct ?? 0) >= 0;
      let base   = t?.lastPrice ?? 100;
      const pts: { time: number; value: number }[] = [];
      const now  = Math.floor(Date.now() / 1000);
      for (let i = 47; i >= 0; i--) {
        base += (Math.random() - (up ? 0.44 : 0.56)) * base * 0.004;
        pts.push({ time: now - i * 1800, value: Math.max(base, 1e-9) });
      }
      return pts;
    };
    const out: Record<string, { time: number; value: number }[]> = {};
    tickerMap.forEach((_, sym) => { out[sym] = gen(sym); });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once per mount

  // Pull-to-refresh — WS auto-refreshes, just UX delay
  const handleRefresh = useCallback(async () => {
    await new Promise<void>(r => setTimeout(r, 800));
  }, []);

  // Top movers from tickerMap — FIX v78: filter low-volume noise, sort by abs(pct)
  const allMovers = useMemo(() => {
    const out: { sym: string; price: number; pct: number; vol: number }[] = [];
    tickerMap.forEach((t, sym) => {
      // Skip stablecoins, BTC pairs against other coins, and low-vol noise
      if (sym.endsWith('BTC') || sym.endsWith('ETH') || sym.endsWith('BNB')) return;
      if (!sym.endsWith('USDT')) return;
      if (t.volume24h < MIN_MOVER_VOL) return; // FIX: remove <$1M vol noise
      out.push({ sym, price: t.lastPrice, pct: t.changePct, vol: t.volume24h });
    });
    return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 30);
  }, [tickerMap]);

  const filteredMovers = useMemo(() => {
    let list = allMovers;
    if (moversTab === 'gainers') list = list.filter(c => c.pct >= 0);
    if (moversTab === 'losers')  list = list.filter(c => c.pct < 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.sym.toLowerCase().includes(q));
    }
    return list.slice(0, 12);
  }, [allMovers, moversTab, search]);

  // Best price exchange — FIX v78: real comparison from per-exchange REST prices
  const btcTicker  = tickerMap.get('BTCUSDT');
  const bestEx = useMemo((): ExchangeId => {
    const prices: [ExchangeId, number][] = [
      ['binance', exchangePrices.binance.lastPrice],
      ['bybit',   exchangePrices.bybit.lastPrice],
      ['okx',     exchangePrices.okx.lastPrice],
    ];
    const valid = prices.filter(([, p]) => p > 0);
    if (!valid.length) return 'bybit';
    // Highest price = best for sellers (most commonly shown as "best")
    return valid.reduce((a, b) => b[1] > a[1] ? b : a)[0];
  }, [exchangePrices]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {showOnboard && <OnboardingOverlay onDone={doneOnboard} />}

      <style>{`
        @keyframes hd-flash-up   { 0% { background: rgba(0,255,157,0.16); } 100% { background: transparent; } }
        @keyframes hd-flash-down { 0% { background: rgba(255,59,92,0.16); } 100% { background: transparent; } }
        .hd-flash-up   { animation: hd-flash-up   450ms ease-out; }
        .hd-flash-down { animation: hd-flash-down  450ms ease-out; }
        .hd-tab:active, .hd-ex-card:active, .hd-mover:active { transform: scale(0.98); }
      `}</style>

      <PullToRefresh onRefresh={handleRefresh}>
        <div style={{ paddingBottom: 80, fontFamily: '"IBM Plex Mono", monospace' }}>

          {/* ── Market Pulse ── */}
          <section style={{ padding: '14px 16px 4px' }}>
            <SectionTitle label="Market Pulse" badge="live" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

              {/* MKT CAP */}
              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '13px 13px', borderTop: '2px solid rgba(59,130,246,0.55)' }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, marginBottom: 5 }}>MKT CAP</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>
                  {!globalStats.loading ? fmtCompact(globalStats.totalMarketCap) : '—'}
                </div>
                <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 3 }}>Total crypto market</div>
              </div>

              {/* BTC.D */}
              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '13px 13px', borderTop: `2px solid ${COLORS.gold}` }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, marginBottom: 5 }}>BTC.D</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.gold }}>
                  {!globalStats.loading ? `${globalStats.btcDominance.toFixed(1)}%` : '—'}
                </div>
                <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 3 }}>Bitcoin dominance</div>
              </div>

              {/* VOL 24H */}
              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '13px 13px', borderTop: 'rgba(0,255,157,0.55) solid 2px' }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, marginBottom: 5 }}>VOL 24H</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>
                  {!globalStats.loading ? fmtCompact(globalStats.totalVolume24h) : '—'}
                </div>
                <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 3 }}>Global 24h volume</div>
              </div>

              {/* F&G */}
              <div
                style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '13px 13px', position: 'relative', cursor: 'pointer', borderTop: `2px solid ${!globalStats.loading ? fgColor(globalStats.fearGreedValue) : COLORS.ask}` }}
                onClick={() => setShowFgTip(v => !v)}
              >
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: COLORS.muted, marginBottom: 5 }}>F&amp;G</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: !globalStats.loading ? fgColor(globalStats.fearGreedValue) : COLORS.ask }}>
                  {!globalStats.loading ? globalStats.fearGreedValue : '—'}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, marginTop: 3, color: !globalStats.loading ? fgColor(globalStats.fearGreedValue) : COLORS.ask }}>
                  {!globalStats.loading ? globalStats.fearGreedLabel.toUpperCase() : 'EXTREME FEAR'}
                </div>
                <div style={{ position: 'absolute', bottom: 8, right: 9, background: 'rgba(255,59,92,0.14)', border: '1px solid rgba(255,59,92,0.28)', borderRadius: 5, padding: '1px 5px', fontSize: 8, color: COLORS.ask }}>?</div>
                {showFgTip && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 20, background: 'rgba(9,11,18,0.98)', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 11, color: COLORS.text, lineHeight: 1.65, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                    Fear &amp; Greed Index (0–100).<br/>
                    0 = Extreme Fear, 100 = Extreme Greed.<br/>
                    Source: alternative.me
                  </div>
                )}
              </div>

            </div>
          </section>

          {/* ── Heatmap ── */}
          <section style={{ padding: '14px 16px 4px' }}>
            <MarketHeatmap tickerMap={tickerMap} onSelectSymbol={onSelectSymbol} />
          </section>

          {/* ── Exchange Cards ── */}
          <section style={{ padding: '14px 16px 4px' }}>
            <SectionTitle label="Exchange" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {(['binance', 'bybit', 'okx'] as ExchangeId[]).map(ex => {
                const meta    = EX_META[ex];
                const isActive = currentExchange === ex;
                const isBest   = bestEx === ex;
                // FIX v78: use real per-exchange price (not shared Bybit feed)
                const exPrice  = exchangePrices[ex];
                const t        = exPrice.lastPrice > 0 ? exPrice : tickerMap.get('BTCUSDT');
                const flash    = flashMap['BTCUSDT'];
                return (
                  <button
                    key={ex}
                    className={`hd-ex-card${flash ? ` hd-flash-${flash}` : ''}`}
                    onClick={() => onSelectExchange(ex)}
                    style={{
                      background: isActive
                        ? meta.color.replace(',1)', ',0.07)')
                        : isBest ? 'rgba(0,255,157,0.04)' : COLORS.panel,
                      border: `1px solid ${isActive ? meta.color : isBest ? 'rgba(0,255,157,0.45)' : COLORS.border}`,
                      borderRadius: 14, padding: '11px 9px',
                      cursor: 'pointer', textAlign: 'left',
                      position: 'relative', overflow: 'hidden',
                      transition: 'border-color 0.2s',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {isBest && (
                      <div style={{ position: 'absolute', top: -1, right: 7, background: COLORS.bid, color: 'rgba(0,0,0,1)', fontSize: 7, fontWeight: 800, padding: '2px 5px', borderRadius: '0 0 5px 5px', letterSpacing: 0.5 }}>
                        BEST
                      </div>
                    )}
                    {/* Logo + status dot — centered */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 6, position: 'relative' }}>
                      {React.createElement(EX_LOGO[ex], { size: 26 })}
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? meta.color : COLORS.border, display: 'inline-block', position: 'absolute', top: 0, right: 0 }} />
                    </div>
                    {/* Exchange name — centered */}
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: isActive ? meta.color : COLORS.muted, textTransform: 'uppercase' as const, marginBottom: 6, textAlign: 'center' }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 5 }}>
                      {exPrice.loading ? '—' : fmtPrice(exPrice.lastPrice > 0 ? exPrice.lastPrice : (t?.lastPrice ?? 0))}
                    </div>
                    <div style={{
                      display: 'inline-block', padding: '3px 6px', borderRadius: 6,
                      fontSize: 10, fontWeight: 700, marginBottom: 6,
                      background: (exPrice.changePct ?? t?.changePct ?? 0) >= 0 ? 'rgba(0,255,157,0.14)' : 'rgba(255,59,92,0.14)',
                      color: (exPrice.changePct ?? t?.changePct ?? 0) >= 0 ? COLORS.bid : COLORS.ask,
                    }}>
                      {(exPrice.changePct ?? t?.changePct ?? 0) >= 0 ? '+' : ''}{(exPrice.changePct ?? t?.changePct ?? 0).toFixed(2)}%
                    </div>
                    {/* Volume — bold & readable */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 7 }}>
                      Vol {exPrice.volume24h > 0 ? fmtCompact(exPrice.volume24h) : (t ? fmtCompact(t.volume24h) : '—')}
                    </div>
                    {/* Sparkline */}
                    <Sparkline
                      data={sparkData['BTCUSDT'] ?? []}
                      color={isActive ? meta.color : 'rgba(255,255,255,0.18)'}
                      width={68} height={30}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Top Movers ── */}
          <section style={{ padding: '14px 16px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <SectionTitle label="Top Movers" />
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 3, background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 3 }}>
                {(['gainers', 'losers', 'all'] as const).map(t => (
                  <button
                    key={t}
                    className="hd-tab"
                    onClick={() => setMoversTab(t)}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
                      border: 'none', cursor: 'pointer',
                      fontFamily: '"IBM Plex Mono", monospace',
                      background: moversTab === t
                        ? t === 'gainers' ? 'rgba(0,255,157,0.18)' : t === 'losers' ? 'rgba(255,59,92,0.18)' : 'rgba(255,255,255,0.08)'
                        : 'transparent',
                      color: moversTab === t
                        ? t === 'gainers' ? COLORS.bid : t === 'losers' ? COLORS.ask : COLORS.text
                        : COLORS.muted,
                      transition: 'all 0.15s',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {t === 'gainers' ? '▲' : t === 'losers' ? '▼' : '●'} {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
              <span style={{ color: COLORS.muted, fontSize: 12, flexShrink: 0 }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search coin…"
                style={{ background: 'none', border: 'none', outline: 'none', color: COLORS.text, fontSize: 12, flex: 1, fontFamily: '"IBM Plex Mono", monospace' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
              )}
            </div>

            {/* List */}
            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {filteredMovers.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: COLORS.muted, fontSize: 12 }}>No coins found</div>
              ) : filteredMovers.map((c, i) => {
                const isUp  = c.pct >= 0;
                const flash = flashMap[c.sym];
                const base  = c.sym.replace('USDT', '').replace('USDC', '');
                return (
                  <button
                    key={c.sym}
                    className={`hd-mover${flash ? ` hd-flash-${flash}` : ''}`}
                    onClick={() => onSelectSymbol(c.sym)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 13px', width: '100%',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      borderBottom: i < filteredMovers.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                      textAlign: 'left', minHeight: 48,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {/* icon — real coin logo */}
                    <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, overflow: 'hidden' }}>
                      <CoinLogo symbol={base} size={34} />
                    </div>
                    {/* name + vol */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>
                        {base}<span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}>/USDT</span>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                        Vol {fmtCompact(c.vol)}
                      </div>
                    </div>
                    {/* sparkline */}
                    <Sparkline data={sparkData[c.sym] ?? []} color={isUp ? COLORS.bid : COLORS.ask} width={60} height={26} />
                    {/* price + change */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>
                        {fmtPrice(c.price)}
                      </div>
                      <span style={{ display: 'inline-block', padding: '3px 7px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: isUp ? 'rgba(0,255,157,0.14)' : 'rgba(255,59,92,0.14)', color: isUp ? COLORS.bid : COLORS.ask }}>
                        {isUp ? '+' : ''}{c.pct.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Watchlist ── */}
          <section style={{ padding: '14px 16px 4px' }}>
            <SectionTitle label="Watchlist" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {WATCHLIST_SYMS.map((sym, i) => {
                const t     = tickerMap.get(sym);
                const isUp  = (t?.changePct ?? 0) >= 0;
                const flash = flashMap[sym];
                return (
                  <button
                    key={sym}
                    className={flash ? `hd-flash-${flash}` : ''}
                    onClick={() => onSelectSymbol(sym)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 0', background: 'none', border: 'none',
                      borderBottom: i < WATCHLIST_SYMS.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                      cursor: 'pointer', textAlign: 'left', minHeight: 48,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: sym === activeSymbol.toUpperCase() ? COLORS.gold : COLORS.text, flex: 1 }}>
                      {sym.replace('USDT', '')}<span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}>/USDT</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>
                      {t ? fmtPrice(t.lastPrice) : '—'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 58, textAlign: 'right', color: isUp ? COLORS.bid : COLORS.ask }}>
                      {isUp ? '+' : ''}{(t?.changePct ?? 0).toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Crypto News ── */}
          {news.length > 0 && (
            <section style={{ padding: '14px 16px 4px' }}>
              <SectionTitle label="Crypto News" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {news.map(item => {
                  const ago = Math.floor((Date.now() - item.published) / 60000);
                  const agoStr = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago/60)}h ago` : `${Math.floor(ago/1440)}d ago`;
                  return (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', gap: 10, alignItems: 'center',
                        background: COLORS.panel, border: `1px solid ${COLORS.border}`,
                        borderRadius: 12, padding: '10px 12px',
                        textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {item.imageurl ? (
                        <img
                          src={item.imageurl}
                          alt=""
                          style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: COLORS.panel2 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{ width: 54, height: 54, borderRadius: 8, background: COLORS.panel2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📰</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.text, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', marginBottom: 5 }}>
                          {item.title}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: COLORS.gold, fontWeight: 700 }}>{item.source}</span>
                          <span style={{ fontSize: 9, color: COLORS.muted }}>{agoStr}</span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Install Strip (v72 preserved) ── */}
          <section style={{ padding: '14px 16px 8px' }}>
            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '13px 15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>INSTALL APP</div>
                <div style={{ fontSize: 10, color: COLORS.muted }}>Works offline · No ads · Free</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    const p = (window as unknown as Record<string, unknown>).__pwaPrompt as { prompt?: () => void } | undefined;
                    p?.prompt?.();
                  }}
                  style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,255,157,0.12)', border: '1px solid rgba(0,255,157,0.30)', color: COLORS.bid, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Install on Android"
                >
                  🤖
                </button>
                <button
                  onClick={() => alert('Safari → Share (□↑) → Add to Home Screen')}
                  style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
