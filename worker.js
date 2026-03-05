/**
 * zero-orderbook-proxy — Cloudflare Worker
 * WebSocket proxy: Binance spot streams + fstream liquidations
 * REST proxy: Binance REST API (klines, fapi)
 *
 * Routes:
 *   WS  /ws/*           → wss://stream.binance.com:9443/ws/*
 *   WS  /fstream/*      → wss://fstream.binance.com/ws/*
 *   GET /api/*          → https://api.binance.com/api/*
 *   GET /fapi/*         → https://fapi.binance.com/fapi/*
 *   GET /fdata/*        → https://fapi.binance.com/futures/data/*
 */

const ALLOWED_ORIGIN = 'https://zero-orderbook.pages.dev';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── WebSocket upgrade ───────────────────────────────────────────────────
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      return handleWebSocket(request, url);
    }

    // ── REST proxy ──────────────────────────────────────────────────────────
    return handleRest(request, url);
  },
};

// ─── WebSocket proxy ─────────────────────────────────────────────────────────

async function handleWebSocket(request, url) {
  let targetUrl;

  if (url.pathname.startsWith('/ws/')) {
    // spot streams: /ws/{stream}
    const stream = url.pathname.slice(4); // strip /ws/
    targetUrl = `wss://stream.binance.com:9443/ws/${stream}`;
  } else if (url.pathname.startsWith('/fstream/')) {
    // futures streams: /fstream/{stream}
    const stream = url.pathname.slice(9); // strip /fstream/
    targetUrl = `wss://fstream.binance.com/ws/${stream}`;
  } else {
    return new Response('Unknown WS route', { status: 404 });
  }

  const [client, server] = Object.values(new WebSocketPair());

  const upstream = new WebSocket(targetUrl);

  // client → upstream
  server.accept();
  server.addEventListener('message', (event) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(event.data);
    }
  });
  server.addEventListener('close', (event) => {
    try { upstream.close(event.code, event.reason); } catch {}
  });
  server.addEventListener('error', () => {
    try { upstream.close(); } catch {}
  });

  // upstream → client
  upstream.addEventListener('message', (event) => {
    try { server.send(event.data); } catch {}
  });
  upstream.addEventListener('close', (event) => {
    try { server.close(event.code, event.reason); } catch {}
  });
  upstream.addEventListener('error', () => {
    try { server.close(1011, 'upstream error'); } catch {}
  });

  return new Response(null, {
    status:  101,
    webSocket: client,
  });
}

// ─── REST proxy ───────────────────────────────────────────────────────────────

async function handleRest(request, url) {
  let targetBase;
  let targetPath;

  if (url.pathname.startsWith('/api/')) {
    targetBase = 'https://api.binance.com';
    targetPath = url.pathname.slice(4); // /api/... → /api/...
  } else if (url.pathname.startsWith('/fapi/')) {
    targetBase = 'https://fapi.binance.com';
    targetPath = url.pathname; // keep /fapi/...
  } else if (url.pathname.startsWith('/fdata/')) {
    targetBase = 'https://fapi.binance.com';
    targetPath = '/futures/data/' + url.pathname.slice(7);
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

    return new Response(body, {
      status:  response.status,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'proxy error', detail: String(err) }), {
      status:  502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
