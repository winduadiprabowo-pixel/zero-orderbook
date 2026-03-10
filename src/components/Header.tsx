/**
 * Header.tsx — ZERØ ORDER BOOK v39
 * UPGRADE: Feed latency indicator (FeedLatency component)
 * FIX MOBILE: harga tidak kepotong
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useMemo, useRef, useEffect } from 'react';
import type { ConnectionStatus, SymbolInfo, TickerData, GlobalStats } from '@/types/market';
import { formatCompact, fearGreedColor } from '@/lib/formatters';
import CoinLogo from '@/components/CoinLogo';
import ExchangeSwitcher from '@/components/ExchangeSwitcher';
import { type ExchangeId } from '@/hooks/useExchange';
import FeedLatency from '@/components/FeedLatency';

interface HeaderProps {
  activeSymbol:     string;
  symbolInfo:       SymbolInfo;
  onOpenMarkets:    () => void;
  onOpenPro:        () => void;
  status:           ConnectionStatus;
  lastUpdate:       number;
  ticker:           TickerData | null;
  globalStats:      GlobalStats;
  latencyMs:        number | null;
  exchange:         ExchangeId;
  onExchangeChange: (ex: ExchangeId) => void;
  isStale?:         boolean; // v63c: showing cached snapshot
}

const Header: React.FC<HeaderProps> = React.memo(({
  activeSymbol, symbolInfo, onOpenMarkets, onOpenPro,
  status, lastUpdate, ticker, globalStats, latencyMs,
  exchange, onExchangeChange, isStale = false,
}) => {
  const statusColor = useMemo(() => {
    if (status === 'connected')    return 'rgba(0,255,157,1)';
    if (status === 'reconnecting') return 'rgba(242,162,33,1)';
    return 'rgba(255,59,92,1)';
  }, [status]);

  const statusLabel = useMemo(() => {
    if (status === 'connected')    return 'LIVE';
    if (status === 'reconnecting') return 'SYNC';
    return 'OFFLINE';
  }, [status]);

  const timeStr = useMemo(() => {
    if (!lastUpdate) return '';
    return new Date(lastUpdate).toLocaleTimeString('en-US', { hour12: false });
  }, [lastUpdate]);

  const changeColor = useMemo(() =>
    !ticker ? 'rgba(255,255,255,0.55)'
    : ticker.priceChangePercent >= 0 ? 'rgba(0,255,157,1)' : 'rgba(255,59,92,1)',
  [ticker]);

  const fgColor = fearGreedColor(globalStats.fearGreedValue);

  // v58: price flash animation on ticker change
  const priceElRef  = useRef<HTMLSpanElement>(null);
  const prevPriceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ticker) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = ticker.lastPrice;
    if (prev === null) return;
    const el = priceElRef.current;
    if (!el) return;
    const cls = ticker.lastPrice >= prev ? 'price-flash-up' : 'price-flash-down';
    el.classList.remove('price-flash-up', 'price-flash-down');
    void el.offsetWidth;
    el.classList.add(cls);
    const t = setTimeout(() => el?.classList.remove(cls), 400);
    return () => clearTimeout(t);
  }, [ticker?.lastPrice]);

  const activeLabel = useMemo(() => {
    const up = activeSymbol.toUpperCase();
    for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'FDUSD']) {
      if (up.endsWith(quote)) return { base: up.slice(0, -quote.length), quote };
    }
    return { base: up, quote: '' };
  }, [activeSymbol]);

  const priceStr = useMemo(() => {
    if (!ticker) return '—';
    return ticker.lastPrice.toLocaleString('en-US', {
      minimumFractionDigits: Math.min(symbolInfo.priceDec, 6),
      maximumFractionDigits: Math.min(symbolInfo.priceDec, 6),
    });
  }, [ticker, symbolInfo.priceDec]);

  const changeStr = useMemo(() => {
    if (!ticker) return '';
    return (ticker.priceChangePercent >= 0 ? '+' : '') + ticker.priceChangePercent.toFixed(2) + '%';
  }, [ticker]);

  return (
    <header style={{
      background: 'rgba(5,7,15,1)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
      zIndex: 30,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        height: '52px', gap: '0',
        minWidth: 0,
      }}>

        {/* ── Logo v63: squirrel mascot + text ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          marginRight: '12px', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, overflow: 'hidden' }}>
            <g transform="translate(-10.930,-11.034) scale(0.09786)">
              <g transform="translate(244.1875,167.25)">
                <path fill="rgba(255,255,255,0.82)" d="M0 0 C1.8125 0.75 1.8125 0.75 2.8125 2.75 C3.82029164 8.59519152 3.77238544 14.17389546 3.48828125 20.08203125 C3.39836749 22.43812024 3.31293905 24.79433429 3.22875977 27.15063477 C3.15977554 28.75415277 3.07100069 30.35694557 2.9621582 31.95825195 C2.12383386 42.2805402 2.12383386 42.2805402 6.37451172 51.31396484 C8.38433723 53.4085528 10.51829653 55.25577556 12.7722168 57.08081055 C23.11283881 65.50915826 27.41261445 81.05589217 28.8125 93.75 C29.8540625 93.82476562 30.895625 93.89953125 31.96875 93.9765625 C48.31810674 95.38068373 61.25949855 100.61869098 74.8125 109.75 C75.8025 110.41 76.7925 111.07 77.8125 111.75 C78.08344482 110.88217896 78.08344482 110.88217896 78.35986328 109.99682617 C84.3340793 91.03067165 91.35771148 71.94816718 109.3984375 61.2109375 C116.818793 57.40048467 123.22335294 55.37633693 131.5625 55.4375 C132.36236328 55.44313965 133.16222656 55.4487793 133.98632812 55.45458984 C145.2024149 55.68465174 154.70118805 59.15498854 163.078125 66.82421875 C169.18470355 73.3039771 172.94760503 79.47653418 173.25 88.5 C173.08127879 92.6598505 172.69539935 95.55821858 169.8125 98.75 C166.1373086 100.95511484 163.56323822 101.11137924 159.3828125 100.56640625 C155.10632198 99.20806807 151.93027126 96.46983995 148.48828125 93.66015625 C143.35849931 89.99816593 138.02500915 89.02462228 131.8125 89.75 C125.2509624 91.13005571 120.87102871 94.487839 116.8125 99.75 C108.76263984 112.4732512 103.51300368 131.69200794 105.8125 146.75 C106.54497368 148.46787336 107.28006866 150.18490802 108.04858398 151.88696289 C115.40860711 169.83657505 112.46237359 190.96011363 105.27124023 208.35107422 C98.7525877 223.33517927 88.37336766 234.90107614 74.375 243.25 C73.73256348 243.63486572 73.09012695 244.01973145 72.42822266 244.41625977 C70.26323927 245.63123631 68.05547684 246.68530512 65.8125 247.75 C64.98751511 248.17595963 64.16253021 248.60191925 63.31254578 249.04078674 C51.11028677 254.4068821 38.09982637 253.43137642 25.01578236 253.32283282 C21.52809877 253.29875641 18.04042522 253.30194602 14.55267334 253.30152893 C8.71270139 253.29692701 2.87305943 253.27344385 -2.96679688 253.23706055 C-9.71879713 253.19510673 -16.47050242 253.17773081 -23.22262549 253.1744408 C-30.43144532 253.17084695 -37.6401594 253.15200782 -44.84893513 253.12732053 C-46.92237961 253.12109223 -48.99581607 253.11745621 -51.06926727 253.11428642 C-54.91834944 253.10730877 -58.76721162 253.08294474 -62.61621094 253.05639648 C-63.76521881 253.05573181 -64.91422668 253.05506714 -66.09805298 253.05438232 C-67.66210373 253.03941963 -67.66210373 253.03941963 -69.25775146 253.02415466 C-70.16689175 253.01950416 -71.07603203 253.01485365 -72.01272202 253.01006222 C-74.1875 252.75 -74.1875 252.75 -76.1875 250.75 C-77.44122824 243.1311899 -76.30071581 237.2760436 -71.953125 230.9375 C-69.31589831 227.6701395 -66.68370793 225.08080529 -63.1875 222.75 C-62.589375 222.3375 -61.99125 221.925 -61.375 221.5 C-53.7453267 217.20830877 -44.64303115 218.42162986 -36.1875 218.75 C-36.66960937 217.71101562 -37.15171875 216.67203125 -37.6484375 215.6015625 C-38.28700564 214.19295632 -38.92499529 212.78408779 -39.5625 211.375 C-39.87960938 210.69566406 -40.19671875 210.01632812 -40.5234375 209.31640625 C-44.70919025 199.98566574 -45.57585228 190.83680584 -45.5625 180.6875 C-45.56306396 179.60001465 -45.56362793 178.5125293 -45.56420898 177.39208984 C-45.42342264 166.9615913 -43.47435948 157.61057844 -40.1875 147.75 C-41.3734375 147.78480469 -42.559375 147.81960938 -43.78125 147.85546875 C-66.38189904 148.31819249 -88.23564577 143.89462307 -105.1875 127.75 C-111.77819367 119.962672 -112.82206639 112.79195713 -112.1875 102.75 C-111.47093929 98.73547772 -110.39007055 94.8938857 -109.1875 91 C-108.87353271 89.96085449 -108.55956543 88.92170898 -108.23608398 87.85107422 C-104.10216937 74.67352051 -98.59241368 63.03423487 -89.1875 52.75 C-88.63578125 52.11835938 -88.0840625 51.48671875 -87.515625 50.8359375 C-78.59704746 41.19537987 -64.38890246 33.11157963 -51.1875 31.75 C-46.18008096 31.60434789 -41.19634717 31.63121311 -36.1875 31.75 C-35.919375 31.17507812 -35.65125 30.60015625 -35.375 30.0078125 C-30.09030803 19.95994422 -12.8051388 -1.46344443 0 0 Z"/>
              </g>
            </g>
          </svg>
          <span style={{
            fontSize: '14px', fontWeight: 800, letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.72)',
          }}>
            ZERØ
          </span>
          <span className="header-subtitle" style={{
            fontSize: '8px', color: 'rgba(255,255,255,0.18)', fontWeight: 500,
            letterSpacing: '0.08em',
          }}>
            ORDER BOOK
          </span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.07)', flexShrink: 0, marginRight: '12px' }} />

        {/* ── Pair selector ── */}
        <button
          onClick={onOpenMarkets}
          aria-label="Change trading pair"
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '5px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '5px 8px 5px 7px',
            flexShrink: 0,
            transition: 'background 120ms, border-color 120ms',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(242,142,44,0.35)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
          }}
        >
          <CoinLogo symbol={activeLabel.base} size={18} />
          <span style={{
            fontSize: '13px', fontWeight: 800,
            color: 'rgba(255,255,255,0.95)',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>
            {activeLabel.base}
            <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
              /{activeLabel.quote}
            </span>
          </span>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* ── Price + change ── */}
        {ticker && (
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: '5px',
            marginLeft: '10px',
            flexShrink: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}>
            <span ref={priceElRef} className="mono-num" style={{
              fontSize: '15px', fontWeight: 800, color: changeColor,
              letterSpacing: '-0.01em', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {priceStr}
            </span>
            <span className="mono-num header-change" style={{
              fontSize: '11px', fontWeight: 700, color: changeColor,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {changeStr}
            </span>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }} />

        {/* ── Ticker stats — desktop only ── */}
        {ticker && (
          <div style={{
            display: 'flex', gap: '16px', alignItems: 'center',
            overflow: 'hidden', flexShrink: 1,
          }} className="desktop-stats hide-scrollbar">
            <StatChip label="H"   value={ticker.highPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })} color="rgba(0,255,157,1)" />
            <StatChip label="L"   value={ticker.lowPrice.toLocaleString('en-US',  { maximumFractionDigits: 4 })} color="rgba(255,59,92,1)" />
            <StatChip label="VOL" value={formatCompact(ticker.quoteVolume)} color="rgba(255,255,255,0.80)" />
            {!globalStats.loading && (
              <>
                <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
                <StatChip label="MCAP"   value={formatCompact(globalStats.totalMarketCap)} color="rgba(255,255,255,0.80)" />
                <StatChip label="BTCDOM" value={globalStats.btcDominance.toFixed(1) + '%'} color="rgba(242,142,44,1)" />
                <StatChip
                  label="F&G"
                  value={globalStats.fearGreedValue + ' · ' + globalStats.fearGreedLabel.toUpperCase()}
                  color={fgColor}
                />
              </>
            )}
          </div>
        )}

        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.07)', flexShrink: 0, marginLeft: '10px' }} />

        {/* ── Feed Latency + Status ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, margin: '0 10px' }}>
          {/* Feed latency — desktop only */}
          <div className="desktop-stats">
            <FeedLatency latencyMs={latencyMs} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              className="live-dot"
              style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }}
            />
            <span style={{ fontSize: '9px', fontWeight: 700, color: statusColor, letterSpacing: '0.10em' }}>
              {statusLabel}
            </span>
            {/* v63c: CACHED badge — visible while showing snapshot, fades when live */}
            {isStale && (
              <span style={{
                fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em',
                padding: '1px 5px', borderRadius: '2px',
                background: 'rgba(242,142,44,0.12)',
                border: '1px solid rgba(242,142,44,0.30)',
                color: 'rgba(242,142,44,0.70)',
              }}>
                CACHED
              </span>
            )}
            {timeStr && (
              <span className="header-timestamp" style={{
                fontSize: '9px', color: 'rgba(255,255,255,0.14)', letterSpacing: '0.04em',
              }}>
                {timeStr}
              </span>
            )}
          </div>
        </div>

        {/* ── Exchange Switcher ── */}
        <ExchangeSwitcher active={exchange} onChange={onExchangeChange} />

        {/* ── PRO CTA ── */}
        <button
          onClick={onOpenPro}
          className="badge-glow"
          aria-label="Upgrade to ZERØ ORDER BOOK PRO"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0 10px', height: '28px', flexShrink: 0,
            background: 'rgba(242,142,44,0.12)',
            border: '1px solid rgba(242,142,44,0.40)',
            borderRadius: '4px', cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '10px', fontWeight: 700,
            color: 'rgba(242,142,44,1)', letterSpacing: '0.07em',
            whiteSpace: 'nowrap',
          }}
        >
          ⚡ PRO $9
        </button>

        {/* v66: trust signal — indie dev badge */}
        <div
          title="Built by an indie developer in Surabaya, Indonesia"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            flexShrink: 0, cursor: 'default',
          }}
          className="header-timestamp"
        >
          <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.12)', letterSpacing: '0.06em', fontWeight: 600 }}>
            indie dev · 🇮🇩
          </span>
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .header-subtitle   { display: none !important; }
          .header-timestamp  { display: none !important; }
          .header-change     { display: none !important; }
        }
      `}</style>
    </header>
  );
});

Header.displayName = 'Header';

const StatChip: React.FC<{ label: string; value: string; color: string }> = React.memo(
  ({ label, value, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {label}
      </span>
      <span className="mono-num" style={{ fontSize: '10px', fontWeight: 700, color, lineHeight: 1.3 }}>
        {value}
      </span>
    </div>
  )
);
StatChip.displayName = 'StatChip';

export default Header;
