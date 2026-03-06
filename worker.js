/**
 * zero-orderbook-proxy — Cloudflare Worker v6
 * MIGRATION: tambah Bybit routes — Order Book, Trades, Ticker via Bybit
 *
 * Routes:
 *   WS   /ws/*              → wss://stream.binance.me/ws/*
 *   WS   /fstream/*         → wss://fstream.binance.me/ws/*
 *   WS   /bybit/:category   → wss://stream.bybit.com/v5/public/:category
 *   GET  /api/*             → https://api.binance.me/api/*
 *   GET  /fapi/*            → https://fapi.binance.me/fapi/*
 *   GET  /fdata/*           → https://fapi.binance.me/futures/data/*
 *   GET  /bybit-api/*       → https://api.bybit.com/*
 *   POST /verify-license    → https://api.gumroad.com/v2/licenses/verify
 */

const ALLOWED_ORIGIN  = 'https://zero-orderbook.pages.dev';
const GUMROAD_PRODUCT = 'atbwr';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/verify-license' && request.method === 'POST') {
      return handleVerifyLicense(request);
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      return handleWebSocket(request, url);
    }

    return handleRest(request, url);
  },
};

async function handleWebSocket(request, url) {
  let targetUrl;

  if (url.pathname.startsWith('/ws/')) {
    const stream = url.pathname.slice(4);
    targetUrl = 'wss://stream.binance.me/ws/' + stream;
  } else if (url.pathname.startsWith('/fstream/')) {
    const stream = url.pathname.slice(9);
    targetUrl = 'wss://fstream.binance.me/ws/' + stream;
  } else if (url.pathname.startsWith('/bybit/')) {
    const category = url.pathname.slice(7);
    if (!category) return new Response('Missing Bybit category', { status: 400 });
    targetUrl = 'wss://stream.bybit.com/v5/public/' + category;
  } else {
    return new Response('Unknown WS route', { status: 404 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  const upstream = new WebSocket(targetUrl);

  server.accept();
  server.addEventListener('message', (event) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(event.data);
  });
  server.addEventListener('close', (event) => {
    try { upstream.close(event.code, event.reason); } catch {}
  });
  server.addEventListener('error', () => {
    try { upstream.close(); } catch {}
  });

  upstream.addEventListener('message', (event) => {
    try { server.send(event.data); } catch {}
  });
  upstream.addEventListener('close', (event) => {
    try { server.close(event.code, event.reason); } catch {}
  });
  upstream.addEventListener('error', () => {
    try { server.close(1011, 'upstream error'); } catch {}
  });

  return new Response(null, { status: 101, webSocket: client });
}

async function handleRest(request, url) {
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
    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  }

  const targetUrl = targetBase + targetPath + url.search;

  try {
    const response = await fetch(targetUrl, {
      method:  request.method,
      headers: { 'User-Agent': 'zero-orderbook-proxy/1.0' },
      cf:      { cacheTtl: 5, cacheEverything: false },
    });

    const body    = await response.arrayBuffer();
    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
    headers.set('Cache-Control', 'no-store');

    return new Response(body, { status: response.status, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'proxy error', detail: String(err) }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

async function handleVerifyLicense(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ success: false, message: 'Bad request.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const licenseKey = (body.license_key ?? '').trim();
  if (!licenseKey) {
    return new Response(JSON.stringify({ success: false, message: 'License key wajib diisi.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: 'License key tidak valid atau sudah refunded.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: 'Gagal verifikasi.' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
