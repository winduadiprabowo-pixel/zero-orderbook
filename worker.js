/**
 * zero-orderbook-proxy — Cloudflare Worker
 * WebSocket proxy: Binance spot streams + fstream liquidations
 * REST proxy: Binance REST API (klines, fapi)
 * License: Gumroad license key verification
 *
 * Routes:
 *   WS   /ws/*              → wss://stream.binance.com:9443/ws/*
 *   WS   /fstream/*         → wss://fstream.binance.com/ws/*
 *   GET  /api/*             → https://api.binance.com/api/*
 *   GET  /fapi/*            → https://fapi.binance.me/fapi/*
 *   GET  /fdata/*           → https://fapi.binance.me/futures/data/*
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
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }


    // ── License verify ──────────────────────────────────────────────────────
    if (url.pathname === '/verify-license' && request.method === 'POST') {
      return handleVerifyLicense(request);
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
    targetUrl = `wss://stream.binance.me:9443/ws/${stream}`;
  } else if (url.pathname.startsWith('/fstream/')) {
    // futures streams: /fstream/{stream}
    const stream = url.pathname.slice(9); // strip /fstream/
    targetUrl = `wss://fstream.binance.me/ws/${stream}`;
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
    targetBase = 'https://api.binance.me';
    targetPath = url.pathname.slice(4); // /api/... → /api/...
  } else if (url.pathname.startsWith('/fapi/')) {
    targetBase = 'https://fapi.binance.me';
    targetPath = url.pathname; // keep /fapi/...
  } else if (url.pathname.startsWith('/fdata/')) {
    targetBase = 'https://fapi.binance.me';
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

// ─── License verify ───────────────────────────────────────────────────────────

async function handleVerifyLicense(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  let body;
  try {
    body = await request.json();
  } catch {
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
    // Hit Gumroad license API
    const gumroadRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id:  GUMROAD_PRODUCT,
        license_key: licenseKey,
      }).toString(),
    });

    const gumroadData = await gumroadRes.json();

    if (gumroadData.success) {
      return new Response(JSON.stringify({
        success: true,
        message: 'License valid.',
        uses:    gumroadData.uses,
        email:   gumroadData.purchase?.email ?? '',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: 'License key tidak valid atau sudah refunded. Cek email Gumroad kamu.',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Gagal verifikasi. Coba beberapa saat lagi.',
    }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
