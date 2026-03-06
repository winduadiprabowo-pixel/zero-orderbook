/**
 * zero-orderbook-proxy — Cloudflare Worker v5
 * FIX: hapus port 9443 — CF Worker hanya support outbound port 443
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
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (url.pathname === '/verify-license' && request.method === 'POST') return handleVerifyLicense(request);
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') return handleWebSocket(request, url);
    return handleRest(request, url);
  },
};

async function handleWebSocket(request, url) {
  let targetUrl;
  if (url.pathname.startsWith('/ws/')) {
    targetUrl = 'wss://stream.binance.me/ws/' + url.pathname.slice(4);
  } else if (url.pathname.startsWith('/fstream/')) {
    targetUrl = 'wss://fstream.binance.me/ws/' + url.pathname.slice(9);
  } else {
    return new Response('Unknown WS route', { status: 404 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  const upstream = new WebSocket(targetUrl);
  server.accept();
  server.addEventListener('message', (e) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(e.data); });
  server.addEventListener('close', (e) => { try { upstream.close(e.code, e.reason); } catch {} });
  server.addEventListener('error', () => { try { upstream.close(); } catch {} });
  upstream.addEventListener('message', (e) => { try { server.send(e.data); } catch {} });
  upstream.addEventListener('close', (e) => { try { server.close(e.code, e.reason); } catch {} });
  upstream.addEventListener('error', () => { try { server.close(1011, 'upstream error'); } catch {} });
  return new Response(null, { status: 101, webSocket: client });
}

async function handleRest(request, url) {
  let targetBase, targetPath;
  if (url.pathname.startsWith('/api/')) { targetBase = 'https://api.binance.me'; targetPath = url.pathname; }
  else if (url.pathname.startsWith('/fapi/')) { targetBase = 'https://fapi.binance.me'; targetPath = url.pathname; }
  else if (url.pathname.startsWith('/fdata/')) { targetBase = 'https://fapi.binance.me'; targetPath = '/futures/data/' + url.pathname.slice(7); }
  else return new Response('Not found', { status: 404, headers: CORS_HEADERS });

  try {
    const response = await fetch(targetBase + targetPath + url.search, {
      method: request.method,
      headers: { 'User-Agent': 'zero-orderbook-proxy/1.0' },
      cf: { cacheTtl: 5, cacheEverything: false },
    });
    const body = await response.arrayBuffer();
    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
    headers.set('Cache-Control', 'no-store');
    return new Response(body, { status: response.status, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'proxy error', detail: String(err) }), {
      status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

async function handleVerifyLicense(request) {
  const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ success: false, message: 'Bad request.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
  const licenseKey = (body.license_key ?? '').trim();
  if (!licenseKey) return new Response(JSON.stringify({ success: false, message: 'License key wajib diisi.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const gumroadRes = await fetch('https://api.gumroad.com/v2/licenses/verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ product_id: GUMROAD_PRODUCT, license_key: licenseKey }).toString() });
    const gumroadData = await gumroadRes.json();
    if (gumroadData.success) return new Response(JSON.stringify({ success: true, message: 'License valid.', uses: gumroadData.uses, email: gumroadData.purchase?.email ?? '' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: false, message: 'License key tidak valid atau sudah refunded.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch { return new Response(JSON.stringify({ success: false, message: 'Gagal verifikasi.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
}
