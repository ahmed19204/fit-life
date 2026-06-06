/**
 * FitLife Service Worker
 * Provides offline support, caching strategy, and PWA installability.
 */

const CACHE_VERSION = 'fitlife-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/assets/icons/favicon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

// External CDN resources to cache on first use
const CDN_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
];

// API patterns that should use network-first
const API_PATTERNS = [
  'supabase.co',
  'generativelanguage.googleapis.com',
];

// Install: Precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== API_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // API requests: Network-first with timeout
  if (API_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(networkFirstWithTimeout(request, API_CACHE, 5000));
    return;
  }

  // CDN resources: Cache-first (they're versioned)
  if (CDN_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Same-origin requests: Stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Everything else: Network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// Cache-first strategy
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

// Network-first strategy
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

// Network-first with timeout
async function networkFirstWithTimeout(request, cacheName, timeout) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

// Stale-while-revalidate
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  
  const fetchPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || offlineFallback();
}

// Offline fallback page
function offlineFallback() {
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FitLife - Offline</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          background: #0e150e; color: #dce5d9;
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; padding: 24px; text-align: center;
        }
        .container { max-width: 380px; }
        .icon { font-size: 64px; margin-bottom: 24px; }
        h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
        p { color: #bccbb9; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
        button {
          background: #22c55e; color: #004b1e; border: none;
          padding: 12px 32px; border-radius: 999px; font-weight: 700;
          font-size: 14px; cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">📡</div>
        <h1>You're Offline</h1>
        <p>FitLife needs an internet connection to sync your data. Please check your connection and try again.</p>
        <button onclick="window.location.reload()">Try Again</button>
      </div>
    </body>
    </html>
  `, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// Background sync for meal data (when available)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-meals') {
    event.waitUntil(syncMeals());
  }
});

async function syncMeals() {
  // Future: sync offline meal entries when connection restored
  console.log('[SW] Background sync: meals');
}
