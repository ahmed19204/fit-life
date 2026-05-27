/**
 * FitLife Standardized Response Helpers
 * Consistent success/failure response objects across all services.
 *
 * ok(message, data?)   → { success: true, message, data }
 * fail(code, message?, error?, extraData?)
 *   → { success: false, message, data: { code, error?, ...extraData } }
 *
 * Shorthand: fail('Some message') treats the first arg as both code and message
 * when no second string is supplied.
 */

export function ok(message, data) {
  return { success: true, message: message || '', data: data || {} };
}

/**
 * Build a standardised failure response.
 *
 * Supported call patterns:
 *   fail('SOME_CODE', 'Human message', errorObj, { extra: 'data' })
 *   fail('SOME_CODE', 'Human message', errorObj)
 *   fail('SOME_CODE', 'Human message')
 *   fail('Human-readable message')            ← code = 'ERROR'
 *   fail('Human-readable message', { extra })  ← code = 'ERROR', extra merged
 */
export function fail(code, message, error, extraData) {
  // If only one arg or second arg is a plain object (not Error), treat first as message
  if (message === undefined || (typeof message === 'object' && message !== null && !(message instanceof Error))) {
    const extra = typeof message === 'object' ? message : undefined;
    return _buildFail('ERROR', code, undefined, extra);
  }

  // If error is a plain object but NOT an Error instance, treat it as extraData
  if (error && typeof error === 'object' && !(error instanceof Error) && !error.message) {
    return _buildFail(code, message, undefined, error);
  }

  return _buildFail(code, message, error, extraData);
}

function _buildFail(code, message, error, extraData) {
  const data = {
    code: code || 'UNKNOWN_ERROR',
    ...(error ? {
      error: {
        message: error.message || 'Unexpected error',
        status: error.status || null,
      },
    } : {}),
    ...(extraData || {}),
  };

  return { success: false, message: message || code || 'An error occurred', data };
}
