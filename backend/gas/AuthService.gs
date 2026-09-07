/**
 * FreeAds Post - Authentication Service
 * 
 * Handles user registration, salted password hashing, verification token generation,
 * and single-use email verification.
 */

const AuthService = (function() {

  /**
   * Registers a new user account.
   * 
   * @param {Object} payload - Registration input { name, email, phone, company_name, password }
   * @returns {Object} JSON response envelope
   */
  function register(payload) {
    if (!payload || typeof payload !== 'object') {
      return Responses.error('VALIDATION_ERROR', 'Request payload is required.', 400);
    }

    // 1. Required field checks
    const reqErrors = Validation.required(payload, ['name', 'email', 'phone', 'password']);
    if (reqErrors) {
      return Responses.error('VALIDATION_ERROR', reqErrors.join(' '), 400, reqErrors);
    }

    const name = String(payload.name).trim();
    const email = String(payload.email).trim().toLowerCase();
    const phone = String(payload.phone).trim();
    const companyName = payload.company_name ? String(payload.company_name).trim() : '';
    const password = String(payload.password);

    // 2. Format validations
    const nameErr = Validation.stringLength(name, 'name', 2, 100);
    if (nameErr) {
      return Responses.error('VALIDATION_ERROR', nameErr, 400);
    }

    if (!Validation.email(email)) {
      return Responses.error('INVALID_EMAIL', 'Please provide a valid email address.', 400);
    }

    if (!Validation.phone(phone)) {
      return Responses.error('INVALID_PHONE', 'Please provide a valid phone number (min 7 digits).', 400);
    }

    const passErr = Validation.passwordStrength(password);
    if (passErr) {
      return Responses.error('WEAK_PASSWORD', passErr, 400);
    }

    // 3. Email uniqueness verification (inside transaction lock)
    return Sheets.withLock(function() {
      const existingUser = Sheets.findOne('Users', function(u) {
        return String(u.email).toLowerCase() === email;
      });

      if (existingUser) {
        return Responses.error(
          'EMAIL_ALREADY_EXISTS',
          'An account with this email address already exists. Please log in or use a different email.',
          409
        );
      }

      // 4. Secure Password Hashing (Salted SHA-256, NEVER plain text)
      const passwordHash = Auth.hashPassword(password);
      const userId = Sheets.generateId('usr');
      const nowIso = new Date().toISOString();

      // Check if this user is designated as the initial administrator
      const initialAdminEmail = String(Config.get('INITIAL_ADMIN_EMAIL', '')).toLowerCase().trim();
      const role = (initialAdminEmail && email === initialAdminEmail) ? 'ADMIN' : 'USER';

      // 5. Create user record with email_verified = false
      const newUser = {
        user_id: userId,
        name: name,
        email: email,
        phone: phone,
        company_name: companyName,
        password_hash: passwordHash,
        email_verified: false,
        account_status: 'ACTIVE',
        role: role,
        membership_status: 'FREE',
        last_login: '',
        is_logged_in: false,
        created_at: nowIso,
        updated_at: nowIso
      };

      Sheets.insert('Users', newUser);

      // If assigned admin, also record in Admins table
      if (role === 'ADMIN') {
        Sheets.insert('Admins', {
          admin_id: Sheets.generateId('adm'),
          email: email,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          created_at: nowIso
        });
      }

      // 6. Generate single-use verification token (64-char random string)
      const rawToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      const tokenHash = Auth.hashToken(rawToken);
      const expiryHours = Number(Config.get('VERIFICATION_EXPIRY_HOURS', 24));
      const expiresAt = new Date(Date.now() + (expiryHours * 3600 * 1000)).toISOString();

      const verificationRecord = {
        token_id: Sheets.generateId('tok'),
        user_id: userId,
        email: email,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used: false,
        created_at: nowIso
      };

      Sheets.insert('EmailVerification', verificationRecord);

      // 7. Dispatch verification email
      const emailResult = EmailService.sendVerificationEmail(email, name, rawToken);

      // 8. Log system activity
      LoggerUtil.logActivity(userId, 'USER_REGISTER', 'USER', userId, {
        email: email,
        role: role
      });

      // 9. Return sanitized response (NEVER return password_hash)
      const sanitized = Validation.sanitizeUser(newUser);
      return Responses.success({
        user: sanitized,
        message: 'Registration successful. Please check your email to verify your account.',
        // Expose debugToken only in non-production / test environments for automated testing
        debugToken: Config.get('EXPOSE_DEBUG_TOKENS') === 'true' ? rawToken : undefined
      }, 'User registered successfully.', 201);
    });
  }

  /**
   * Verifies account email address via one-time token.
   * 
   * @param {string} token - Raw verification token from URL
   * @returns {Object} JSON response envelope
   */
  function verifyEmail(token) {
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return Responses.error('VALIDATION_ERROR', 'Verification token is required.', 400);
    }

    const rawToken = token.trim();
    const tokenHash = Auth.hashToken(rawToken);

    return Sheets.withLock(function() {
      // 1. Locate token by hash
      const tokenRecord = Sheets.findOne('EmailVerification', function(t) {
        return t.token_hash === tokenHash;
      });

      if (!tokenRecord) {
        return Responses.error('INVALID_TOKEN', 'Invalid or unrecognized verification token.', 400);
      }

      // 2. Check if already used
      if (tokenRecord.used === true || tokenRecord.used === 'TRUE' || String(tokenRecord.used).toLowerCase() === 'true') {
        return Responses.error('TOKEN_ALREADY_USED', 'This verification token has already been used. Please log in.', 400);
      }

      // 3. Check if expired
      const now = new Date();
      const expiresAt = new Date(tokenRecord.expires_at);
      if (isNaN(expiresAt.getTime()) || now > expiresAt) {
        return Responses.error('TOKEN_EXPIRED', 'This verification link has expired. Please register again or request a new link.', 400);
      }

      // 4. Mark token as used (single-use)
      Sheets.update('EmailVerification', 'token_id', tokenRecord.token_id, {
        used: true
      });

      // 5. Update user: email_verified = true
      const nowIso = new Date().toISOString();
      const updatedUser = Sheets.update('Users', 'user_id', tokenRecord.user_id, {
        email_verified: true,
        account_status: 'ACTIVE',
        updated_at: nowIso
      });

      // 6. Record audit log
      LoggerUtil.logActivity(tokenRecord.user_id, 'USER_VERIFY_EMAIL', 'USER', tokenRecord.user_id, {
        email: tokenRecord.email
      });

      return Responses.success({
        verified: true,
        email: tokenRecord.email,
        user: Validation.sanitizeUser(updatedUser)
      }, 'Your email has been verified successfully. Your account is now active.');
    });
  }

  /**
   * Authenticates a user with email and password, issuing a secure session token.
   * 
   * SECURITY ENFORCEMENT:
   * - Generic error returned on invalid email OR password (no email enumeration).
   * - Requires email_verified = true before permitting login.
   * - Never returns password_hash.
   * - Updates last_login timestamp upon success.
   * 
   * @param {Object} payload - { email, password }
   * @returns {Object} JSON response envelope
   */
  function login(payload) {
    if (!payload || typeof payload !== 'object') {
      return Responses.error('VALIDATION_ERROR', 'Email and password are required.', 400);
    }

    const reqErrors = Validation.required(payload, ['email', 'password']);
    if (reqErrors) {
      return Responses.error('VALIDATION_ERROR', reqErrors.join(' '), 400);
    }

    const email = String(payload.email).trim().toLowerCase();
    const password = String(payload.password);

    // Rate limiting: 5 failed attempts per email within 15 minutes (900 seconds)
    const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
    const failKey = 'login_fail_' + Auth.hashToken(email).substring(0, 24);
    let failCount = 0;
    if (cache) {
      try {
        const cached = cache.get(failKey);
        if (cached) {
          failCount = parseInt(cached, 10) || 0;
        }
      } catch (cacheErr) {}
    }

    if (failCount >= 5) {
      return Responses.error('RATE_LIMITED', 'Too many failed login attempts. Please try again in 15 minutes.', 429);
    }

    function recordFailedAttempt() {
      if (cache) {
        try {
          cache.put(failKey, String(failCount + 1), 900);
        } catch (cacheErr) {}
      }
    }

    // 1. Locate user in Users sheet
    const user = Sheets.findOne('Users', function(u) {
      return String(u.email).toLowerCase() === email;
    });

    // 2. Security Check: Never reveal if email exists. Generic error if not found.
    if (!user) {
      recordFailedAttempt();
      return Responses.error('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    // 3. Verify password hash
    const isPasswordCorrect = Auth.verifyPassword(password, user.password_hash);
    if (!isPasswordCorrect) {
      recordFailedAttempt();
      return Responses.error('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    // 4. Check email verification status
    const isVerified = (user.email_verified === true || user.email_verified === 'TRUE' || String(user.email_verified).toLowerCase() === 'true');
    if (!isVerified) {
      return Responses.error(
        'EMAIL_NOT_VERIFIED',
        'Your email address has not been verified. Please check your inbox for the verification link.',
        403
      );
    }

    // 5. Check account operational status
    if (user.account_status !== 'ACTIVE') {
      return Responses.error('ACCOUNT_SUSPENDED', 'Your account has been deactivated or suspended.', 403);
    }

    // 6. Issue secure session token (inside transaction lock)
    return Sheets.withLock(function() {
      const rawSessionToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      const tokenHash = Auth.hashToken(rawSessionToken);
      const sessionExpiryDays = Number(Config.get('SESSION_EXPIRY_DAYS', 7));
      const expiresAt = new Date(Date.now() + (sessionExpiryDays * 24 * 3600 * 1000)).toISOString();
      const nowIso = new Date().toISOString();

      // Store in Sessions sheet
      Sheets.insert('Sessions', {
        session_id: Sheets.generateId('ses'),
        token_hash: tokenHash,
        user_id: user.user_id,
        role: user.role,
        expires_at: expiresAt,
        created_at: nowIso
      });

      // Update last_login and is_logged_in in Users sheet
      Sheets.update('Users', 'user_id', user.user_id, {
        last_login: nowIso,
        is_logged_in: true,
        updated_at: nowIso
      });
      user.last_login = nowIso;
      user.is_logged_in = true;

      // Record activity log
      LoggerUtil.logActivity(user.user_id, 'USER_LOGIN', 'USER', user.user_id);

      // Clear rate limiting on success
      if (cache) {
        try {
          cache.remove(failKey);
        } catch (cacheErr) {}
      }

      // Return sanitized user with session token
      return Responses.success({
        token: rawSessionToken,
        user: Validation.sanitizeUser(user)
      }, 'Login successful.', 200);
    });
  }

  /**
   * Invalidates active session token upon logout and updates user login state.
   * 
   * @param {string} token - Bearer token to invalidate
   * @param {string} userId - Optional user ID for logging & user state update
   * @returns {Object} JSON response envelope
   */
  function logout(token, userId = null) {
    Sheets.withLock(function() {
      let resolvedUserId = userId;
      if (token) {
        const tokenHash = Auth.hashToken(token);
        const session = Sheets.findByKey('Sessions', 'token_hash', tokenHash);
        if (session && session.user_id) {
          resolvedUserId = session.user_id;
        }
        Sheets.remove('Sessions', 'token_hash', tokenHash);
      }

      // If user ID resolved, remove all remaining sessions for that user
      // and transition user's is_logged_in state to false
      if (resolvedUserId) {
        const remainingSessions = Sheets.findMany('Sessions', function(s) {
          return String(s.user_id) === String(resolvedUserId);
        });
        remainingSessions.forEach(function(s) {
          Sheets.remove('Sessions', 'session_id', s.session_id);
        });

        try {
          Sheets.update('Users', 'user_id', resolvedUserId, {
            is_logged_in: false,
            updated_at: new Date().toISOString()
          });
        } catch (e) {}
      }
    });

    if (userId) {
      LoggerUtil.logActivity(userId, 'USER_LOGOUT', 'USER', userId);
    }

    return Responses.success(null, 'Successfully logged out.', 200);
  }

  return {
    register: register,
    verifyEmail: verifyEmail,
    login: login,
    logout: logout
  };
})();
