/**
 * FitLife Global Loading State Manager (Phase 3)
 * ----------------------------------------------------------------------------
 * - Centralized count of in-flight operations
 * - Auto-disables ALL form buttons inside elements marked [data-loading-scope]
 *   while a loading task is running
 * - Shows a thin top progress bar (YouTube-style) for active operations
 * - Subscribe API for UI components
 *
 *   import { withLoading, isLoading, onLoadingChange } from '../services/loading.js';
 *   const result = await withLoading('save-meal', () => saveMeal(...));
 */

const tasks = new Map(); // id → label
const listeners = new Set();
let barEl = null;

function ensureBar() {
  if (barEl) return barEl;
  barEl = document.createElement('div');
  barEl.id = 'fl-global-progress';
  barEl.setAttribute('aria-hidden', 'true');
  barEl.style.cssText = `
    position: fixed; top: 0; left: 0; height: 2px; width: 0%;
    background: linear-gradient(90deg, #22c55e, #4be277, #9ddf2e);
    z-index: 10000; transition: width .25s ease, opacity .25s ease;
    opacity: 0; pointer-events: none;
  `;
  document.body.appendChild(barEl);
  return barEl;
}

function updateBar() {
  const bar = ensureBar();
  const n = tasks.size;
  if (n === 0) {
    bar.style.width = '100%';
    bar.style.opacity = '0';
    setTimeout(() => { if (tasks.size === 0) bar.style.width = '0%'; }, 250);
  } else {
    bar.style.opacity = '1';
    // Show indeterminate-ish progress
    const target = Math.min(85, 30 + n * 15);
    bar.style.width = target + '%';
  }
}

function broadcast() {
  const snap = { count: tasks.size, labels: Array.from(tasks.values()) };
  for (const fn of listeners) {
    try { fn(snap); } catch {}
  }
  // Toggle disabled state on buttons inside scoped containers
  document.querySelectorAll('[data-loading-scope]').forEach(scope => {
    const isBusy = snap.count > 0;
    scope.classList.toggle('is-loading', isBusy);
    scope.querySelectorAll('button[type="submit"], button[data-loading-bind]').forEach(btn => {
      btn.disabled = isBusy;
      if (isBusy) btn.setAttribute('aria-busy', 'true');
      else btn.removeAttribute('aria-busy');
    });
  });
  updateBar();
}

export function startLoading(label = 'loading') {
  const id = Symbol(label);
  tasks.set(id, label);
  broadcast();
  return id;
}
export function stopLoading(id) {
  if (id && tasks.delete(id)) broadcast();
}
export function isLoading() { return tasks.size > 0; }
export function onLoadingChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Wrap an async function with global loading state.
 *   await withLoading('save-meal', () => saveMeal(...));
 */
export async function withLoading(label, fn) {
  const id = startLoading(label);
  try { return await fn(); }
  finally { stopLoading(id); }
}
