/**
 * FreeAds Post - Server-Side Rate Limiter
 * 
 * Provides rate limiting using Google Apps Script's native CacheService.
 * Includes an in-memory fallback for local Node.js testing environments.
 */

const RateLimiter = (function() {
  const fallbackCache = {};

  function getCache() {
    if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
      return CacheService.getScriptCache();
    }
    // In-memory fallback for test runner
    return {
      get: function(key) {
        const item = fallbackCache[key];
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
          delete fallbackCache[key];
          return null;
        }
        return item.value;
      },
      put: function(key, value, expirationInSeconds) {
        fallbackCache[key] = {
          value: String(value),
          expiresAt: Date.now() + (expirationInSeconds * 1000)
        };
      },
      remove: function(key) {
        delete fallbackCache[key];
      }
    };
  }

  /**
   * Evaluates request rate for a given key within a sliding expiration window.
   * 
   * @param {string} key - Unique rate-limit identifier
   * @param {number} maxRequests - Allowed requests in the window
   * @param {number} windowSeconds - Expiration window in seconds
   * @returns {{ allowed: boolean, count: number, remaining: number }}
   */
  function checkLimit(key, maxRequests, windowSeconds) {
    const cache = getCache();
    const cacheKey = 'rl:' + key.replace(/[^a-zA-Z0-9_:.-]/g, '_');
    const currentVal = cache.get(cacheKey);

    let count = 0;
    if (currentVal) {
      count = parseInt(currentVal, 10) || 0;
    }

    if (count >= maxRequests) {
      return {
        allowed: false,
        count: count,
        remaining: 0
      };
    }

    count += 1;
    cache.put(cacheKey, String(count), windowSeconds);

    return {
      allowed: true,
      count: count,
      remaining: Math.max(0, maxRequests - count)
    };
  }

  /**
   * Middleware creator for rate-limited endpoints.
   */
  function createMiddleware(keyExtractor, maxRequests, windowSeconds, actionLabel) {
    return function(handler) {
      return function(req) {
        const key = keyExtractor(req);
        const result = checkLimit(key, maxRequests, windowSeconds);

        if (!result.allowed) {
          return Responses.error(
            'RATE_LIMIT_EXCEEDED',
            `Too many requests for ${actionLabel || 'this action'}. Please try again later.`,
            429,
            { retry_after_seconds: windowSeconds }
          );
        }

        return handler(req);
      };
    };
  }

  return {
    checkLimit: checkLimit,
    createMiddleware: createMiddleware,
    // Pre-configured middlewares
    limitRegister: createMiddleware(
      function(req) { return 'reg:' + ((req.body && req.body.email) || 'anon'); },
      10,
      900,
      'registration'
    ),
    limitLogin: createMiddleware(
      function(req) { return 'login:' + ((req.body && req.body.email) || 'anon'); },
      15,
      900,
      'login'
    ),
    limitVerifyEmail: createMiddleware(
      function(req) { return 'verify:' + ((req.body && req.body.token) || 'anon'); },
      15,
      900,
      'email verification'
    ),
    limitCreateAd: createMiddleware(
      function(req) { return 'ad_create:' + ((req.user && req.user.user_id) || 'anon'); },
      30,
      3600,
      'ad creation'
    )
  };
})();
