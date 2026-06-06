/**
 * Smooth Typing Animation (Phase 3)
 * ----------------------------------------------------------------------------
 * Renders text into a DOM element with a natural typing cadence and a blinking
 * caret. Respects prefers-reduced-motion (instant render).
 *
 *   import { typeInto } from '../utils/typing.js';
 *   await typeInto(el, 'Hello there!', { cps: 70, formatter: (s) => safeHtml(s) });
 */

const REDUCED = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

export async function typeInto(el, text, opts = {}) {
  if (!el) return;
  const {
    cps = 60,                  // characters per second
    formatter = (s) => s,      // optional HTML formatter applied to running text
    caret = true,              // show blinking caret
    onChunk = null,            // (current) => void  (e.g. autoscroll)
  } = opts;

  const safeText = String(text ?? '');

  // Reduced motion or empty → render instantly
  if (REDUCED || cps <= 0 || safeText.length === 0) {
    el.innerHTML = formatter(safeText);
    onChunk?.(safeText);
    return;
  }

  // Caret CSS injected once
  if (caret && !document.getElementById('fl-caret-style')) {
    const s = document.createElement('style');
    s.id = 'fl-caret-style';
    s.textContent = `
      .fl-caret::after { content:'▍'; display:inline-block; margin-left:2px;
        animation: fl-blink 1s steps(2,start) infinite; color: currentColor; opacity: .55; }
      @keyframes fl-blink { to { visibility: hidden; } }
    `;
    document.head.appendChild(s);
  }

  el.classList.toggle('fl-caret', !!caret);
  const stepMs = Math.max(8, Math.round(1000 / cps));
  // Type by word-bursts for natural feel; fallback to char-by-char on short text
  const chunks = safeText.length > 200
    ? safeText.match(/\S+\s*|\s+/g) || [safeText]
    : safeText.split('');

  let acc = '';
  for (let i = 0; i < chunks.length; i++) {
    acc += chunks[i];
    el.innerHTML = formatter(acc);
    onChunk?.(acc);
    await new Promise(r => setTimeout(r, stepMs * (typeof chunks[i] === 'string' && chunks[i].length > 1 ? chunks[i].length : 1)));
  }
  el.classList.remove('fl-caret');
}

/**
 * Add a typing indicator (three dots) inside an element.
 * Returns a cleanup function.
 */
export function showTypingIndicator(el) {
  if (!el) return () => {};
  const id = 'fl-typing-' + Math.random().toString(36).slice(2);
  el.innerHTML = `
    <span id="${id}" class="inline-flex items-center gap-1 py-2 px-3 rounded-2xl bg-surface-container border border-outline-variant/15">
      <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay:0ms"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay:140ms"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay:280ms"></span>
    </span>`;
  return () => { const n = document.getElementById(id); if (n) n.remove(); };
}
