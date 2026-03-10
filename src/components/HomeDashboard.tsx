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
  { sym: 'BTCUSDT',  label: 'BTC'  },
  { sym: 'ETHUSDT',  label: 'ETH'  },
  { sym: 'SOLUSDT',  label: 'SOL'  },
  { sym: 'BNBUSDT',  label: 'BNB'  },
  { sym: 'XRPUSDT',  label: 'XRP'  },
  { sym: 'DOGEUSDT', label: 'DOGE' },
  { sym: 'AVAXUSDT', label: 'AVAX' },
  { sym: 'LINKUSDT', label: 'LINK' },
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

// ── v79: Onboarding steps — concise, trader-focused ─────────────────────────
interface OnboardStep {
  accent: string;
  icon: string;
  title: string;
  desc: string;
  hint: string;
}

const STEPS: OnboardStep[] = [
  {
    accent: 'rgba(242,162,33,1)',
    icon: '⚡',
    title: 'Real-Time Order Book',
    desc: 'Bybit · Binance · OKX — live bid/ask depth, trades & liquidations. Sub-100ms latency via direct WS.',
    hint: 'Tap exchange card to switch feed instantly',
  },
  {
    accent: 'rgba(0,255,157,1)',
    icon: '📊',
    title: 'Market Heatmap',
    desc: '8 major coins. Color intensity = % move strength. Volume bar = relative liquidity. Tap any cell to open chart.',
    hint: 'Brighter = bigger move',
  },
  {
    accent: 'rgba(255,59,92,1)',
    icon: '🔥',
    title: 'Top Movers',
    desc: 'Filter Gainers / Losers / All. Min $1M volume — no low-cap noise. Search any pair instantly.',
    hint: 'Tap coin → switch to that chart',
  },
  {
    accent: 'rgba(0,200,255,1)',
    icon: '💎',
    title: 'PRO Features',
    desc: 'Depth Chart, Liquidation Feed & Market Data locked behind one-time $9 lifetime access. No subscription.',
    hint: 'Tap any locked panel → Unlock PRO',
  },
];

const OnboardingOverlay = memo(({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(5,7,15,0.98)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 20px',
        fontFamily: '"IBM Plex Mono", monospace',
      }}
    >
      {/* Header — logo + brand */}
      <div style={{ marginBottom: 32, textAlign: 'center' as const }}>
        <svg width="52" height="52" viewBox="0 0 32 32" style={{ marginBottom: 6 }}>
          <rect width="32" height="32" rx="6" fill="rgba(13,16,23,1)" />
          <g transform="translate(-7.099,-8.713) scale(0.08408)">
            <g transform="translate(244.1875,167.25)">
              <path fill="white" d="M0 0 C1.8125 0.75 1.8125 0.75 2.8125 2.75 C3.82029164 8.59519152 3.77238544 14.17389546 3.48828125 20.08203125 C3.39836749 22.43812024 3.31293905 24.79433429 3.22875977 27.15063477 C3.15977554 28.75415277 3.07100069 30.35694557 2.9621582 31.95825195 C2.12383386 42.2805402 2.12383386 42.2805402 6.37451172 51.31396484 C8.38433723 53.4085528 10.51829653 55.25577556 12.7722168 57.08081055 C23.11283881 65.50915826 27.41261445 81.05589217 28.8125 93.75 C29.8540625 93.82476562 30.895625 93.89953125 31.96875 93.9765625 C48.31810674 95.38068373 61.25949855 100.61869098 74.8125 109.75 C75.8025 110.41 76.7925 111.07 77.8125 111.75 C78.08344482 110.88217896 78.08344482 110.88217896 78.35986328 109.99682617 C84.3340793 91.03067165 91.35771148 71.94816718 109.3984375 61.2109375 C116.818793 57.40048467 123.22335294 55.37633693 131.5625 55.4375 C132.36236328 55.44313965 133.16222656 55.4487793 133.98632812 55.45458984 C145.2024149 55.68465174 154.70118805 59.15498854 163.078125 66.82421875 C169.18470355 73.3039771 172.94760503 79.47653418 173.25 88.5 C173.08127879 92.6598505 172.69539935 95.55821858 169.8125 98.75 C166.1373086 100.95511484 163.56323822 101.11137924 159.3828125 100.56640625 C155.10632198 99.20806807 151.93027126 96.46983995 148.48828125 93.66015625 C143.35849931 89.99816593 138.02500915 89.02462228 131.8125 89.75 C125.2509624 91.13005571 120.87102871 94.487839 116.8125 99.75 C108.76263984 112.4732512 103.51300368 131.69200794 105.8125 146.75 C106.54497368 148.46787336 107.28006866 150.18490802 108.04858398 151.88696289 C115.40860711 169.83657505 112.46237359 190.96011363 105.27124023 208.35107422 C98.7525877 223.33517927 88.37336766 234.90107614 74.375 243.25 C73.73256348 243.63486572 73.09012695 244.01973145 72.42822266 244.41625977 C70.26323927 245.63123631 68.05547684 246.68530512 65.8125 247.75 C64.98751511 248.17595963 64.16253021 248.60191925 63.31254578 249.04078674 C51.11028677 254.4068821 38.09982637 253.43137642 25.01578236 253.32283282 C21.52809877 253.29875641 18.04042522 253.30194602 14.55267334 253.30152893 C8.71270139 253.29692701 2.87305943 253.27344385 -2.96679688 253.23706055 C-9.71879713 253.19510673 -16.47050242 253.17773081 -23.22262549 253.1744408 C-30.43144532 253.17084695 -37.6401594 253.15200782 -44.84893513 253.12732053 C-54.91834944 253.10730877 -58.76721162 253.08294474 -62.61621094 253.05639648 C-67.66210373 253.03941963 -67.66210373 253.03941963 -69.25775146 253.02415466 C-72.01272202 253.01006222 -74.1875 252.75 -74.1875 252.75 C-76.1875 250.75 -77.44122824 243.1311899 -76.30071581 237.2760436 C-71.953125 230.9375 -69.31589831 227.6701395 -66.68370793 225.08080529 C-63.1875 222.75 -61.375 221.5 -53.7453267 217.20830877 C-44.64303115 218.42162986 -36.1875 218.75 C-36.66960937 217.71101562 -37.15171875 216.67203125 -37.6484375 215.6015625 C-38.28700564 214.19295632 -38.92499529 212.78408779 -39.5625 211.375 C-40.5234375 209.31640625 -44.70919025 199.98566574 -45.57585228 190.83680584 C-45.5625 180.6875 -45.56420898 177.39208984 -45.42342264 166.9615913 C-43.47435948 157.61057844 -40.1875 147.75 C-43.78125 147.85546875 -66.38189904 148.31819249 -88.23564577 143.89462307 C-105.1875 127.75 -111.77819367 119.962672 -112.82206639 112.79195713 C-112.1875 102.75 -111.47093929 98.73547772 -110.39007055 94.8938857 C-109.1875 91 -108.23608398 87.85107422 -104.10216937 74.67352051 C-98.59241368 63.03423487 -89.1875 52.75 C-88.0840625 51.48671875 -87.515625 50.8359375 -78.59704746 41.19537987 C-64.38890246 33.11157963 -51.1875 31.75 C-41.19634717 31.63121311 -36.1875 31.75 C-35.375 30.0078125 -30.09030803 19.95994422 -12.8051388 -1.46344443 Z" />
            </g>
          </g>
        </svg>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: COLORS.gold }}>
          ZERØ ORDER BOOK
        </div>
      </div>

      {/* Step card */}
      <div style={{
        background: COLORS.panel,
        border: `1px solid ${s.accent.replace(',1)', ',0.30)')}`,
        borderTop: `2px solid ${s.accent}`,
        borderRadius: 18,
        padding: '28px 24px 24px',
        maxWidth: 320, width: '100%',
        textAlign: 'center' as const,
        boxShadow: `0 0 40px ${s.accent.replace(',1)', ',0.08)')}`,
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        {/* Icon */}
        <div style={{ fontSize: 44, marginBottom: 16, lineHeight: 1 }}>{s.icon}</div>

        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, marginBottom: 10, letterSpacing: '-0.02em' }}>
          {s.title}
        </div>

        {/* Desc */}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, marginBottom: 16 }}>
          {s.desc}
        </div>

        {/* Hint chip */}
        <div style={{
          display: 'inline-block',
          background: s.accent.replace(',1)', ',0.10)'),
          border: `1px solid ${s.accent.replace(',1)', ',0.25)')}`,
          borderRadius: 20, padding: '5px 12px',
          fontSize: 10, color: s.accent,
          letterSpacing: '0.03em',
        }}>
          {s.hint}
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 7, margin: '22px 0 20px' }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            onClick={() => setStep(i)}
            style={{
              width: i === step ? 22 : 7, height: 7,
              borderRadius: 4,
              background: i === step ? s.accent : COLORS.border,
              transition: 'all 0.3s',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
        {!isLast && (
          <button
            onClick={onDone}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              border: `1px solid ${COLORS.border}`, background: 'transparent',
              color: 'rgba(255,255,255,0.30)', fontSize: 11,
              fontFamily: '"IBM Plex Mono", monospace', cursor: 'pointer',
            }}
          >
            Skip
          </button>
        )}
        <button
          onClick={() => isLast ? onDone() : setStep(s => s + 1)}
          style={{
            flex: isLast ? 1 : 2,
            padding: '13px 0',
            borderRadius: 10, border: 'none',
            background: isLast ? COLORS.gold : s.accent,
            color: 'rgba(0,0,0,1)',
            fontSize: 13, fontWeight: 800,
            fontFamily: '"IBM Plex Mono", monospace',
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          {isLast ? 'Start Trading →' : 'Next →'}
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
}: { tickerMap: TickerMap; onSelectSymbol: (s: string) => void }) => {
  // Relative intensity: compare each coin against the biggest mover in the group
  const maxPct = useMemo(() => {
    let m = 1;
    HEATMAP_COINS.forEach(({ sym }) => {
      const t = tickerMap.get(sym.toUpperCase());
      if (t) m = Math.max(m, Math.abs(t.changePct));
    });
    return m;
  }, [tickerMap]);

  const maxVol = useMemo(() => {
    let m = 1;
    HEATMAP_COINS.forEach(({ sym }) => {
      const t = tickerMap.get(sym.toUpperCase());
      if (t) m = Math.max(m, t.volume24h);
    });
    return m;
  }, [tickerMap]);

  return (
    <div>
      <SectionTitle label="Heatmap" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {HEATMAP_COINS.map(({ sym, label }) => {
          const t          = tickerMap.get(sym.toUpperCase());
          const pct        = t?.changePct ?? 0;
          const int        = Math.min(Math.abs(pct) / maxPct, 1);
          const isUp       = pct >= 0;
          const isExtreme  = Math.abs(pct) >= 5;
          const c          = isUp ? COLORS.bid : COLORS.ask;
          const bg         = isUp
            ? `rgba(0,255,157,${0.04 + int * 0.22})`
            : `rgba(255,59,92,${0.04 + int * 0.22})`;
          const bd         = isUp
            ? `rgba(0,255,157,${0.12 + int * 0.38})`
            : `rgba(255,59,92,${0.12 + int * 0.38})`;
          const glow       = isExtreme
            ? `0 0 16px ${isUp ? 'rgba(0,255,157,0.22)' : 'rgba(255,59,92,0.22)'}`
            : 'none';
          const volPct     = t ? Math.min(t.volume24h / maxVol, 1) : 0;

          return (
            <button
              key={sym}
              onClick={() => onSelectSymbol(sym)}
              style={{
                background: bg, border: `1px solid ${bd}`,
                borderRadius: 12, padding: '11px 11px 9px',
                cursor: 'pointer', textAlign: 'left' as const,
                minHeight: 82, transition: 'all 0.2s',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: glow,
                position: 'relative' as const,
                overflow: 'hidden' as const,
              }}
            >
              {/* Volume bar — bottom strip, width = relative volume */}
              <div style={{
                position: 'absolute' as const,
                bottom: 0, left: 0,
                width: `${volPct * 100}%`, height: 3,
                background: isUp
                  ? `rgba(0,255,157,${0.25 + int * 0.50})`
                  : `rgba(255,59,92,${0.25 + int * 0.50})`,
                borderRadius: '0 0 12px 0',
                transition: 'width 0.6s',
              }} />
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 13, fontWeight: 800, color: COLORS.text, marginBottom: 3, letterSpacing: '-0.02em' }}>
                {label}
              </div>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 9.5, color: COLORS.muted, marginBottom: 7 }}>
                {t ? fmtPrice(t.lastPrice) : '—'}
              </div>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 14, fontWeight: 800, color: c, letterSpacing: '-0.03em' }}>
                {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
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
  onRefresh?:       () => Promise<void>;
}

const HomeDashboard = memo(({
  tickerMap,
  globalStats,
  activeSymbol,
  currentExchange,
  onSelectExchange,
  onSelectSymbol,
  onRefresh,
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
  // PTR: delegate to parent refetch (tickers REST + globalStats query invalidate)
  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    } else {
      await new Promise<void>(r => setTimeout(r, 600));
    }
  }, [onRefresh]);

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
