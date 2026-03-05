import React, { useState, useMemo, useCallback, useRef } from 'react';
import Header             from '@/components/Header';
import OrderBook, { PressureBar } from '@/components/OrderBook';
import CandlestickChart   from '@/components/CandlestickChart';
import DepthChart         from '@/components/DepthChart';
import RecentTrades       from '@/components/RecentTrades';
import MarketData         from '@/components/MarketData';
import LiquidationFeed    from '@/components/LiquidationFeed';

import { useOrderBook }   from '@/hooks/useOrderBook';
import { useTicker }      from '@/hooks/useTicker';
import { useTrades }      from '@/hooks/useTrades';
import { useKline }       from '@/hooks/useKline';
import { useLiquidations } from '@/hooks/useLiquidations';
import { useGlobalStats } from '@/hooks/useGlobalStats';

import { SYMBOLS, type Interval, type Precision, type ConnectionStatus } from '@/types/market';

// ─── Mobile tab ───────────────────────────────────────────────────────────────

type MobileTab = 'book' | 'chart' | 'depth' | 'trades' | 'liqs';

const MOBILE_TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'book',   label: 'Book',   icon: '◫'  },
  { id: 'chart',  label: 'Chart',  icon: '▦'  },
  { id: 'depth',  label: 'Depth',  icon: '◈'  },
  { id: 'trades', label: 'Trades', icon: '⚡' },
  { id: 'liqs',   label: 'Liqs',   icon: '💀' },
];

const MobileTabBtn: React.FC<{
  tab: typeof MOBILE_TABS[number];
  active: boolean;
  onClick: () => void;
}> = React.memo(({ tab, active, onClick }) => (
  <button
    aria-label={tab.label}
    onClick={onClick}
    style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '2px',
      padding: '6px 2px', border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', minHeight: '52px',
      background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
      color:      active ? 'var(--text-primary)'    : 'var(--text-muted)',
      borderTop:  active ? '2px solid var(--bid-color)' : '2px solid transparent',
      fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
      transition: 'color 120ms, background 120ms',
    }}
  >
    <span style={{ fontSize: '15px', lineHeight: 1 }}>{tab.icon}</span>
    <span>{tab.label}</span>
  </button>
));
MobileTabBtn.displayName = 'MobileTabBtn';

// ─── Connection Banner ────────────────────────────────────────────────────────

const ConnectionBanner: React.FC<{ status: ConnectionStatus; onRetry: () => void }> = React.memo(
  ({ status, onRetry }) => {
    if (status === 'connected') return null;
    const isReconn = status === 'reconnecting';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 16px', flexShrink: 0,
        background: isReconn ? 'rgba(242,142,44,0.08)' : 'rgba(239,83,80,0.08)',
        borderBottom: `1px solid ${isReconn ? 'rgba(242,142,44,0.15)' : 'rgba(239,83,80,0.15)'}`,
        color: isReconn ? 'var(--gold)' : 'var(--ask-color)',
        fontSize: '10px', fontWeight: 700,
      }}>
        <div
          className="live-dot"
          style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}
        />
        {isReconn ? 'Reconnecting to Binance...' : 'Connection lost — data may be stale'}
        {!isReconn && (
          <button
            onClick={onRetry}
            style={{
              marginLeft: '4px', padding: '2px 10px',
              border: '1px solid var(--ask-color)', borderRadius: '2px',
              background: 'transparent', color: 'var(--ask-color)',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '9px', fontWeight: 700,
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }
);
ConnectionBanner.displayName = 'ConnectionBanner';

// ─── Main ─────────────────────────────────────────────────────────────────────

const Index: React.FC = () => {
  const [activeSymbol, setActiveSymbol] = useState('btcusdt');
  const [interval, setIntervalState]    = useState<Interval>('15m');
  const [precision, setPrecision]       = useState<Precision>('0.01');
  const [mobileTab, setMobileTab]       = useState<MobileTab>('book');
  const prevMidRef                      = useRef<number | null>(null);

  const symbolInfo = useMemo(
    () => SYMBOLS.find((s) => s.symbol === activeSymbol)!,
    [activeSymbol]
  );

  const { bids, asks, status: obStatus, lastUpdate, retry: obRetry } = useOrderBook(activeSymbol);
  const { ticker, status: tickerStatus }                              = useTicker(activeSymbol);
  const { trades }                                                    = useTrades(activeSymbol);
  const { candles }                                                   = useKline(activeSymbol, interval);
  const { events: liqEvents, stats: liqStats, wsStatus: liqStatus }  = useLiquidations();
  const globalStats                                                   = useGlobalStats();

  const midPrice = useMemo(() => {
    if (!bids.length || !asks.length) return null;
    return (bids[0].price + asks[0].price) / 2;
  }, [bids, asks]);

  const prevMidPrice = useMemo(() => {
    const prev = prevMidRef.current;
    prevMidRef.current = midPrice;
    return prev;
  }, [midPrice]);

  const overallStatus: ConnectionStatus = useMemo(() => {
    if (obStatus === 'connected' && tickerStatus === 'connected') return 'connected';
    if (obStatus === 'disconnected' || tickerStatus === 'disconnected') return 'disconnected';
    return 'reconnecting';
  }, [obStatus, tickerStatus]);

  const bidPressure = useMemo(() => {
    const bv = bids.reduce((s, b) => s + b.size, 0);
    const av = asks.reduce((s, a) => s + a.size, 0);
    const t  = bv + av;
    return t > 0 ? (bv / t) * 100 : 50;
  }, [bids, asks]);

  const handleSymbolChange   = useCallback((sym: string) => {
    setActiveSymbol(sym);
    prevMidRef.current = null;
  }, []);
  const handleIntervalChange  = useCallback((i: Interval) => setIntervalState(i), []);
  const handlePrecisionChange = useCallback((p: Precision) => setPrecision(p), []);

  return (
    <div
      className="scanline-overlay"
      style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--app-bg)', overflow: 'hidden' }}
    >
      <Header
        symbols={SYMBOLS}
        activeSymbol={activeSymbol}
        onSymbolChange={handleSymbolChange}
        status={overallStatus}
        lastUpdate={lastUpdate}
        ticker={ticker}
        globalStats={globalStats}
      />

      <ConnectionBanner status={overallStatus} onRetry={obRetry} />

      {/* ── Desktop layout: 4-col ── */}
      <div
        className="desktop-layout"
        style={{
          flex: 1, display: 'flex', gap: '1px',
          overflow: 'hidden',
          background: 'var(--border-subtle)',
        }}
      >
        {/* Col 1: Order Book */}
        <div style={{ width: '280px', flexShrink: 0, background: 'var(--app-bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <OrderBook
            bids={bids} asks={asks}
            midPrice={midPrice} prevMidPrice={prevMidPrice}
            precision={precision} onPrecisionChange={handlePrecisionChange}
          />
        </div>

        {/* Col 2: Candle + Depth */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, background: 'var(--app-bg)' }}>
          <div style={{ flex: 65, minHeight: 0, background: 'var(--app-bg)' }}>
            <CandlestickChart
              candles={candles}
              interval={interval}
              onIntervalChange={handleIntervalChange}
              symbol={activeSymbol}
            />
          </div>
          <div style={{ flex: 35, minHeight: 0, background: 'var(--app-bg)' }}>
            <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
          </div>
        </div>

        {/* Col 3: Market data + Recent trades */}
        <div style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--app-bg)' }}>
          <div style={{ flexShrink: 0, background: 'var(--app-bg)' }}>
            <MarketData ticker={ticker} symbolInfo={symbolInfo} />
          </div>
          <div style={{ flex: 1, minHeight: 0, background: 'var(--app-bg)', overflow: 'hidden' }}>
            <RecentTrades trades={trades} />
          </div>
        </div>

        {/* Col 4: Liquidation feed */}
        <div style={{ width: '220px', flexShrink: 0, background: 'var(--app-bg)', overflow: 'hidden' }}>
          <LiquidationFeed events={liqEvents} stats={liqStats} wsStatus={liqStatus} />
        </div>
      </div>

      {/* ── Tablet 768–1279: hide col 3+4 ── */}
      <style>{`
        @media (min-width: 768px) and (max-width: 1279px) {
          .desktop-layout > div:nth-child(3),
          .desktop-layout > div:nth-child(4) { display: none !important; }
          .desktop-layout > div:first-child   { width: 260px !important; }
        }
      `}</style>

      {/* ── Mobile layout ── */}
      <div
        className="mobile-only"
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {mobileTab === 'book' && (
            <OrderBook bids={bids} asks={asks}
              midPrice={midPrice} prevMidPrice={prevMidPrice}
              precision={precision} onPrecisionChange={handlePrecisionChange}
              compact levels={15}
            />
          )}
          {mobileTab === 'chart' && (
            <CandlestickChart candles={candles} interval={interval} onIntervalChange={handleIntervalChange} symbol={activeSymbol} />
          )}
          {mobileTab === 'depth' && (
            <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
          )}
          {mobileTab === 'trades' && (
            <RecentTrades trades={trades} />
          )}
          {mobileTab === 'liqs' && (
            <LiquidationFeed events={liqEvents} stats={liqStats} wsStatus={liqStatus} />
          )}
        </div>

        {mobileTab === 'book' && <PressureBar bidPercent={bidPressure} />}

        <div style={{
          display: 'flex',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--panel-bg)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          flexShrink: 0,
        }}>
          {MOBILE_TABS.map((tab) => (
            <MobileTabBtn
              key={tab.id}
              tab={tab}
              active={mobileTab === tab.id}
              onClick={() => setMobileTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Desktop/mobile show-hide ── */}
      <style>{`
        @media (max-width: 767px) {
          .desktop-layout { display: none !important; }
        }
        @media (min-width: 768px) {
          .mobile-only { display: none !important; }
        }
        .desktop-layout { display: flex; }
      `}</style>
    </div>
  );
};

export default Index;
