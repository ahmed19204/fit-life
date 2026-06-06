/**
 * FitLife Service Worker — Production Hardened (Phase 4)
 * ----------------------------------------------------------------------------
 * Strategy:
 *  - Precache shell (HTML, manifest, icons, offline page)
 *  - Stale-while-revalidate for fonts & CDN (Tailwind/JSDelivr)
 *  - Network-first for Supabase + Gemini APIs (with 6s timeout)
 *  - Offline fallback page for failed navigations
 *  - Auto-skipWaiting + clients.claim on activate
 *  - SKIP_WAITING postMessage hook for app-triggered updates
 */

const CACHE_VERSION = 'fitlife-v2.0.0';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const FONTS_CACHE   = `${CACHE_VERSION}-fonts`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/assets/icons/favicon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

const NETWORK_FIRST_HOSTS = [
  'supabase.co',
  'supabase.in',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
];

const STALE_WHILE_REVALIDATE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
];

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, FONTS_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── App-triggered update ──────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Helpers ───────────────────────────────────────────────────────────────
function isNetworkFirstHost(url) {
  return NETWORK_FIRST_HOSTS.some((h) => url.hostname.includes(h));
}
function isSWRHost(url) {
  return STALE_WHILE_REVALIDATE_HOSTS.some((h) => url.hostname.includes(h));
}

async function networkFirst(request, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || networkFetch;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && request.method === 'GET') cache.put(request, res.clone());
  return res;
}

async function navigationHandler(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // SPA navigation → offline fallback if no network
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Same-origin assets (JS/CSS/images/icons)
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/') || /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(request, RUNTIME_CACHE));
      return;
    }
    // Manifest, offline.html, etc.
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Third-party: APIs (Supabase, Gemini)
  if (isNetworkFirstHost(url)) {
    event.respondWith(networkFirst(request, 6000));
    return;
  }
  // Fonts & CDN
  if (isSWRHost(url)) {
    event.respondWith(staleWhileRevalidate(request, FONTS_CACHE));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
