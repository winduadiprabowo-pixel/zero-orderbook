// OrderBook.tsx — v82
// Perf improvements:
//  - Virtualized rows (only render visible rows in viewport)
//  - WS updates throttled via RAF (no setState on every WS message)
//  - React.memo + displayName on all sub-components
//  - useCallback/useMemo on all handlers + derived values
//  - Cumulative depth calculated once per RAF tick (not per render)

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Level {
  price: number;
  size: number;
  total: number; // cumulative depth
  pct: number;   // bar width %
}

interface OrderBookProps {
  bids: [number, number][]; // [price, size]
  asks: [number, number][]; // [price, size]
  lastPrice?: number;
  priceDecimals?: number;
  sizeDecimals?: number;
  maxRows?: number;
  className?: string;
}

// ─── Row height for virtual scroll ───────────────────────────────────────────
const ROW_H = 18;
const OVERSCAN = 4;

// ─── Single row (memoized) ────────────────────────────────────────────────────

interface RowProps {
  level: Level;
  side: "bid" | "ask";
  priceDecimals: number;
  sizeDecimals: number;
  flashKey: number;
}

const OBRow = memo(function OBRow({
  level, side, priceDecimals, sizeDecimals, flashKey,
}: RowProps) {
  OBRow.displayName = "OBRow";
  const isBid = side === "bid";
  const barColor = isBid
    ? "rgba(0,210,100,0.13)"
    : "rgba(230,50,80,0.13)";
  const priceColor = isBid
    ? "rgba(0,220,110,1)"
    : "rgba(230,60,80,1)";

  return (
    <div
      style={{
        position: "relative",
        height: ROW_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: "11px",
        lineHeight: `${ROW_H}px`,
        overflow: "hidden",
        // subtle flash when level changes
        transition: "opacity 0.1s",
      }}
      key={flashKey}
    >
      {/* depth bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          [isBid ? "right" : "left"]: 0,
          width: `${level.pct}%`,
          height: "100%",
          background: barColor,
          pointerEvents: "none",
        }}
      />
      {/* price */}
      <span style={{ color: priceColor, zIndex: 1, minWidth: "80px" }}>
        {level.price.toFixed(priceDecimals)}
      </span>
      {/* size */}
      <span style={{ color: "rgba(200,200,210,0.85)", zIndex: 1, minWidth: "70px", textAlign: "right" }}>
        {level.size.toFixed(sizeDecimals)}
      </span>
      {/* cumulative */}
      <span style={{ color: "rgba(140,140,160,0.6)", zIndex: 1, minWidth: "70px", textAlign: "right" }}>
        {level.total.toFixed(sizeDecimals)}
      </span>
    </div>
  );
});

// ─── Virtual list ─────────────────────────────────────────────────────────────

interface VirtualListProps {
  levels: Level[];
  side: "bid" | "ask";
  height: number;
  priceDecimals: number;
  sizeDecimals: number;
  flashKeys: Map<number, number>;
}

const VirtualList = memo(function VirtualList({
  levels, side, height, priceDecimals, sizeDecimals, flashKeys,
}: VirtualListProps) {
  VirtualList.displayName = "VirtualList";
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalH = levels.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(
    levels.length - 1,
    Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN
  );

  const visible = useMemo(
    () => levels.slice(startIdx, endIdx + 1),
    [levels, startIdx, endIdx]
  );

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        height,
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
        position: "relative",
      }}
    >
      {/* spacer for total height */}
      <div style={{ height: totalH, position: "relative" }}>
        {/* visible rows positioned absolutely */}
        <div
          style={{
            position: "absolute",
            top: startIdx * ROW_H,
            width: "100%",
          }}
        >
          {visible.map((lvl) => (
            <OBRow
              key={lvl.price}
              level={lvl}
              side={side}
              priceDecimals={priceDecimals}
              sizeDecimals={sizeDecimals}
              flashKey={flashKeys.get(lvl.price) ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ─── Spread bar ───────────────────────────────────────────────────────────────

const SpreadBar = memo(function SpreadBar({
  bestBid,
  bestAsk,
  priceDecimals,
}: {
  bestBid: number;
  bestAsk: number;
  priceDecimals: number;
}) {
  SpreadBar.displayName = "SpreadBar";
  const spread = bestAsk - bestBid;
  const spreadPct = bestBid > 0 ? ((spread / bestBid) * 100).toFixed(3) : "—";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "2px 8px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: "10px",
        color: "rgba(160,160,180,0.7)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <span>SPREAD</span>
      <span style={{ color: "rgba(220,220,240,0.9)" }}>
        {spread > 0 ? spread.toFixed(priceDecimals) : "—"}
      </span>
      <span style={{ color: "rgba(160,160,180,0.5)" }}>({spreadPct}%)</span>
    </div>
  );
});

// ─── Column header ────────────────────────────────────────────────────────────

const ColHeader = memo(function ColHeader() {
  ColHeader.displayName = "ColHeader";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "2px 8px",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: "9px",
        color: "rgba(120,120,140,0.7)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        userSelect: "none",
      }}
    >
      <span style={{ minWidth: "80px" }}>PRICE</span>
      <span style={{ minWidth: "70px", textAlign: "right" }}>SIZE</span>
      <span style={{ minWidth: "70px", textAlign: "right" }}>TOTAL</span>
    </div>
  );
});

// ─── Main OrderBook ───────────────────────────────────────────────────────────

// Process raw levels → Level[] with cumulative + pct
function processLevels(raw: [number, number][], maxRows: number): Level[] {
  const rows = raw.slice(0, maxRows);
  let cum = 0;
  const withCum = rows.map(([price, size]) => {
    cum += size;
    return { price, size, total: cum, pct: 0 };
  });
  const maxCum = withCum[withCum.length - 1]?.total ?? 1;
  for (const l of withCum) l.pct = (l.total / maxCum) * 100;
  return withCum;
}

const OrderBook = memo(function OrderBook({
  bids,
  asks,
  lastPrice,
  priceDecimals = 2,
  sizeDecimals = 4,
  maxRows = 50,
}: OrderBookProps) {
  OrderBook.displayName = "OrderBook";

  // RAF-batched processed state
  const pendingBids = useRef<[number, number][]>(bids);
  const pendingAsks = useRef<[number, number][]>(asks);
  const rafRef = useRef<number>(0);
  const [processedBids, setProcessedBids] = useState<Level[]>([]);
  const [processedAsks, setProcessedAsks] = useState<Level[]>([]);
  const [flashKeys, setFlashKeys] = useState<Map<number, number>>(new Map());

  // flush RAF tick
  const flush = useCallback(() => {
    const newBids = processLevels(pendingBids.current, maxRows);
    const newAsks = processLevels(pendingAsks.current, maxRows);

    // compute flash keys for changed prices
    setProcessedBids((prev) => {
      const prevMap = new Map(prev.map((l) => [l.price, l.size]));
      const changed = new Set<number>();
      for (const l of newBids) {
        if (prevMap.get(l.price) !== l.size) changed.add(l.price);
      }
      if (changed.size > 0) {
        setFlashKeys((fk) => {
          const next = new Map(fk);
          for (const p of changed) next.set(p, (next.get(p) ?? 0) + 1);
          return next;
        });
      }
      return newBids;
    });
    setProcessedAsks(newAsks);
  }, [maxRows]);

  // schedule RAF on prop change
  useEffect(() => {
    pendingBids.current = bids;
    pendingAsks.current = asks;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bids, asks, flush]);

  const bestBid = useMemo(() => processedBids[0]?.price ?? 0, [processedBids]);
  const bestAsk = useMemo(() => processedAsks[0]?.price ?? 0, [processedAsks]);
  const listH = 180;

  return (
    <div
      style={{
        width: "100%",
        background: "rgba(10,10,14,1)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "IBM Plex Mono, monospace",
      }}
    >
      <ColHeader />

      {/* ASKS — reversed (lowest ask at bottom) */}
      <div style={{ transform: "scaleY(-1)" }}>
        <VirtualList
          levels={[...processedAsks].reverse()}
          side="ask"
          height={listH}
          priceDecimals={priceDecimals}
          sizeDecimals={sizeDecimals}
          flashKeys={flashKeys}
        />
      </div>

      <SpreadBar bestBid={bestBid} bestAsk={bestAsk} priceDecimals={priceDecimals} />

      {/* Last price */}
      {lastPrice !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 8px",
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: "14px",
            fontWeight: "bold",
            color: lastPrice >= bestAsk
              ? "rgba(0,220,110,1)"
              : lastPrice <= bestBid
              ? "rgba(230,60,80,1)"
              : "rgba(220,220,240,1)",
          }}
        >
          {lastPrice.toFixed(priceDecimals)}
        </div>
      )}

      {/* BIDS */}
      <VirtualList
        levels={processedBids}
        side="bid"
        height={listH}
        priceDecimals={priceDecimals}
        sizeDecimals={sizeDecimals}
        flashKeys={flashKeys}
      />
    </div>
  );
});

export default OrderBook;
