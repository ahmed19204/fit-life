/**
 * FitLife AI Request Manager
 * Centralized AI request management to prevent 429 rate-limit errors.
 * 
 * Features:
 * - Request queue with sequential processing (no parallel AI calls)
 * - Request deduplication (same request within window = cached result)
 * - Throttling (minimum interval between requests)
 * - Debounce protection (rapid-fire clicks ignored)
 * - Exponential backoff retry (with max attempts)
 * - Response caching with TTL
 * - Request locking (prevent duplicate in-flight requests)
 * - Global singleton pattern
 */

// ---------- Configuration ----------
const CONFIG = {
  MIN_REQUEST_INTERVAL_MS: 2000,     // Minimum 2s between any AI requests
  DEBOUNCE_MS: 500,                   // Ignore rapid duplicate requests within 500ms
  MAX_RETRIES: 2,                     // Max retry attempts on failure
  RETRY_BASE_DELAY_MS: 3000,          // 3s initial retry delay
  RETRY_MAX_DELAY_MS: 30000,          // 30s max retry delay
  CACHE_TTL_MS: 5 * 60 * 1000,        // 5-minute cache TTL for AI responses
  NUTRITION_CACHE_TTL_MS: 30 * 60 * 1000, // 30-minute cache for nutrition plans
  QUEUE_TIMEOUT_MS: 60000,            // 60s max wait in queue
  MAX_QUEUE_SIZE: 5,                  // Max queued requests
};

// ---------- State ----------
const cache = new Map();               // key → { data, timestamp, ttl }
const inflightRequests = new Map();    // key → Promise (for dedup)
let lastRequestTime = 0;               // Timestamp of last completed request
let isProcessing = false;              // Queue lock
const requestQueue = [];               // { resolve, reject, key, executor, ttl }
let debounceTimers = new Map();        // key → timeout ID

// ---------- Cache Helpers ----------
function getCacheKey(type, payload) {
  try {
    return `${type}:${JSON.stringify(payload)}`;
  } catch {
    return `${type}:${Date.now()}`;
  }
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
  // Prune old entries if cache gets large
  if (cache.size > 50) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > v.ttl) cache.delete(k);
    }
  }
}

/**
 * Clear all cached AI responses (e.g. after profile update)
 */
export function clearAICache() {
  cache.clear();
  console.log('[AI Manager] Cache cleared');
}

/**
 * Clear cache entries matching a prefix
 */
export function clearCacheByPrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// ---------- Throttling ----------
function getTimeSinceLastRequest() {
  return Date.now() - lastRequestTime;
}

async function waitForThrottle() {
  const elapsed = getTimeSinceLastRequest();
  if (elapsed < CONFIG.MIN_REQUEST_INTERVAL_MS) {
    const waitTime = CONFIG.MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise(r => setTimeout(r, waitTime));
  }
}

// ---------- Retry with Exponential Backoff ----------
async function executeWithRetry(executor, retries = CONFIG.MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await executor();
      return result;
    } catch (err) {
      lastError = err;
      const errMsg = String(err?.message || '').toLowerCase();
      const status = err?.status || err?.statusCode;
      
      // Don't retry on client errors (4xx) except 429
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
      
      if (attempt < retries) {
        // Exponential backoff: 3s, 9s, 27s... capped at 30s
        const delay = Math.min(
          CONFIG.RETRY_BASE_DELAY_MS * Math.pow(3, attempt),
          CONFIG.RETRY_MAX_DELAY_MS
        );
        
        // On 429, use longer wait
        const actualDelay = (status === 429 || errMsg.includes('429') || errMsg.includes('rate'))
          ? delay * 2
          : delay;
        
        console.warn(`[AI Manager] Attempt ${attempt + 1} failed, retrying in ${actualDelay}ms...`, err.message);
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
      // Respect throttle
      await waitForThrottle();
      
      // Check cache again (might have been populated while queued)
      const cached = getFromCache(item.key);
      if (cached) {
        item.resolve(cached);
        continue;
      }

      // Check if same request is already inflight
      if (inflightRequests.has(item.key)) {
        try {
          const result = await inflightRequests.get(item.key);
          item.resolve(result);
        } catch (err) {
          item.reject(err);
        }
        continue;
      }

      // Execute with retry
      const promise = executeWithRetry(item.executor);
      inflightRequests.set(item.key, promise);

      const result = await promise;
      lastRequestTime = Date.now();
      
      // Cache the result
      setCache(item.key, result, item.ttl);
      inflightRequests.delete(item.key);
      
      item.resolve(result);
    } catch (err) {
      inflightRequests.delete(item.key);
      item.reject(err);
    }
  }

  isProcessing = false;
}

// ---------- Public API ----------

/**
 * Make a managed AI request.
 * Handles deduplication, caching, throttling, retry, and queue.
 * 
 * @param {string} type - Request type identifier (e.g., 'nutrition-plan', 'chat', 'recipe')
 * @param {*} payload - Request payload (used for cache key)
 * @param {Function} executor - Async function that performs the actual API call
 * @param {object} options - Optional overrides
 * @param {number} options.cacheTTL - Cache TTL in ms
 * @param {boolean} options.skipCache - Skip cache lookup
 * @param {boolean} options.skipQueue - Execute immediately (no queue)
 * @returns {Promise<*>} The AI response
 */
export function makeAIRequest(type, payload, executor, options = {}) {
  const key = getCacheKey(type, payload);
  const ttl = options.cacheTTL || CONFIG.CACHE_TTL_MS;

  // 1. Check cache (unless skipCache)
  if (!options.skipCache) {
    const cached = getFromCache(key);
    if (cached) {
      console.log(`[AI Manager] Cache hit for ${type}`);
      return Promise.resolve(cached);
    }
  }

  // 2. Check for inflight duplicate
  if (inflightRequests.has(key)) {
    console.log(`[AI Manager] Dedup: joining inflight request for ${type}`);
    return inflightRequests.get(key);
  }

  // 3. Check queue size
  if (requestQueue.length >= CONFIG.MAX_QUEUE_SIZE) {
    console.warn(`[AI Manager] Queue full, rejecting ${type}`);
    return Promise.reject(new Error('AI service is busy. Please try again in a moment.'));
  }

  // 4. Enqueue the request
  return new Promise((resolve, reject) => {
    // Timeout protection
    const timeout = setTimeout(() => {
      const idx = requestQueue.findIndex(item => item.key === key);
      if (idx !== -1) {
        requestQueue.splice(idx, 1);
        reject(new Error('AI request timed out in queue.'));
      }
    }, CONFIG.QUEUE_TIMEOUT_MS);

    requestQueue.push({
      key,
      executor,
      ttl,
      resolve: (val) => { clearTimeout(timeout); resolve(val); },
      reject: (err) => { clearTimeout(timeout); reject(err); },
    });

    // Start processing
    processQueue();
  });
}

/**
 * Debounced AI request — prevents rapid-fire requests (e.g., button spam).
 * Returns a promise that resolves after debounce period.
 * 
 * @param {string} type - Request type identifier
 * @param {*} payload - Request payload
 * @param {Function} executor - Async function that performs the actual API call
 * @param {object} options - Same as makeAIRequest options
 * @returns {Promise<*>}
 */
export function makeDebouncedAIRequest(type, payload, executor, options = {}) {
  const key = getCacheKey(type, payload);
  
  // Cancel any pending debounced request for this key
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      debounceTimers.delete(key);
      makeAIRequest(type, payload, executor, options).then(resolve).catch(reject);
    }, CONFIG.DEBOUNCE_MS);
    
    debounceTimers.set(key, timer);
  });
}

/**
 * One-shot AI request — ensures the executor runs AT MOST ONCE.
 * Uses a persistent lock key stored in sessionStorage.
 * Perfect for onboarding plan generation that should never re-run.
 * 
 * @param {string} lockKey - Unique lock identifier (stored in sessionStorage)
 * @param {Function} executor - Async function to run (only if lock is free)
 * @param {*} fallback - Value to return if already executed
 * @returns {Promise<*>}
 */
export async function makeOneShotAIRequest(lockKey, executor, fallback = null) {
  const storageKey = `fitlife-ai-lock:${lockKey}`;
  
  // Check if already executed
  const existing = sessionStorage.getItem(storageKey);
  if (existing) {
    console.log(`[AI Manager] One-shot lock hit for ${lockKey}`);
    try {
      return JSON.parse(existing);
    } catch {
      return fallback;
    }
  }

  // Check if inflight
  if (inflightRequests.has(storageKey)) {
    console.log(`[AI Manager] One-shot dedup for ${lockKey}`);
    return inflightRequests.get(storageKey);
  }

  // Execute
  const promise = makeAIRequest(`oneshot:${lockKey}`, lockKey, executor, { skipCache: true })
    .then(result => {
      // Persist the lock with the result
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(result));
      } catch { /* sessionStorage full — still return result */ }
      inflightRequests.delete(storageKey);
      return result;
    })
    .catch(err => {
      inflightRequests.delete(storageKey);
      throw err;
    });

  inflightRequests.set(storageKey, promise);
  return promise;
}

/**
 * Clear a one-shot lock (e.g., when user wants to regenerate their plan)
 */
export function clearOneShotLock(lockKey) {
  sessionStorage.removeItem(`fitlife-ai-lock:${lockKey}`);
  clearCacheByPrefix(`oneshot:${lockKey}`);
}

/**
 * Get AI manager stats (for debugging / admin)
 */
export function getAIManagerStats() {
  return {
    cacheSize: cache.size,
    queueLength: requestQueue.length,
    inflightCount: inflightRequests.size,
    isProcessing,
    lastRequestTime: lastRequestTime ? new Date(lastRequestTime).toISOString() : 'never',
  };
}
