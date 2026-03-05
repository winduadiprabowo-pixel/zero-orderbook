/**
 * Index.tsx — ZERØ ORDER BOOK v25
 * Layout: Sidebar kiri collapsible + react-resizable-panels
 * Performance: @500ms WS · no per-row state · RAF-gated
 * 500+ real Binance pairs · Smart precision · PRO CTA atbwr ✓
 * Desktop ≥1280 · Tablet 768–1279 · Mobile <768
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';

import Header        from '@/components/Header';
import MarketSidebar from '@/components/MarketSidebar';
import OrderBook, { PressureBar } from '@/components/OrderBook';
import TradingViewChart           from '@/components/TradingViewChart';
import DepthChart                 from '@/components/DepthChart';
import RecentTrades               from '@/components/RecentTrades';
import MarketData                 from '@/components/MarketData';
import LiquidationFeed            from '@/components/LiquidationFeed';
import ResizeHandle               from '@/components/ResizeHandle';
import SymbolSearch               from '@/components/SymbolSearch';


import { useOrderBook }    from '@/hooks/useOrderBook';
import { useTicker }       from '@/hooks/useTicker';
import { useTrades }       from '@/hooks/useTrades';
import { useLiquidations } from '@/hooks/useLiquidations';
import { useGlobalStats }  from '@/hooks/useGlobalStats';
import { useMarketPairs }  from '@/hooks/useMarketPairs';

import {
  PINNED_SYMBOLS,
  getSmartPriceDec,
  type Interval,
  type Precision,
  type ConnectionStatus,
} from '@/types/market';

// ── Mobile tab config ─────────────────────────────────────────────────────────

type MobileTab = 'book' | 'chart' | 'depth' | 'trades' | 'liqs';

const MOBILE_TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'chart',  label: 'CHART',  icon: '▦'  },
  { id: 'book',   label: 'BOOK',   icon: '◫'  },
  { id: 'depth',  label: 'DEPTH',  icon: '◈'  },
  { id: 'trades', label: 'TRADES', icon: '⚡' },
  { id: 'liqs',   label: 'LIQS',   icon: '💀' },
];

type TabletBottomTab = 'depth' | 'stats' | 'liqs';
const TABLET_BOTTOM_TABS: { id: TabletBottomTab; label: string }[] = [
  { id: 'depth', label: 'DEPTH'     },
  { id: 'stats', label: 'MKT STATS' },
  { id: 'liqs',  label: 'LIQS'      },
];

// ── Precision options ─────────────────────────────────────────────────────────

function getPrecisionOptions(priceDec: number): Precision[] {
  if (priceDec >= 7) return ['0.00000001', '0.0000001', '0.000001'];
  if (priceDec >= 5) return ['0.000001',   '0.00001',   '0.0001'  ];
  if (priceDec >= 3) return ['0.001',       '0.0001',    '0.00001' ];
  if (priceDec >= 1) return ['0.1',          '0.01',      '0.001'  ];
  return ['0.1', '0.01', '0.001'];
}

// ── Sub-components ────────────────────────────────────────────────────────────

const MobileTabBtn: React.FC<{
  tab: typeof MOBILE_TABS[number]; active: boolean; onClick: () => void;
}> = React.memo(({ tab, active, onClick }) => (
  <button
    aria-label={tab.label}
    onClick={onClick}
    style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '3px', padding: '7px 2px 6px',
      border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', minHeight: '54px',
      background:  active ? 'rgba(255,255,255,0.05)' : 'transparent',
      color:       active ? 'rgba(255,255,255,0.92)'  : 'rgba(255,255,255,0.28)',
      borderTop:   active ? '2px solid rgba(242,142,44,1)' : '2px solid transparent',
      fontSize: '8px', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.07em',
      transition: 'color 120ms, background 120ms',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    <span style={{ fontSize: '16px', lineHeight: 1 }}>{tab.icon}</span>
    <span>{tab.label}</span>
  </button>
));
MobileTabBtn.displayName = 'MobileTabBtn';

const ConnectionBanner: React.FC<{
  status: ConnectionStatus; onRetry: () => void;
}> = React.memo(({ status, onRetry }) => {
  if (status === 'connected') return null;
  const isReconn = status === 'reconnecting';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '5px 16px', flexShrink: 0,
      background:   isReconn ? 'rgba(242,142,44,0.07)' : 'rgba(239,83,80,0.07)',
      borderBottom: `1px solid ${isReconn ? 'rgba(242,142,44,0.14)' : 'rgba(239,83,80,0.14)'}`,
      color:        isReconn ? 'rgba(242,142,44,1)'    : 'rgba(239,83,80,1)',
      fontSize: '10px', fontWeight: 700,
    }}>
      <div className="live-dot" style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: 'currentColor', flexShrink: 0,
      }} />
      {isReconn ? 'Reconnecting to Binance...' : 'Connection lost — data may be stale'}
      {!isReconn && (
        <button onClick={onRetry} style={{
          marginLeft: '4px', padding: '2px 10px',
          border: '1px solid rgba(239,83,80,1)', borderRadius: '2px',
          background: 'transparent', color: 'rgba(239,83,80,1)',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
        }}>Retry</button>
      )}
    </div>
  );
});
ConnectionBanner.displayName = 'ConnectionBanner';

const PanelHeader: React.FC<{ title: string; right?: React.ReactNode }> = React.memo(
  ({ title, right }) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(16,19,28,1)', flexShrink: 0,
    }}>
      <span className="label-sm">{title}</span>
      {right}
    </div>
  )
);
PanelHeader.displayName = 'PanelHeader';

// ── Main ──────────────────────────────────────────────────────────────────────

const Index: React.FC = () => {
  const [activeSymbol,  setActiveSymbol]  = useState('btcusdt');
  const [interval,      setIntervalState] = useState<Interval>('15m');
  const [precision,     setPrecision]     = useState<Precision>('0.01');
  const [mobileTab,     setMobileTab]     = useState<MobileTab>('chart');
  const [tabletBottom,  setTabletBottom]  = useState<TabletBottomTab>('depth');
  const [showMarkets,   setShowMarkets]   = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const prevMidRef = useRef<number | null>(null);

  const { pairs, loading: pairsLoading, error: pairsError } = useMarketPairs();

  const symbolInfo = useMemo(() => {
    const found = pairs.find((s) => s.symbol === activeSymbol);
    return found ?? PINNED_SYMBOLS.find((s) => s.symbol === activeSymbol) ?? PINNED_SYMBOLS[0];
  }, [pairs, activeSymbol]);

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

  const activePriceDec = useMemo(() => {
    if (ticker?.lastPrice) return getSmartPriceDec(ticker.lastPrice);
    return symbolInfo.priceDec ?? 2;
  }, [ticker?.lastPrice, symbolInfo.priceDec]);

  const precisionOptions = useMemo(() => getPrecisionOptions(activePriceDec), [activePriceDec]);

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

  const handleSymbolChange = useCallback((sym: string) => {
    setActiveSymbol(sym);
    prevMidRef.current = null;
    const found = pairs.find((p) => p.symbol === sym);
    if (found) {
      const opts = getPrecisionOptions(found.priceDec);
      setPrecision(opts[1] ?? '0.01');
    }
    // On mobile: close sidebar after select
    setShowMarkets(false);
  }, [pairs]);

  const handleIntervalChange  = useCallback((i: Interval) => setIntervalState(i), []);
  const handlePrecisionChange = useCallback((p: Precision) => setPrecision(p), []);
  const handleOpenMarkets     = useCallback(() => setShowMarkets(true), []);
  const handleCloseMarkets    = useCallback(() => setShowMarkets(false), []);
  const handleToggleSidebar   = useCallback(() => setSidebarOpen((o) => !o), []);

  const P: React.CSSProperties = {
    background: 'rgba(16,19,28,1)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', height: '100%',
  };

  const chartPanel = (
    <TradingViewChart
      symbol={activeSymbol}
      interval={interval}
      onIntervalChange={handleIntervalChange}
    />
  );

  const orderBookPanel = (levels: number) => (
    <OrderBook
      bids={bids} asks={asks}
      midPrice={midPrice} prevMidPrice={prevMidPrice}
      precision={precision} onPrecisionChange={handlePrecisionChange}
      precisionOptions={precisionOptions}
      levels={levels}
    />
  );

  const depthPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(16,19,28,1)' }}>
      <PanelHeader title="DEPTH CHART" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
      </div>
    </div>
  );

  const tradesPanel = <RecentTrades trades={trades} />;
  const liqsPanel = (
    <LiquidationFeed events={liqEvents} stats={liqStats} wsStatus={liqStatus} />
  );
  const marketDataPanel = (
    <div style={{ ...P, overflowY: 'auto' }} className="hide-scrollbar">
      <MarketData ticker={ticker} symbolInfo={symbolInfo} />
    </div>
  );

  return (
    <div
      className="scanline-overlay"
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100dvh', background: 'rgba(13,16,23,1)',
        overflow: 'hidden',
      }}
    >
      <Header
        activeSymbol={activeSymbol}
        symbolInfo={symbolInfo}
        onOpenMarkets={handleOpenMarkets}
        status={overallStatus}
        lastUpdate={lastUpdate}
        ticker={ticker}
        globalStats={globalStats}
      />
      <ConnectionBanner status={overallStatus} onRetry={obRetry} />

      {/* ══════════════════════════ DESKTOP ≥1280px ══════════════════════════ */}
      <div className="layout-desktop" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ display: 'flex', height: '100%', position: 'relative' }}>

          {/* Collapsible left sidebar */}
          <MarketSidebar
            pairs={pairs}
            loading={pairsLoading}
            activeSymbol={activeSymbol}
            onSelect={handleSymbolChange}
            isOpen={sidebarOpen}
            onToggle={handleToggleSidebar}
          />

          {/* Main content panels */}
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <PanelGroup direction="horizontal" autoSaveId="zero-ob-h" style={{ height: '100%' }}>

              {/* LEFT: chart + depth */}
              <Panel id="left" defaultSize={62} minSize={35}
                style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <PanelGroup direction="vertical" autoSaveId="zero-ob-v-left" style={{ height: '100%' }}>
                  <Panel id="chart" defaultSize={65} minSize={35} style={{ overflow: 'hidden' }}>
                    <div style={{ ...P }}>{chartPanel}</div>
                  </Panel>
                  <ResizeHandle direction="vertical" id="v-left" />
                  <Panel id="depth" defaultSize={35} minSize={20} style={{ overflow: 'hidden' }}>
                    {depthPanel}
                  </Panel>
                </PanelGroup>
              </Panel>

              <ResizeHandle direction="horizontal" id="h-book" />

              {/* MIDDLE: Order Book */}
              <Panel id="book" defaultSize={18} minSize={12} maxSize={30} style={{ overflow: 'hidden' }}>
                <div style={{ ...P }}>{orderBookPanel(20)}</div>
              </Panel>

              <ResizeHandle direction="horizontal" id="h-right" />

              {/* RIGHT: Trades + Liqs */}
              <Panel id="right" defaultSize={20} minSize={13} maxSize={32}
                style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <PanelGroup direction="vertical" autoSaveId="zero-ob-v-right" style={{ height: '100%' }}>
                  <Panel id="trades" defaultSize={48} minSize={25} style={{ overflow: 'hidden' }}>
                    <div style={{ ...P }}>{tradesPanel}</div>
                  </Panel>
                  <ResizeHandle direction="vertical" id="v-right" />
                  <Panel id="liqs" defaultSize={52} minSize={25} style={{ overflow: 'hidden' }}>
                    <div style={{ ...P }}>{liqsPanel}</div>
                  </Panel>
                </PanelGroup>
              </Panel>

              <ResizeHandle direction="horizontal" id="h-mktdata" />

              {/* FAR RIGHT: Market Data collapsible */}
              <Panel id="mktdata" defaultSize={0} minSize={0} maxSize={22}
                collapsible collapsedSize={0} style={{ overflow: 'hidden' }}>
                <div style={{ ...P, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                  {marketDataPanel}
                </div>
              </Panel>

            </PanelGroup>
          </div>
        </div>
      </div>

      {/* ══════════════════════════ TABLET 768–1279px ══════════════════════════ */}
      <div className="layout-tablet" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', minHeight: 0,
      }}>
        <div style={{ flex: '0 0 58%', minHeight: 0, overflow: 'hidden' }}>
          <PanelGroup direction="horizontal" autoSaveId="zero-ob-tablet-h" style={{ height: '100%' }}>
            <Panel id="t-chart" defaultSize={64} minSize={40} style={{ overflow: 'hidden' }}>
              <div style={{ ...P }}>{chartPanel}</div>
            </Panel>
            <ResizeHandle direction="horizontal" id="t-h-book" />
            <Panel id="t-book" defaultSize={36} minSize={24} maxSize={48} style={{ overflow: 'hidden' }}>
              <div style={{ ...P }}>{orderBookPanel(16)}</div>
            </Panel>
          </PanelGroup>
        </div>

        <div style={{
          flex: '0 0 42%', display: 'flex', flexDirection: 'column',
          minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Tablet bottom tabs */}
          <div style={{
            display: 'flex',
            background: 'rgba(16,19,28,1)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            {TABLET_BOTTOM_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTabletBottom(t.id)}
                style={{
                  padding: '8px 18px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '9px', fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: 'transparent',
                  color: tabletBottom === t.id ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.28)',
                  borderBottom: tabletBottom === t.id ? '2px solid rgba(242,142,44,1)' : '2px solid transparent',
                  transition: 'all 120ms',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {tabletBottom === 'depth' && (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(16,19,28,1)' }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
                </div>
              </div>
            )}
            {tabletBottom === 'stats' && (
              <PanelGroup direction="horizontal" autoSaveId="zero-ob-tablet-stats" style={{ height: '100%' }}>
                <Panel id="t-stats" defaultSize={55} minSize={35} style={{ overflow: 'hidden' }}>
                  <div style={{ ...P, overflowY: 'auto' }} className="hide-scrollbar">
                    <MarketData ticker={ticker} symbolInfo={symbolInfo} />
                  </div>
                </Panel>
                <ResizeHandle direction="horizontal" id="t-h-trades" />
                <Panel id="t-trades" defaultSize={45} minSize={30} style={{ overflow: 'hidden' }}>
                  <div style={{ ...P }}>{tradesPanel}</div>
                </Panel>
              </PanelGroup>
            )}
            {tabletBottom === 'liqs' && <div style={{ height: '100%' }}>{liqsPanel}</div>}
          </div>
        </div>
      </div>

      {/* ══════════════════════════ MOBILE <768px ══════════════════════════ */}
      <div className="layout-mobile" style={{
        flex: 1, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'chart'  ? 'flex' : 'none', flexDirection: 'column' }}>{chartPanel}</div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'book'   ? 'flex' : 'none', flexDirection: 'column' }}>
            <OrderBook
              bids={bids} asks={asks}
              midPrice={midPrice} prevMidPrice={prevMidPrice}
              precision={precision} onPrecisionChange={handlePrecisionChange}
              precisionOptions={precisionOptions}
              compact levels={20}
            />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'depth'  ? 'flex' : 'none', flexDirection: 'column' }}>
            <PanelHeader title="DEPTH CHART" />
            <div style={{ flex: 1, minHeight: 0 }}>
              <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
            </div>
          </div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'trades' ? 'flex' : 'none', flexDirection: 'column' }}>{tradesPanel}</div>
          <div style={{ position: 'absolute', inset: 0, display: mobileTab === 'liqs'   ? 'flex' : 'none', flexDirection: 'column' }}>{liqsPanel}</div>
        </div>

        {mobileTab === 'book' && <PressureBar bidPercent={bidPressure} />}

        <div style={{
          display: 'flex',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(16,19,28,1)',
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

      {/* Symbol Search Modal — mobile/tablet fallback + when sidebar closed */}
      {showMarkets && (
        <SymbolSearch
          pairs={pairs}
          loading={pairsLoading}
          error={pairsError}
          activeSymbol={activeSymbol}
          onSelect={handleSymbolChange}
          onClose={handleCloseMarkets}
        />
      )}

      <style>{`
        .layout-desktop { display: flex; }
        .layout-tablet  { display: none !important; }
        .layout-mobile  { display: none !important; }
        .desktop-stats  { display: flex; }

        @media (max-width: 1279px) and (min-width: 768px) {
          .layout-desktop { display: none !important; }
          .layout-tablet  { display: flex !important; }
          .layout-mobile  { display: none !important; }
          .desktop-stats  { display: none; }
        }
        @media (max-width: 767px) {
          .layout-desktop { display: none !important; }
          .layout-tablet  { display: none !important; }
          .layout-mobile  { display: flex !important; }
          .desktop-stats  { display: none; }
        }

        [data-resize-handle-active] ~ * { user-select: none !important; }
        [data-panel-group] { display: flex !important; }
        [data-panel-group][data-panel-group-direction="horizontal"] { flex-direction: row !important; }
        [data-panel-group][data-panel-group-direction="vertical"]   { flex-direction: column !important; }
      `}</style>
    </div>
  );
};

export default Index;
