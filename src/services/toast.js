/**
 * FitLife Toast Notification System (Phase 3)
 * ----------------------------------------------------------------------------
 * Lightweight, dependency-free toast manager with an API that mirrors
 * `react-hot-toast`. Single global container, queueing, auto-dismiss,
 * accessible (role="status"), reduced-motion friendly.
 *
 *   import { toast } from '../services/toast.js';
 *   toast.success('Saved!');
 *   toast.error('Could not save');
 *   const id = toast.loading('Working...');
 *   toast.update(id, { type: 'success', message: 'Done!' });
 *   toast.dismiss(id);
 */

const TOAST_TTL = 3200;
let toastIdSeq = 0;
const active = new Map(); // id → { el, timer }

function ensureContainer() {
  let c = document.getElementById('fl-toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'fl-toast-container';
    c.setAttribute('role', 'region');
    c.setAttribute('aria-label', 'Notifications');
    c.style.cssText = `
      position: fixed; top: env(safe-area-inset-top, 12px); left: 50%;
      transform: translateX(-50%); z-index: 9999; display: flex;
      flex-direction: column; gap: 10px; max-width: 92vw; pointer-events: none;
    `;
    document.body.appendChild(c);
  }
  return c;
}

function iconFor(type) {
  switch (type) {
    case 'success': return '<span class="material-symbols-outlined" style="font-variation-settings:\'FILL\' 1; color:#4be277;">check_circle</span>';
    case 'error':   return '<span class="material-symbols-outlined" style="font-variation-settings:\'FILL\' 1; color:#ffb4ab;">error</span>';
    case 'loading': return '<span class="material-symbols-outlined animate-spin" style="color:#4be277;">progress_activity</span>';
    case 'warning': return '<span class="material-symbols-outlined" style="font-variation-settings:\'FILL\' 1; color:#f1c40f;">warning</span>';
    default:        return '<span class="material-symbols-outlined" style="color:#bccbb9;">notifications</span>';
  }
}

function buildToast(id, type, message) {
  const el = document.createElement('div');
  el.dataset.toastId = String(id);
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.style.cssText = `
    pointer-events: auto;
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; min-width: 220px; max-width: 88vw;
    background: rgba(26,34,26,0.96); color: #dce5d9;
    border: 1px solid rgba(74,225,118,0.18);
    border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 14px; font-weight: 500;
    transform: translateY(-12px) scale(0.96); opacity: 0;
    transition: transform .25s ease, opacity .25s ease;
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  `;
  el.innerHTML = `${iconFor(type)}<span class="fl-toast-msg" style="flex:1;">${String(message ?? '').replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]))}</span>`;
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(0) scale(1)';
    el.style.opacity = '1';
  });
  return el;
}

function show(type, message, opts = {}) {
  const c = ensureContainer();
  const id = ++toastIdSeq;
  const el = buildToast(id, type, message);
  c.appendChild(el);

  let timer = null;
  const ttl = opts.duration ?? (type === 'loading' ? null : TOAST_TTL);
  if (ttl) timer = setTimeout(() => dismiss(id), ttl);

  active.set(id, { el, timer, type });
  return id;
}

function dismiss(id) {
  const entry = active.get(id);
  if (!entry) return;
  const { el, timer } = entry;
  if (timer) clearTimeout(timer);
  el.style.transform = 'translateY(-8px) scale(0.96)';
  el.style.opacity = '0';
  setTimeout(() => { el.remove(); active.delete(id); }, 260);
}

function update(id, { type, message, duration } = {}) {
  const entry = active.get(id);
  if (!entry) return;
  if (type) {
    const iconHost = entry.el.firstElementChild;
    if (iconHost) iconHost.outerHTML = iconFor(type);
    entry.type = type;
  }
  if (message !== undefined) {
    const msgEl = entry.el.querySelector('.fl-toast-msg');
    if (msgEl) msgEl.textContent = String(message);
  }
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
  const ttl = duration ?? (type === 'loading' ? null : TOAST_TTL);
  if (ttl) entry.timer = setTimeout(() => dismiss(id), ttl);
}

function dismissAll() {
  for (const id of Array.from(active.keys())) dismiss(id);
}

export const toast = {
  show:    (msg, opts) => show('default', msg, opts),
  success: (msg, opts) => show('success', msg, opts),
  error:   (msg, opts) => show('error',   msg, opts),
  loading: (msg, opts) => show('loading', msg, opts),
  warning: (msg, opts) => show('warning', msg, opts),
  update,
  dismiss,
  dismissAll,
};

// Friendly retry/connectivity helpers used by app.js
export function notifyRetry(msg = 'AI is busy, retrying…') { return toast.loading(msg); }
export function notifyOnline()  { return toast.success('Connection restored'); }
export function notifyOffline() { return toast.warning('You are offline. Some features may be unavailable.'); }
