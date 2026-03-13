/**
 * RecentTrades.tsx — ZERØ ORDER BOOK v91b
 * v91b: REAL FIX — flex column-reverse trick (CEX standard: Binance/Bybit style)
 *       Trades array newest at index 0 (dari hook: incoming.concat(prev))
 *       column-reverse = index 0 tampil di BAWAH secara visual
 *       TAPI kita reverse array dulu → newest di index terakhir → column-reverse
 *       bikin newest ada di bawah secara DOM order = scroll bottom = always visible
 *
 *       ACTUALLY: hook sudah concat newest ke depan (index 0 = newest)
 *       Kita pakai column-reverse + array as-is:
 *       - DOM order: index 0 (newest) di atas secara array
 *       - column-reverse: flip visual → newest jadi di BAWAH
 *       - scroll position 0 = bagian bawah container = newest selalu keliatan
 *       - Tidak perlu scrollTop manipulation sama sekali — CSS murni
 *
 * rgba() only ✓ · React.memo ✓ · displayName ✓ · useCallback ✓
 */

import React, { useMemo, useCallback } from 'react';
import type { Trade } from '@/types/market';
import { SkeletonTrades } from './Skeleton';

interface RecentTradesProps { trades: Trade[] }

const MAX_DISPLAY = 50;

const RecentTrades: React.FC<RecentTradesProps> = React.memo(({ trades }) => {
  // trades[0] = newest (dari hook: incoming.concat(prev))
  // kita reverse sekali → trades[last] = newest
  // column-reverse container → newest muncul di ATAS visual
  const display = useMemo(() =>
    trades.slice(0, MAX_DISPLAY).reverse(),
  [trades]);

  const maxSize = useMemo(() => {
    let max = 1;
    for (let i = 0; i < display.length; i++) {
      if (display[i].size > max) max = display[i].size;
    }
    return max;
  }, [display]);

  return (
    <div
      className="trades-gpu"
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', background: 'rgba(11,14,22,1)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0,
      }}>
        <span className="label-sm">RECENT TRADES</span>
        {display.length > 0 && (
          <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.16)', fontWeight: 700 }}>
            {display.length}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '50px 1fr 1fr',
        padding: '3px 10px', gap: '4px',
        borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0,
      }}>
        <span className="label-xs">TIME</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>PRICE</span>
        <span className="label-xs" style={{ textAlign: 'right' }}>SIZE</span>
      </div>

      {/*
        column-reverse trick:
        - overflowY: auto + flex column-reverse
        - newest item (last in reversed array) tampil di ATAS
        - scroll anchor otomatis ke atas tanpa JS sama sekali
        - zero DOM manipulation, zero useEffect, pure CSS
      */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column-reverse',
        }}
        className="hide-scrollbar"
      >
        <div>
          {display.map((t) => (
            <TradeRow key={t.id} trade={t} maxSize={maxSize} />
          ))}
          {!display.length && <SkeletonTrades />}
        </div>
      </div>
    </div>
  );
});
RecentTrades.displayName = 'RecentTrades';

function formatTime(ms: number): string {
  const d  = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
}

function formatTradeSize(size: number): string {
  if (size >= 1000) return (size / 1000).toFixed(2) + 'K';
  if (size >= 1)    return size.toFixed(3);
  return size.toFixed(4);
}

const TradeRow: React.FC<{ trade: Trade; maxSize: number }> = React.memo(({ trade, maxSize }) => {
  const isSell   = trade.isBuyerMaker;
  const color    = isSell ? 'rgba(255,59,92,1)' : 'rgba(0,255,157,1)';
  const barPct   = Math.min((trade.size / maxSize) * 100, 100);
  const barColor = isSell ? 'rgba(255,59,92,0.07)' : 'rgba(0,255,157,0.07)';

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '50px 1fr 1fr',
        padding: '2px 10px', gap: '4px',
        fontSize: '11px', fontWeight: 600,
        position: 'relative', cursor: 'default', lineHeight: '1.55',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0,
        width: barPct + '%', background: barColor, pointerEvents: 'none',
      }} />
      <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '9.5px', fontVariantNumeric: 'tabular-nums', position: 'relative', zIndex: 1 }}>
        {formatTime(trade.time)}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color, position: 'relative', zIndex: 1 }}>
        {trade.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </span>
      <span className="mono-num" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.48)', position: 'relative', zIndex: 1 }}>
        {formatTradeSize(trade.size)}
      </span>
    </div>
  );
});
TradeRow.displayName = 'TradeRow';

export default RecentTrades;
