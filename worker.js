/**
 * zero-orderbook-proxy — Cloudflare Worker v7 — ZERØ ORDER BOOK v39
 * UPGRADES:
 *   - Multi-origin CORS (future custom domain ready)
 *   - WS upstream error logging to client via close reason
 *   - REST timeout 8s (prevent hanging requests)
 *
 * Routes:
 *   WS   /ws/*              → wss://stream.binance.me/ws/*
 *   WS   /fstream/*         → wss://fstream.binance.me/ws/*
 *   WS   /bybit/:category   → wss://stream.bybit.com/v5/public/:category
 *   GET  /api/*             → https://api.binance.me/api/*
 *   GET  /fapi/*            → https://fapi.binance.me/fapi/*
 *   GET  /fdata/*           → https://fapi.binance.me/futures/data/*
 *   GET  /bybit-api/*       → https://api.bybit.com/*
 *   POST /verify-license    → Gumroad
 */

const ALLOWED_ORIGINS = [
  'https://zero-orderbook.pages.dev',
  // Add custom domain here when ready:
  // 'https://zerorderbook.com',
  // 'https://www.zerorderbook.com',
];

const GUMROAD_PRODUCT = 'atbwr';

function getCorsHeaders(requestOrigin) {
  // Allow any registered origin; fall back to primary
  const origin = ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const cors   = getCorsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/verify-license' && request.method === 'POST') {
      return handleVerifyLicense(request, cors);
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      return handleWebSocket(request, url);
    }

    return handleRest(request, url, cors);
  },
};

async function handleWebSocket(request, url) {
  let targetUrl;

  if (url.pathname.startsWith('/ws/')) {
    // Single stream: /ws/btcusdt@trade → wss://stream.binance.me/ws/btcusdt@trade
    targetUrl = 'wss://stream.binance.me/ws/' + url.pathname.slice(4);
  } else if (url.pathname.startsWith('/stream/')) {
    // v55c: Combined stream path-based
    // /stream/btcusdt@depth20@100ms/btcusdt@trade/btcusdt@ticker
    // → wss://stream.binance.me/stream?streams=btcusdt@depth20@100ms/btcusdt@trade/btcusdt@ticker
    const streams = url.pathname.slice(8); // remove /stream/
    targetUrl = 'wss://stream.binance.me/stream?streams=' + streams;
  } else if (url.pathname.startsWith('/fstream/')) {
    targetUrl = 'wss://fstream.binance.me/ws/' + url.pathname.slice(9);
  } else if (url.pathname.startsWith('/bybit/')) {
    const category = url.pathname.slice(7);
    if (!category) return new Response('Missing Bybit category', { status: 400 });
    targetUrl = 'wss://stream.bybit.com/v5/public/' + category;
  } else if (url.pathname.startsWith('/coinbase')) {
    // v68: Coinbase Advanced Trade WS proxy — bypass ISP block ID
    // /coinbase → wss://advanced-trade-ws.coinbase.com/
    targetUrl = 'wss://advanced-trade-ws.coinbase.com/';
  } else {
    return new Response('Unknown WS route', { status: 404 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  let upstream;

  try {
    upstream = new WebSocket(targetUrl);
  } catch (err) {
    return new Response('WS upstream connect failed: ' + String(err), { status: 502 });
  }

  server.accept();

  // Client → upstream
  server.addEventListener('message', (event) => {
    try {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(event.data);
    } catch { /* upstream gone */ }
  });
  server.addEventListener('close', (event) => {
    try { upstream.close(event.code, event.reason); } catch {}
  });
  server.addEventListener('error', () => {
    try { upstream.close(); } catch {}
  });

  // Upstream → client
  upstream.addEventListener('message', (event) => {
    try { server.send(event.data); } catch {}
  });
  upstream.addEventListener('close', (event) => {
    try { server.close(event.code, event.reason); } catch {}
  });
  upstream.addEventListener('error', (err) => {
    try { server.close(1011, 'upstream error: ' + String(err)); } catch {}
  });

  return new Response(null, { status: 101, webSocket: client });
}

async function handleRest(request, url, cors) {
  let targetBase;
  let targetPath;

  if (url.pathname.startsWith('/api/')) {
    targetBase = 'https://api.binance.me';
    targetPath = url.pathname;
  } else if (url.pathname.startsWith('/fapi/')) {
    targetBase = 'https://fapi.binance.me';
    targetPath = url.pathname;
  } else if (url.pathname.startsWith('/fdata/')) {
    targetBase = 'https://fapi.binance.me';
    targetPath = '/futures/data/' + url.pathname.slice(7);
  } else if (url.pathname.startsWith('/bybit-api/')) {
    targetBase = 'https://api.bybit.com';
    targetPath = url.pathname.slice(10);
  } else {
    return new Response('Not found', { status: 404, headers: cors });
  }

  const targetUrl = targetBase + targetPath + url.search;

  // 8s timeout to prevent CF Worker hanging
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(targetUrl, {
      method:  request.method,
      headers: { 'User-Agent': 'zero-orderbook-proxy/2.0' },
      signal:  controller.signal,
      cf:      { cacheTtl: 5, cacheEverything: false },
    });
    clearTimeout(timeout);

    const body    = await response.arrayBuffer();
    const headers = new Headers(cors);
    headers.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
    headers.set('Cache-Control', 'no-store');

    return new Response(body, { status: response.status, headers });
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return new Response(
      JSON.stringify({ error: isTimeout ? 'timeout' : 'proxy error', detail: String(err) }),
      { status: isTimeout ? 504 : 502, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleVerifyLicense(request, cors) {
  const licenseCors = {
    ...cors,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ success: false, message: 'Bad request.' }), {
      status: 400, headers: { ...licenseCors, 'Content-Type': 'application/json' },
    });
  }

  const licenseKey = (body.license_key ?? '').trim();
  if (!licenseKey) {
    return new Response(JSON.stringify({ success: false, message: 'License key wajib diisi.' }), {
      status: 400, headers: { ...licenseCors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const gumroadRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: GUMROAD_PRODUCT, license_key: licenseKey }).toString(),
    });

    const gumroadData = await gumroadRes.json();

    if (gumroadData.success) {
      return new Response(JSON.stringify({
        success: true,
        message: 'License valid.',
        uses:    gumroadData.uses,
        email:   gumroadData.purchase?.email ?? '',
      }), { status: 200, headers: { ...licenseCors, 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: 'License key tidak valid atau sudah refunded.',
      }), { status: 200, headers: { ...licenseCors, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: 'Gagal verifikasi.' }), {
      status: 502, headers: { ...licenseCors, 'Content-Type': 'application/json' },
    });
  }
}
