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

export function registerRoute(path, handler) {
  routes.set(path, handler);
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

export function getHash() {
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

  // Find matching route (exact or pattern)
  let handler = routes.get(path);
  if (!handler) {
    // Try wildcard
    handler = routes.get('*');
  }

  if (handler && appContainer) {
    // Page transition
    appContainer.style.opacity = '0';
    await new Promise(r => setTimeout(r, 150));

    try {
      const content = await handler(path);
      if (typeof content === 'string') {
        appContainer.innerHTML = content;
      }
    } catch (e) {
      console.error('[Router] Error rendering:', path, e);
      appContainer.innerHTML = `<div class="flex items-center justify-center min-h-screen text-on-surface">
        <div class="text-center"><p class="text-xl mb-2">Something went wrong</p><p class="text-on-surface-variant">${e.message}</p></div></div>`;
    }

    appContainer.style.opacity = '1';
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
