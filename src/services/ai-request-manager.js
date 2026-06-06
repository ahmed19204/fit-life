/**
 * FitLife AI Request Manager (Production Hardened — Phase 2)
 * ============================================================================
 * Centralized AI request management to prevent 429 rate-limit errors AND
 * minimize token usage / latency for the user.
 *
 * Features:
 *  - Request queue with sequential processing (no parallel AI calls)
 *  - Request deduplication via cache key (same payload = same promise)
 *  - In-memory cache + persistent localStorage cache (24h TTL)
 *  - Prompt/image hashing (DJB2) for stable, compact cache keys
 *  - Throttling between requests
 *  - Debounce to absorb rapid-fire clicks
 *  - Exponential backoff retry on 429 / 503 / network errors
 *  - AbortController to cancel duplicate in-flight requests
 *  - Cooldown lock per-key to stop spam
 *  - One-shot lock (e.g. onboarding plan) backed by sessionStorage
 *  - Stats helpers for debug overlay
 *  - Cross-tab cache sync via storage events
 */

import { logger } from '../utils/logger.js';
const log = logger.scoped('AIMgr');

// ---------- Configuration ----------
const CONFIG = {
  MIN_REQUEST_INTERVAL_MS: 2000,
  DEBOUNCE_MS: 500,
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY_MS: 3000,
  RETRY_MAX_DELAY_MS: 30000,
  CACHE_TTL_MS: 5 * 60 * 1000,
  PERSIST_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24h persistent cache
  NUTRITION_CACHE_TTL_MS: 30 * 60 * 1000,
  QUEUE_TIMEOUT_MS: 60000,
  MAX_QUEUE_SIZE: 5,
  COOLDOWN_MS: 1500, // anti-spam cooldown after a successful request, per key
  STORAGE_KEY: 'fitlife-ai-cache-v1',
};

// ---------- State ----------
const cache = new Map();
const inflightRequests = new Map();
const inflightControllers = new Map(); // key → AbortController (for abort)
let lastRequestTime = 0;
let isProcessing = false;
const requestQueue = [];
const debounceTimers = new Map();
const cooldowns = new Map(); // key → expiresAt

// ---------- Hashing (DJB2) ----------
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
  return (hash >>> 0).toString(36);
}
export function hashPayload(payload) {
  try { return djb2(typeof payload === 'string' ? payload : JSON.stringify(payload)); }
  catch { return djb2(String(payload ?? Date.now())); }
}

// ---------- Cache Helpers ----------
function getCacheKey(type, payload) {
  return `${type}:${hashPayload(payload)}`;
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl = CONFIG.CACHE_TTL_MS) {
  cache.set(key, { data, timestamp: Date.now(), ttl });
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.timestamp > v.ttl) cache.delete(k);
  }
  // Persist long-lived entries
  if (ttl >= 60 * 60 * 1000) persistCacheWrite(key, data, ttl);
}

// ---------- Persistent (localStorage) cache ----------
function persistRead() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}
function persistFlush(obj) {
  try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(obj)); }
  catch { /* quota — drop silently */ }
}
function persistCacheWrite(key, data, ttl) {
  try {
    const all = persistRead();
    all[key] = { data, timestamp: Date.now(), ttl };
    // prune expired
    const now = Date.now();
    for (const k of Object.keys(all)) {
      if (now - all[k].timestamp > all[k].ttl) delete all[k];
    }
    persistFlush(all);
  } catch { /* ignore */ }
}
function persistCacheRead(key) {
  const all = persistRead();
  const entry = all[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    delete all[key]; persistFlush(all); return null;
  }
  return entry.data;
}

// Hydrate in-memory cache from localStorage on boot
(function hydratePersistentCache() {
  try {
    const all = persistRead();
    const now = Date.now();
    for (const [k, v] of Object.entries(all)) {
      if (v && (now - v.timestamp) < v.ttl) {
        cache.set(k, v);
      }
    }
    log.debug('Hydrated cache entries:', cache.size);
  } catch { /* ignore */ }
})();

// Cross-tab cache sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CONFIG.STORAGE_KEY) {
      const all = persistRead();
      for (const [k, v] of Object.entries(all)) {
        if (Date.now() - v.timestamp < v.ttl) cache.set(k, v);
      }
    }
  });
}

export function clearAICache() {
  cache.clear();
  try { localStorage.removeItem(CONFIG.STORAGE_KEY); } catch {}
  log.info('Cache cleared');
}

export function clearCacheByPrefix(prefix) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
  try {
    const all = persistRead();
    let dirty = false;
    for (const k of Object.keys(all)) if (k.startsWith(prefix)) { delete all[k]; dirty = true; }
    if (dirty) persistFlush(all);
  } catch {}
}

// ---------- Throttling ----------
function getTimeSinceLastRequest() { return Date.now() - lastRequestTime; }
async function waitForThrottle() {
  const elapsed = getTimeSinceLastRequest();
  if (elapsed < CONFIG.MIN_REQUEST_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, CONFIG.MIN_REQUEST_INTERVAL_MS - elapsed));
  }
}

// ---------- Abort previous inflight with same key (true dedup) ----------
function abortInflight(key, reason = 'superseded') {
  const ctrl = inflightControllers.get(key);
  if (ctrl) {
    try { ctrl.abort(reason); } catch {}
    inflightControllers.delete(key);
  }
}

// ---------- Retry with Exponential Backoff ----------
async function executeWithRetry(executor, retries = CONFIG.MAX_RETRIES, signal) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) { const e = new Error('Request aborted'); e.code = 'ABORT'; throw e; }
    try {
      return await executor(signal);
    } catch (err) {
      lastError = err;
      const errMsg = String(err?.message || '').toLowerCase();
      const status = err?.status || err?.statusCode;

      // Abort = stop immediately
      if (err?.code === 'ABORT' || err?.name === 'AbortError') throw err;

      // Don't retry on client errors (4xx) except 429
      if (status && status >= 400 && status < 500 && status !== 429) throw err;

      if (attempt < retries) {
        const delay = Math.min(
          CONFIG.RETRY_BASE_DELAY_MS * Math.pow(3, attempt),
          CONFIG.RETRY_MAX_DELAY_MS
        );
        const isRate = (status === 429 || errMsg.includes('429') || errMsg.includes('rate'));
        const isTimeout = errMsg.includes('timeout') || errMsg.includes('econnreset');
        const actualDelay = (isRate || isTimeout) ? delay * 2 : delay;
        log.warn(`Attempt ${attempt + 1} failed, retrying in ${actualDelay}ms — ${err.message}`);
        await new Promise(r => setTimeout(r, actualDelay));
      }
    }
  }
  throw lastError;
}

// ---------- Queue Processor ----------
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    const item = requestQueue.shift();
    if (!item) continue;

    try {
      await waitForThrottle();
      const cached = getFromCache(item.key);
      if (cached) { item.resolve(cached); continue; }

      if (inflightRequests.has(item.key)) {
        try {
          const result = await inflightRequests.get(item.key);
          item.resolve(result);
        } catch (err) { item.reject(err); }
        continue;
      }

      const controller = new AbortController();
      inflightControllers.set(item.key, controller);
      const promise = executeWithRetry(item.executor, CONFIG.MAX_RETRIES, controller.signal);
      inflightRequests.set(item.key, promise);

      try {
        const result = await promise;
        lastRequestTime = Date.now();
        setCache(item.key, result, item.ttl);
        cooldowns.set(item.key, Date.now() + CONFIG.COOLDOWN_MS);
        item.resolve(result);
      } finally {
        inflightRequests.delete(item.key);
        inflightControllers.delete(item.key);
      }
    } catch (err) {
      inflightRequests.delete(item.key);
      inflightControllers.delete(item.key);
      item.reject(err);
    }
  }

  isProcessing = false;
}

// ---------- Public API ----------

/**
 * Make a managed AI request.
 * @param {string} type - Request type identifier (e.g., 'nutrition-plan', 'chat')
 * @param {*} payload - Used for cache key (hashed)
 * @param {(signal:AbortSignal)=>Promise<any>} executor - Async API call
 * @param {object} [options]
 * @param {number} [options.cacheTTL]
 * @param {boolean} [options.skipCache]
 * @param {boolean} [options.persistent] — persist in localStorage (24h)
 * @param {boolean} [options.abortPrevious] — abort previous inflight with same key
 */
export function makeAIRequest(type, payload, executor, options = {}) {
  const key = getCacheKey(type, payload);
  const ttl = options.cacheTTL || (options.persistent ? CONFIG.PERSIST_CACHE_TTL_MS : CONFIG.CACHE_TTL_MS);

  // 1. Cache
  if (!options.skipCache) {
    const cached = getFromCache(key);
    if (cached) { log.debug('Cache hit', type); return Promise.resolve(cached); }
    // Persistent layer fallback
    const persisted = options.persistent ? persistCacheRead(key) : null;
    if (persisted) { cache.set(key, { data: persisted, timestamp: Date.now(), ttl }); return Promise.resolve(persisted); }
  }

  // 2. Cooldown guard
  const cooldownUntil = cooldowns.get(key) || 0;
  if (cooldownUntil > Date.now() && !options.skipCache) {
    log.debug('Cooldown active for', type);
    const cached = getFromCache(key);
    if (cached) return Promise.resolve(cached);
  }

  // 3. Dedup inflight (or abort previous if requested)
  if (inflightRequests.has(key)) {
    if (options.abortPrevious) abortInflight(key, 'replaced');
    else { log.debug('Joining inflight', type); return inflightRequests.get(key); }
  }

  // 4. Queue size guard
  if (requestQueue.length >= CONFIG.MAX_QUEUE_SIZE) {
    log.warn('Queue full, rejecting', type);
    return Promise.reject(Object.assign(new Error('AI service is busy. Please try again in a moment.'), { code: 'QUEUE_FULL' }));
  }

  // 5. Enqueue
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = requestQueue.findIndex(item => item.key === key);
      if (idx !== -1) {
        requestQueue.splice(idx, 1);
        reject(Object.assign(new Error('AI request timed out in queue.'), { code: 'QUEUE_TIMEOUT' }));
      }
    }, CONFIG.QUEUE_TIMEOUT_MS);

    requestQueue.push({
      key, executor, ttl,
      resolve: (val) => { clearTimeout(timeout); resolve(val); },
      reject: (err) => { clearTimeout(timeout); reject(err); },
    });
    processQueue();
  });
}

/** Debounced wrapper — absorbs rapid-fire clicks within DEBOUNCE_MS */
export function makeDebouncedAIRequest(type, payload, executor, options = {}) {
  const key = getCacheKey(type, payload);
  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      debounceTimers.delete(key);
      makeAIRequest(type, payload, executor, options).then(resolve).catch(reject);
    }, CONFIG.DEBOUNCE_MS);
    debounceTimers.set(key, timer);
  });
}

/** Abort a specific inflight request (e.g., user navigated away) */
export function abortRequest(type, payload) {
  abortInflight(getCacheKey(type, payload), 'user-aborted');
}

/** One-shot lock (e.g., onboarding plan) — persisted in sessionStorage */
export async function makeOneShotAIRequest(lockKey, executor, fallback = null) {
  const storageKey = `fitlife-ai-lock:${lockKey}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) {
    log.debug('One-shot lock hit', lockKey);
    try { return JSON.parse(existing); } catch { return fallback; }
  }
  if (inflightRequests.has(storageKey)) return inflightRequests.get(storageKey);

  const promise = makeAIRequest(`oneshot:${lockKey}`, lockKey, executor, { skipCache: true })
    .then(result => {
      try { sessionStorage.setItem(storageKey, JSON.stringify(result)); } catch {}
      inflightRequests.delete(storageKey);
      return result;
    })
    .catch(err => { inflightRequests.delete(storageKey); throw err; });

  inflightRequests.set(storageKey, promise);
  return promise;
}

export function clearOneShotLock(lockKey) {
  sessionStorage.removeItem(`fitlife-ai-lock:${lockKey}`);
  clearCacheByPrefix(`oneshot:${lockKey}`);
}

export function getAIManagerStats() {
  return {
    cacheSize: cache.size,
    queueLength: requestQueue.length,
    inflightCount: inflightRequests.size,
    isProcessing,
    lastRequestTime: lastRequestTime ? new Date(lastRequestTime).toISOString() : 'never',
  };
}
