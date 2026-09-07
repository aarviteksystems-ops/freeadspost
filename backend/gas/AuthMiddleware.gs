/**
 * FreeAds Post - Authentication & Authorization Middleware
 * 
 * Validates session tokens against the Sessions worksheet, checks token expiration,
 * and enforces role-based access control.
 * Passwords and tokens use salted SHA-256 digests via Utilities.computeDigest.
 */

const Auth = (function() {

  /**
   * Generates a 32-character random hex salt.
   */
  function generateSalt() {
    return Utilities.getUuid().replace(/-/g, '');
  }

  /**
   * Computes salted SHA-256 hash formatted as 'hash:salt'.
   */
  function hashPassword(password, salt = null) {
    const s = salt || generateSalt();
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + s);
    const hashHex = digest.map(function(byte) {
      const v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');

    return `${hashHex}:${s}`;
  }

  /**
   * Verifies plain-text password against stored 'hash:salt' string.
   */
  function verifyPassword(password, storedHashWithSalt) {
    if (!storedHashWithSalt || !storedHashWithSalt.includes(':')) {
      return false;
    }
    const parts = storedHashWithSalt.split(':');
    const salt = parts[1];
    const computed = hashPassword(password, salt);
    return computed === storedHashWithSalt;
  }

  /**
   * Computes SHA-256 hash of a raw session or verification token.
   */
  function hashToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return '';
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawToken);
    return digest.map(function(byte) {
      const v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
  }

  /**
   * Extracts bearer token from request payload, headers, or query parameters.
   */
  function extractToken(request) {
    if (request.body && request.body.token) {
      return String(request.body.token).trim();
    }
    if (request.headers && (request.headers.Authorization || request.headers.authorization)) {
      const authHeader = request.headers.Authorization || request.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
      }
      return authHeader.trim();
    }
    if (request.params && request.params.token) {
      return String(request.params.token).trim();
    }
    return null;
  }

  /**
   * Resolves authentication from session token.
   * Checks token existence, expiration, and user account status.
   * 
   * @param {Object} request - Parsed request object
   * @returns {Object} { user, session, error }
   */
  function resolveAuth(request) {
    if (!request) {
      return {
        user: null,
        session: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication is required to access this resource.', status: 401 }
      };
    }

    // In-execution memoization: Avoid re-checking session & user during the same HTTP request
    if (request._resolvedAuth) {
      return request._resolvedAuth;
    }

    const token = extractToken(request);
    if (!token) {
      const errRes = {
        user: null,
        session: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication is required to access this resource.', status: 401 }
      };
      request._resolvedAuth = errRes;
      return errRes;
    }

    const tokenHash = hashToken(token);

    // Look up session in Sessions sheet by token_hash via fast targeted findByKey
    let session = null;
    try {
      session = Sheets.findByKey('Sessions', 'token_hash', tokenHash);
      if (!session) {
        session = Sheets.findByKey('Sessions', 'tokenHash', tokenHash);
      }
    } catch (e) {
      LoggerUtil.warn('Sessions lookup failed: ' + e.toString());
    }

    if (!session) {
      const errRes = {
        user: null,
        session: null,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or unrecognized session. Please log in.', status: 401 }
      };
      request._resolvedAuth = errRes;
      return errRes;
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(session.expires_at || session.expiresAt);
    if (isNaN(expiresAt.getTime()) || now > expiresAt) {
      // Session has expired - clean it up
      try {
        Sheets.remove('Sessions', 'session_id', session.session_id || session.id);
      } catch (e) {}
      const errRes = {
        user: null,
        session: null,
        error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please log in again.', status: 401 }
      };
      request._resolvedAuth = errRes;
      return errRes;
    }

    // Retrieve user profile
    const userId = session.user_id || session.userId;
    const user = Sheets.findByKey('Users', 'user_id', userId);
    if (!user) {
      const errRes = {
        user: null,
        session: null,
        error: { code: 'UNAUTHORIZED', message: 'User account associated with this session no longer exists.', status: 401 }
      };
      request._resolvedAuth = errRes;
      return errRes;
    }

    // Check if account is active
    if (user.account_status !== 'ACTIVE') {
      const errRes = {
        user: null,
        session: null,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been deactivated or suspended.', status: 403 }
      };
      request._resolvedAuth = errRes;
      return errRes;
    }

    // Check email verification
    const requireVerification = Config.get('REQUIRE_EMAIL_VERIFICATION') === true || Config.get('REQUIRE_EMAIL_VERIFICATION') === 'true';
    const isVerified = (user.email_verified === true || user.email_verified === 'TRUE' || String(user.email_verified).toLowerCase() === 'true');
    if (requireVerification && !isVerified) {
      const errRes = {
        user: null,
        session: null,
        error: { code: 'EMAIL_NOT_VERIFIED', message: 'Your email address is not verified. Please verify your email before continuing.', status: 403 }
      };
      request._resolvedAuth = errRes;
      return errRes;
    }

    const authSuccess = {
      user: user,
      session: session,
      error: null
    };
    request._resolvedAuth = authSuccess;
    return authSuccess;
  }

  /**
   * Helper that returns the authenticated user or null.
   */
  function authenticate(request) {
    const result = resolveAuth(request);
    return result.user;
  }

  /**
   * Middleware requiring a valid authenticated user session.
   */
  function requireAuth(handler) {
    return function(request) {
      const authResult = resolveAuth(request);
      if (authResult.error) {
        return Responses.error(authResult.error.code, authResult.error.message, authResult.error.status || 401);
      }

      request.user = authResult.user;
      request.session = authResult.session;
      return handler(request);
    };
  }

  /**
   * Verifies whether an authenticated user is listed as an active administrator
   * in the Admins Google Sheet.
   * 
   * NEVER trusts user.role, request payloads, or client state.
   */
  function checkAdminStatus(user) {
    if (!user || !user.email) return false;
    if (user._isAdmin !== undefined) return user._isAdmin;
    try {
      const adminRecord = Sheets.findOne('Admins', function(a) {
        return String(a.email).trim().toLowerCase() === String(user.email).trim().toLowerCase() &&
               String(a.status).trim().toUpperCase() === 'ACTIVE';
      });
      user._isAdmin = !!adminRecord;
      return user._isAdmin;
    } catch (e) {
      LoggerUtil.warn('Admin status lookup error: ' + e.toString());
      return false;
    }
  }

  /**
   * Middleware requiring an administrator user role strictly determined
   * from the Admins Google Sheet.
   */
  function requireAdmin(handler) {
    return requireAuth(function(request) {
      const user = request.user;
      const isAdmin = checkAdminStatus(user);

      if (!isAdmin) {
        return Responses.error('FORBIDDEN', 'Administrative privileges are required to access this resource. Account is not an active administrator in the Admins sheet.', 403);
      }

      return handler(request);
    });
  }

  /**
   * Middleware that checks for an optional authenticated user session.
   * If a valid token is provided, sets request.user and request.session.
   * If no token or an invalid token is provided, request.user remains null without failing.
   */
  function optionalAuth(handler) {
    return function(request) {
      const token = extractToken(request);
      if (token) {
        const authResult = resolveAuth(request);
        if (!authResult.error && authResult.user) {
          request.user = authResult.user;
          request.session = authResult.session;
        } else {
          request.user = null;
          request.session = null;
        }
      } else {
        request.user = null;
        request.session = null;
      }
      return handler(request);
    };
  }

  return {
    generateSalt: generateSalt,
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    hashToken: hashToken,
    extractToken: extractToken,
    resolveAuth: resolveAuth,
    authenticate: authenticate,
    checkAdminStatus: checkAdminStatus,
    requireAuth: requireAuth,
    optionalAuth: optionalAuth,
    requireAdmin: requireAdmin
  };
})();
