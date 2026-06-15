/**
 * FitLife SPA Router
 * Hash-based SPA routing for seamless navigation.
 * Supports route guards, transitions, and deep linking.
 */

const routes = new Map();
let currentRoute = null;
let appContainer = null;
let beforeEachGuard = null;

export function setContainer(el) {
  appContainer = typeof el === 'string' ? document.getElementById(el) : el;
}

export function setBeforeEach(fn) {
  beforeEachGuard = fn;
}

export function registerRoutes(routeMap) {
  Object.entries(routeMap).forEach(([path, handler]) => routes.set(path, handler));
}

export function navigate(path) {
  window.location.hash = path;
}

export function replace(path) {
  window.history.replaceState(null, '', '#' + path);
  handleRouteChange();
}

export function getCurrentRoute() {
  return currentRoute;
}

function getHash() {
  return window.location.hash.slice(1) || '/';
}

async function handleRouteChange() {
  const hash = getHash();
  const path = hash.split('?')[0];

  if (beforeEachGuard) {
    const allowed = await beforeEachGuard(path, currentRoute);
    if (allowed === false) return;
    if (typeof allowed === 'string' && allowed !== path) {
      navigate(allowed);
      return;
    }
  }

  currentRoute = path;

  // Find matching route (exact or wildcard)
  let handler = routes.get(path);
  if (!handler) {
    handler = routes.get('*');
  }

  if (handler && appContainer) {
    // Page transition — smooth fade
    appContainer.style.opacity = '0';
    appContainer.style.transform = 'translateY(4px)';
    await new Promise(r => setTimeout(r, 120));

    try {
      const content = await handler(path);
      if (typeof content === 'string') {
        appContainer.innerHTML = content;
      }
    } catch (e) {
      console.error('[Router] Error rendering:', path, e);
      // Safely escape error message to prevent XSS
      const safeMsg = String(e.message || 'Unknown error').replace(/[<>"'&]/g, c =>
        ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' })[c]
      );
      appContainer.innerHTML = `<div class="flex items-center justify-center min-h-screen text-on-surface bg-surface px-6 pl-safe pr-safe pt-safe pb-safe overflow-x-hidden" style="min-height:100dvh;">
        <div class="text-center max-w-md"><p class="text-xl mb-2">Something went wrong</p><p class="text-on-surface-variant break-words">${safeMsg}</p></div></div>`;
    }

    appContainer.style.opacity = '1';
    appContainer.style.transform = 'translateY(0)';
  }
}

export function start() {
  window.addEventListener('hashchange', handleRouteChange);
  if (!window.location.hash) {
    window.location.hash = '/';
  } else {
    handleRouteChange();
  }
}

export function getQueryParams() {
  const hash = window.location.hash.slice(1);
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return {};
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const obj = {};
  params.forEach((v, k) => obj[k] = v);
  return obj;
}
