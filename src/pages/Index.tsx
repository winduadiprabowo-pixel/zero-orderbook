import React, { useState, useMemo, useCallback, useRef } from 'react';
import Header                from '@/components/Header';
import OrderBook, { PressureBar } from '@/components/OrderBook';
import TradingViewChart      from '@/components/TradingViewChart';
import DepthChart            from '@/components/DepthChart';
import RecentTrades          from '@/components/RecentTrades';
import MarketData            from '@/components/MarketData';
import LiquidationFeed       from '@/components/LiquidationFeed';

import { useOrderBook }      from '@/hooks/useOrderBook';
import { useTicker }         from '@/hooks/useTicker';
import { useTrades }         from '@/hooks/useTrades';
import { useLiquidations }   from '@/hooks/useLiquidations';
import { useGlobalStats }    from '@/hooks/useGlobalStats';

import { SYMBOLS, type Interval, type Precision, type ConnectionStatus } from '@/types/market';

type MobileTab = 'book' | 'chart' | 'depth' | 'trades' | 'liqs';
const MOBILE_TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'book',   label: 'BOOK',   icon: '◫'  },
  { id: 'chart',  label: 'CHART',  icon: '▦'  },
  { id: 'depth',  label: 'DEPTH',  icon: '◈'  },
  { id: 'trades', label: 'TRADES', icon: '⚡' },
  { id: 'liqs',   label: 'LIQS',   icon: '💀' },
];

const MobileTabBtn: React.FC<{
  tab: typeof MOBILE_TABS[number]; active: boolean; onClick: () => void;
}> = React.memo(({ tab, active, onClick }) => (
  <button aria-label={tab.label} onClick={onClick} style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '2px', padding: '6px 2px', border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', minHeight: '52px',
    background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
    color:      active ? 'var(--text-primary)'    : 'var(--text-muted)',
    borderTop:  active ? '2px solid var(--bid-color)' : '2px solid transparent',
    fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    transition: 'color 120ms, background 120ms',
  }}>
    <span style={{ fontSize: '15px', lineHeight: 1 }}>{tab.icon}</span>
    <span>{tab.label}</span>
  </button>
));
MobileTabBtn.displayName = 'MobileTabBtn';

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
        <div className="live-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
        {isReconn ? 'Reconnecting to Binance...' : 'Connection lost — data may be stale'}
        {!isReconn && (
          <button onClick={onRetry} style={{
            marginLeft: '4px', padding: '2px 10px',
            border: '1px solid var(--ask-color)', borderRadius: '2px',
            background: 'transparent', color: 'var(--ask-color)',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
          }}>Retry</button>
        )}
      </div>
    );
  }
);
ConnectionBanner.displayName = 'ConnectionBanner';

const PanelHeader: React.FC<{ title: string; right?: React.ReactNode }> = React.memo(({ title, right }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--panel-bg)', flexShrink: 0,
  }}>
    <span className="label-sm">{title}</span>
    {right}
  </div>
));
PanelHeader.displayName = 'PanelHeader';

type TabletBottomTab = 'depth' | 'stats' | 'liqs';
const TABLET_BOTTOM_TABS: { id: TabletBottomTab; label: string }[] = [
  { id: 'depth', label: 'DEPTH' },
  { id: 'stats', label: 'MARKET STATS' },
  { id: 'liqs',  label: 'LIQUIDATIONS' },
];

const Index: React.FC = () => {
  const [activeSymbol,  setActiveSymbol]  = useState('btcusdt');
  const [interval,      setIntervalState] = useState<Interval>('15m');
  const [precision,     setPrecision]     = useState<Precision>('0.01');
  const [mobileTab,     setMobileTab]     = useState<MobileTab>('chart');
  const [tabletBottom,  setTabletBottom]  = useState<TabletBottomTab>('depth');
  const prevMidRef = useRef<number | null>(null);

  const symbolInfo = useMemo(() => SYMBOLS.find((s) => s.symbol === activeSymbol)!, [activeSymbol]);

  const { bids, asks, status: obStatus, lastUpdate, retry: obRetry } = useOrderBook(activeSymbol);
  const { ticker, status: tickerStatus }                              = useTicker(activeSymbol);
  const { trades }                                                    = useTrades(activeSymbol);
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

  const handleSymbolChange    = useCallback((sym: string) => { setActiveSymbol(sym); prevMidRef.current = null; }, []);
  const handleIntervalChange  = useCallback((i: Interval) => setIntervalState(i), []);
  const handlePrecisionChange = useCallback((p: Precision) => setPrecision(p), []);

  const P: React.CSSProperties = { background: 'var(--panel-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' };

  return (
    <div className="scanline-overlay" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--app-bg)', overflow: 'hidden' }}>

      <Header symbols={SYMBOLS} activeSymbol={activeSymbol} onSymbolChange={handleSymbolChange}
        status={overallStatus} lastUpdate={lastUpdate} ticker={ticker} globalStats={globalStats} />
      <ConnectionBanner status={overallStatus} onRetry={obRetry} />

      {/* ══ DESKTOP ≥1280px ══ */}
      <div className="layout-desktop" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '1px', background: 'var(--border-subtle)' }}>
        {/* Top row: Chart | OrderBook | Trades+Liqs */}
        <div style={{ flex: '0 0 66%', display: 'flex', gap: '1px', minHeight: 0 }}>
          {/* Chart */}
          <div style={{ ...P, flex: 1, minWidth: 0 }}>
            <TradingViewChart symbol={activeSymbol} interval={interval} onIntervalChange={handleIntervalChange} />
          </div>
          {/* Order Book */}
          <div style={{ ...P, width: '260px', flexShrink: 0 }}>
            <OrderBook bids={bids} asks={asks} midPrice={midPrice} prevMidPrice={prevMidPrice}
              precision={precision} onPrecisionChange={handlePrecisionChange} levels={20} />
          </div>
          {/* Trades + Liqs stacked */}
          <div style={{ ...P, width: '215px', flexShrink: 0, gap: '1px' }}>
            <div style={{ ...P, flex: 1, minHeight: 0 }}>
              <RecentTrades trades={trades} />
            </div>
            <div style={{ ...P, flex: 1, minHeight: 0 }}>
              <LiquidationFeed events={liqEvents} stats={liqStats} wsStatus={liqStatus} />
            </div>
          </div>
        </div>
        {/* Bottom row: Depth | MarketData */}
        <div style={{ flex: '0 0 34%', display: 'flex', gap: '1px', minHeight: 0 }}>
          <div style={{ ...P, flex: 1, minWidth: 0 }}>
            <PanelHeader title="DEPTH CHART" />
            <div style={{ flex: 1, minHeight: 0 }}>
              <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
            </div>
          </div>
          <div style={{ ...P, width: '475px', flexShrink: 0, overflowY: 'auto' }} className="hide-scrollbar">
            <MarketData ticker={ticker} symbolInfo={symbolInfo} />
          </div>
        </div>
      </div>

      {/* ══ TABLET 768–1279px ══ */}
      <div className="layout-tablet" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '1px', background: 'var(--border-subtle)' }}>
        {/* Top: Chart | OrderBook */}
        <div style={{ flex: '0 0 60%', display: 'flex', gap: '1px', minHeight: 0 }}>
          <div style={{ ...P, flex: 1, minWidth: 0 }}>
            <TradingViewChart symbol={activeSymbol} interval={interval} onIntervalChange={handleIntervalChange} />
          </div>
          <div style={{ ...P, width: '235px', flexShrink: 0 }}>
            <OrderBook bids={bids} asks={asks} midPrice={midPrice} prevMidPrice={prevMidPrice}
              precision={precision} onPrecisionChange={handlePrecisionChange} levels={16} />
          </div>
        </div>
        {/* Bottom: tabs */}
        <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            {TABLET_BOTTOM_TABS.map((t) => (
              <button key={t.id} onClick={() => setTabletBottom(t.id)} style={{
                padding: '7px 16px', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
                letterSpacing: '0.07em', textTransform: 'uppercase', background: 'transparent',
                color: tabletBottom === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: tabletBottom === t.id ? '2px solid var(--gold)' : '2px solid transparent',
                transition: 'all 120ms',
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '1px' }}>
            {tabletBottom === 'depth' && (
              <div style={{ ...P, flex: 1 }}>
                <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
              </div>
            )}
            {tabletBottom === 'stats' && (
              <>
                <div style={{ ...P, flex: 1, overflowY: 'auto' }} className="hide-scrollbar">
                  <MarketData ticker={ticker} symbolInfo={symbolInfo} />
                </div>
                <div style={{ ...P, flex: 1 }}>
                  <RecentTrades trades={trades} />
                </div>
              </>
            )}
            {tabletBottom === 'liqs' && (
              <div style={{ ...P, flex: 1 }}>
                <LiquidationFeed events={liqEvents} stats={liqStats} wsStatus={liqStatus} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ MOBILE <768px ══ */}
      <div className="layout-mobile" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--app-bg)' }}>
          {mobileTab === 'chart'  && <TradingViewChart symbol={activeSymbol} interval={interval} onIntervalChange={handleIntervalChange} />}
          {mobileTab === 'book'   && <OrderBook bids={bids} asks={asks} midPrice={midPrice} prevMidPrice={prevMidPrice} precision={precision} onPrecisionChange={handlePrecisionChange} compact levels={15} />}
          {mobileTab === 'depth'  && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <PanelHeader title="DEPTH CHART" />
              <div style={{ flex: 1, minHeight: 0 }}><DepthChart bids={bids} asks={asks} midPrice={midPrice} /></div>
            </div>
          )}
          {mobileTab === 'trades' && <RecentTrades trades={trades} />}
          {mobileTab === 'liqs'   && <LiquidationFeed events={liqEvents} stats={liqStats} wsStatus={liqStatus} />}
        </div>
        {mobileTab === 'book' && <PressureBar bidPercent={bidPressure} />}
        <div style={{ display: 'flex', borderTop: '1px solid var(--border-subtle)', background: 'var(--panel-bg)', paddingBottom: 'env(safe-area-inset-bottom)', flexShrink: 0 }}>
          {MOBILE_TABS.map((tab) => (
            <MobileTabBtn key={tab.id} tab={tab} active={mobileTab === tab.id} onClick={() => setMobileTab(tab.id)} />
          ))}
        </div>
      </div>

      <style>{`
        .layout-desktop { display: flex; }
        .layout-tablet  { display: none !important; }
        .layout-mobile  { display: none !important; }
        @media (max-width: 1279px) and (min-width: 768px) {
          .layout-desktop { display: none !important; }
          .layout-tablet  { display: flex !important; }
          .layout-mobile  { display: none !important; }
        }
        @media (max-width: 767px) {
          .layout-desktop { display: none !important; }
          .layout-tablet  { display: none !important; }
          .layout-mobile  { display: flex !important; }
        }
      `}</style>
    </div>
  );
};

export default Index;
