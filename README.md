# ZERØ ORDER BOOK — Crypto Trading Terminal

> Real-time multi-exchange order book, depth chart, liquidations, and market data — built for serious traders.

[![Live](https://img.shields.io/badge/Live-zero--orderbook.pages.dev-brightgreen?style=flat-square)](https://zero-orderbook.pages.dev)
[![Stack](https://img.shields.io/badge/Stack-React%2018%20%2B%20TypeScript%20%2B%20Vite-blue?style=flat-square)]()
[![Charts](https://img.shields.io/badge/Charts-lightweight--charts%20v4.1-yellow?style=flat-square)]()
[![Price](https://img.shields.io/badge/Price-%249%20lifetime-orange?style=flat-square)]()

---

## Overview

ZERØ ORDER BOOK is a professional crypto trading terminal aggregating real-time order book data, trades, CVD, and liquidation feeds from Binance, Bybit, and OKX — in a single low-latency interface. Optimized for both desktop (TradingView Advanced Chart + drawing tools) and mobile (pinch-zoom lightweight chart).

**Live:** [zero-orderbook.pages.dev](https://zero-orderbook.pages.dev)

---

## Features

- **Multi-Exchange** — Binance, Bybit, OKX aggregated in real-time
- **Order Book** — Bids/asks with live depth updates via WebSocket
- **Depth Chart** — Visual bid/ask depth (PRO)
- **CVD Chart** — Cumulative Volume Delta
- **Liquidation Feed** — Real-time liquidations across exchanges (PRO)
- **Market Pulse** — Market cap, volume, BTC dominance, Fear & Greed Index
- **TradingView Chart** — Advanced Chart with full drawing tools (desktop)
- **Lightweight Chart** — Mobile-optimized with pinch zoom
- **Crypto News Feed** — Live news via CryptoCompare
- **PWA** — Installable as native app

---

## Architecture

```
src/
├── Index.tsx
├── components/
│   ├── Header.tsx
│   ├── OrderBook.tsx
│   ├── LightweightChart.tsx      # Mobile chart (pinch zoom)
│   ├── TradingViewChart.tsx      # Desktop — Advanced Chart + drawing tools
│   ├── DepthChart.tsx            # PRO
│   ├── RecentTrades.tsx
│   ├── CvdChart.tsx
│   ├── LiquidationFeed.tsx       # PRO
│   ├── HomeDashboard.tsx         # Mobile only
│   ├── MarketData.tsx
│   └── LicenseGate.tsx           # ProLock + TRY FREE 5 MIN
├── hooks/
│   ├── useMultiExchangeWs.ts     # WS core — all exchanges
│   ├── useExchange.ts            # URL + subscribe msg per exchange
│   ├── useGlobalStats.ts         # Market Pulse (CoinGecko + FNG)
│   ├── useProAccess.ts           # Trial system
│   ├── useLiquidations.ts
│   ├── useMarketPairs.ts
│   └── useAllTickers.ts
├── lib/
│   └── formatters.ts             # getReconnectDelay()
└── workers/
    └── orderbook.worker.ts       # Web Worker — sort + dedup
public/
└── sw.js                         # Service Worker — cache strategy
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript + Vite |
| Charts | lightweight-charts v4.1 + TradingView Advanced Chart |
| State | React hooks + Web Worker |
| Proxy | Cloudflare Worker (zero-orderbook-proxy) |
| Hosting | Cloudflare Pages |
| Payment | Gumroad license validation |

---

## WebSocket Architecture

| Exchange | Connection | Notes |
|----------|-----------|-------|
| Binance | Via CF Worker proxy `/ws/stream` | Combined stream |
| OKX | Via CF Worker proxy `/okx` | Public WS |
| Bybit | **Direct** `wss://stream.bybit.com/v5/public/linear` | CF IPs blocked by Bybit — must bypass proxy |

---

## Cloudflare Worker Routes

```
# WebSocket
WS: /ws/stream  → wss://stream.binance.me/stream
WS: /ws/*       → wss://stream.binance.me/ws/*
WS: /fstream/*  → wss://fstream.binance.me/ws/*
WS: /okx        → wss://ws.okx.com:8443/ws/v5/public

# REST
REST: /api/*          → https://api.binance.com
REST: /fapi/*         → https://fapi.binance.com
REST: /fdata/*        → https://fdata.binance.com/futures/data/*
REST: /bybit-api/*    → https://api.bybit.com
REST: /okx-api/*      → https://www.okx.com
REST: /coingecko/*    → https://api.coingecko.com
REST: /fng/*          → https://api.alternative.me
REST: /cryptocompare/* → https://min-api.cryptocompare.com

# License
POST: /verify-license → Gumroad license validation
```

---

## Key Implementation Notes

- **Bybit WS must be direct** — Bybit blocks Cloudflare datacenter IPs
- **BYBIT_TIMEOUT_MS = 3500** — fallback to Binance if Bybit doesn't connect within 3.5s
- **Reconnect delay** — exponential backoff: `1000 * 2^attempt + jitter`, capped at 8s
- **Splash screen** — waits for `bids.length > 0 && ticker.lastPrice`, min 2.5s, max 8s
- **RecentTrades** — `flex column-reverse` trick for newest-on-top without JS scroll
- **Market Pulse** — `staleTime: 3min`, `gcTime: 10min` to survive tab switches
- **SW cache** — bump cache key on every push
- **isUnlocked** — always `isPro || trialActive`, never bare `isPro`

---

## Performance Optimizations

| Layer | Optimization |
|-------|-------------|
| DNS | preconnect CF/Bybit/TradingView, dns-prefetch Binance/OKX |
| JS Bundle | Vite manualChunks: react-core / lightweight / panels / query |
| WebSocket | Bybit 3.5s timeout, reconnect cap 8s, RAF coalescing |
| Data | REST ticker parallel fetch, sessionStorage snapshot cache 5min TTL |
| Worker | MessageChannel flush, typed sort, RingBuffer, hash dedup |
| Cache | Service Worker cache, binary frame guard |

---

## Local Development

```bash
git clone https://github.com/winduadiprabowo-pixel/zero-orderbook
cd zero-orderbook
npm install
npm run dev
```

---

## Roadmap

- [ ] Hidden whale detection — signal when large bid/ask is stacked
- [ ] Multi-pair comparison view
- [ ] Alert system — price + volume triggers

---

## Author

**Windu Adi Prabowo** · [ZERØ BUILD LAB](https://github.com/winduadiprabowo-pixel) · [@ZerobuildLab](https://twitter.com/ZerobuildLab)
