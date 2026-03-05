import React, { useState, useMemo, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import OrderBook, { PressureBar } from '@/components/OrderBook';
import CandlestickChart from '@/components/CandlestickChart';
import DepthChart from '@/components/DepthChart';
import RecentTrades from '@/components/RecentTrades';
import MarketData from '@/components/MarketData';
import { useOrderBook } from '@/hooks/useOrderBook';
import { useTicker } from '@/hooks/useTicker';
import { useTrades } from '@/hooks/useTrades';
import { useKline } from '@/hooks/useKline';
import { SYMBOLS, type Interval, type Precision, type ConnectionStatus } from '@/types/market';

const MobileTab = React.memo(({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) => (
  <button
    aria-label={label}
    onClick={onClick}
    style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
      padding: '8px 4px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      minHeight: '44px', minWidth: '44px',
      background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
      transition: 'all 150ms',
    }}
  >
    <span style={{ fontSize: '16px' }}>{icon}</span>
    <span>{label}</span>
  </button>
));
MobileTab.displayName = 'MobileTab';

const Index: React.FC = () => {
  const [activeSymbol, setActiveSymbol] = useState('btcusdt');
  const [interval, setInterval] = useState<Interval>('15m');
  const [precision, setPrecision] = useState<Precision>('0.01');
  const [mobileTab, setMobileTab] = useState<'book' | 'chart' | 'depth' | 'trades'>('book');
  const prevMidRef = useRef<number | null>(null);

  const symbolInfo = useMemo(() => SYMBOLS.find((s) => s.symbol === activeSymbol)!, [activeSymbol]);

  const { bids, asks, status: obStatus, lastUpdate, retry: obRetry } = useOrderBook(activeSymbol);
  const { ticker, status: tickerStatus } = useTicker(activeSymbol);
  const { trades } = useTrades(activeSymbol);
  const { candles } = useKline(activeSymbol, interval);

  const midPrice = useMemo(() => {
    if (bids.length && asks.length) {
      return (bids[0].price + asks[0].price) / 2;
    }
    return null;
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

  const handleSymbolChange = useCallback((sym: string) => {
    setActiveSymbol(sym);
    prevMidRef.current = null;
  }, []);

  return (
    <div className="scanline-overlay" style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: 'var(--app-bg)', overflow: 'hidden',
    }}>
      {/* Connection banners */}
      {obStatus === 'reconnecting' && (
        <div style={{
          padding: '6px 16px', background: 'rgba(255,180,0,0.15)',
          color: 'var(--gold)', fontSize: '11px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
          Reconnecting...
        </div>
      )}
      {obStatus === 'disconnected' && (
        <div style={{
          padding: '6px 16px', background: 'rgba(220,50,70,0.15)',
          color: 'var(--ask-color)', fontSize: '11px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          Connection lost
          <button
            aria-label="Retry connection"
            onClick={obRetry}
            style={{
              marginLeft: '8px', padding: '2px 10px', border: '1px solid var(--ask-color)',
              borderRadius: '3px', background: 'transparent', color: 'var(--ask-color)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      <Header
        symbols={SYMBOLS}
        activeSymbol={activeSymbol}
        onSymbolChange={handleSymbolChange}
        status={overallStatus}
        lastUpdate={lastUpdate}
        ticker={ticker}
      />

      {/* Desktop layout (1280+) */}
      <div className="desktop-layout" style={{
        flex: 1, display: 'flex', gap: '1px', overflow: 'hidden',
        background: 'var(--border-subtle)',
      }}>
        {/* Left: Order Book */}
        <div style={{ width: '280px', flexShrink: 0, overflow: 'hidden' }}>
          <OrderBook
            bids={bids}
            asks={asks}
            midPrice={midPrice}
            prevMidPrice={prevMidPrice}
            precision={precision}
            onPrecisionChange={setPrecision}
          />
        </div>

        {/* Center: Charts */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
          <div style={{ flex: 65, minHeight: 0 }}>
            <CandlestickChart
              candles={candles}
              interval={interval}
              onIntervalChange={setInterval}
              symbol={activeSymbol}
            />
          </div>
          <div style={{ flex: 35, minHeight: 0 }}>
            <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
          </div>
        </div>

        {/* Right: Market Data + Trades */}
        <div style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <div style={{ flexShrink: 0 }}>
            <MarketData ticker={ticker} symbolInfo={symbolInfo} />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <RecentTrades trades={trades} />
          </div>
        </div>
      </div>

      {/* Mobile content - shown only on mobile */}
      <div className="mobile-content" style={{ display: 'none', flex: 1, overflow: 'hidden' }}>
        {mobileTab === 'book' && (
          <OrderBook bids={bids} asks={asks} midPrice={midPrice} prevMidPrice={prevMidPrice}
            precision={precision} onPrecisionChange={setPrecision} compact levels={15} />
        )}
        {mobileTab === 'chart' && (
          <CandlestickChart candles={candles} interval={interval} onIntervalChange={setInterval} symbol={activeSymbol} />
        )}
        {mobileTab === 'depth' && (
          <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
        )}
        {mobileTab === 'trades' && (
          <RecentTrades trades={trades} />
        )}
      </div>

      {/* Mobile sticky pressure bar - always visible */}
      <div className="mobile-pressure" style={{ display: 'none' }}>
        <PressureBar bidPercent={bidPressure} />
      </div>

      {/* Mobile tabs - at bottom */}
      <div className="mobile-tabs" style={{
        display: 'none', borderTop: '1px solid var(--border-subtle)',
        background: 'var(--panel-bg)',
      }}>
        <MobileTab icon="📊" label="Book" active={mobileTab === 'book'} onClick={() => setMobileTab('book')} />
        <MobileTab icon="📈" label="Chart" active={mobileTab === 'chart'} onClick={() => setMobileTab('chart')} />
        <MobileTab icon="🌊" label="Depth" active={mobileTab === 'depth'} onClick={() => setMobileTab('depth')} />
        <MobileTab icon="⚡" label="Trades" active={mobileTab === 'trades'} onClick={() => setMobileTab('trades')} />
      </div>

      <style>{`
        @media (max-width: 767px) {
          .desktop-layout { display: none !important; }
          .mobile-tabs { display: flex !important; }
          .mobile-content { display: flex !important; }
          .mobile-pressure { display: block !important; }
        }
        @media (min-width: 768px) and (max-width: 1279px) {
          .desktop-layout > div:last-child { display: none !important; }
          .desktop-layout > div:first-child { width: 260px !important; }
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default Index;
