/**
 * FitLife Production-Safe Logger
 * ----------------------------------------------------------------------------
 * - In dev (import.meta.env.DEV) → full console logs
 * - In production → only warnings/errors surface to console; info is silenced
 * - Always includes structured supabase error context (message/details/hint)
 * - Safe to import anywhere
 */

const IS_DEV = (() => {
  try { return Boolean(import.meta?.env?.DEV); } catch { return false; }
})();

function format(level, scope, args) {
  const prefix = `[FitLife${scope ? ':' + scope : ''}]`;
  return [prefix, ...args];
}

export const logger = {
  debug: (...a) => { if (IS_DEV) console.debug(...format('debug', '', a)); },
  info: (...a) => { if (IS_DEV) console.log(...format('info', '', a)); },
  warn: (...a) => { console.warn(...format('warn', '', a)); },
  error: (...a) => { console.error(...format('error', '', a)); },
  scoped(scope) {
    return {
      debug: (...a) => { if (IS_DEV) console.debug(...format('debug', scope, a)); },
      info: (...a) => { if (IS_DEV) console.log(...format('info', scope, a)); },
      warn: (...a) => { console.warn(...format('warn', scope, a)); },
      error: (...a) => { console.error(...format('error', scope, a)); },
    };
  },
};

/**
 * Extract a rich diagnostic record from a Supabase / PostgREST error.
 * Includes message, details, hint, code, status — useful for debugging
 * "Failed to save meal" type issues.
 */
export function describeSupabaseError(error, context = {}) {
  if (!error) return { message: 'Unknown error', context };
  return {
    message: error.message || String(error),
    details: error.details || null,
    hint: error.hint || null,
    code: error.code || error.status || null,
    status: error.status || null,
    name: error.name || null,
    ...context,
  };
}

/**
 * Log a Supabase error with full diagnostic context.
 * Always logs (warn level) even in production so support can debug.
 */
export function logSupabaseError(scope, operation, error, extra = {}) {
  const diag = describeSupabaseError(error, { operation, ...extra });
  console.warn(`[FitLife:${scope}] ${operation} failed`, diag);
  return diag;
}
