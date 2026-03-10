/**
 * sw.js — ZERØ ORDER BOOK v62 Service Worker
 * Strategy:
 *   - App shell: cache-first (HTML, JS, CSS, fonts)
 *   - API calls: network-only (never cache live data)
 *   - Offline: serve cached shell
 */

const CACHE_VERSION = 'zero-ob-v80';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;

// App shell assets to pre-cache
const SHELL_ASSETS = [
  '/',
  '/index.html',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {/* non-fatal */})
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // WebSocket — never intercept
  if (event.request.url.startsWith('ws://') || event.request.url.startsWith('wss://')) return;

  // Exchange API calls — always network-only
  if (
    url.hostname.includes('binance') ||
    url.hostname.includes('bybit') ||
    url.hostname.includes('coinbase') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('gumroad')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fonts — network first, fallback to cache
  if (url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const resp = await fetch(event.request);
        if (resp.ok) cache.put(event.request, resp.clone());
        return resp;
      }).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // App shell: cache-first, network fallback
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) {
        // Refresh in background
        fetch(event.request).then((resp) => {
          if (resp.ok) cache.put(event.request, resp.clone());
        }).catch(() => {});
        return cached;
      }
      const resp = await fetch(event.request);
      if (resp.ok && event.request.method === 'GET') {
        cache.put(event.request, resp.clone());
      }
      return resp;
    }).catch(async () => {
      // Offline fallback — serve index.html for navigation
      if (event.request.mode === 'navigate') {
        const cache = await caches.open(SHELL_CACHE);
        return cache.match('/') || cache.match('/index.html') ||
          new Response('<h1>ZERØ ORDER BOOK — Offline</h1>', { headers: { 'Content-Type': 'text/html' }});
      }
      return new Response('', { status: 503 });
    })
  );
});

// ── Background sync hint (for future use) ────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
