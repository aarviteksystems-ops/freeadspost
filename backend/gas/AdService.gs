/**
 * FreeAds Post - Advertisement Service
 * 
 * Handles advertisement creation, validation, lifecycle states, and moderation rules.
 * 
 * CORE RULES:
 * - Newly submitted ads ALWAYS receive status = 'PENDING'.
 * - Images must strictly be external HTTP/HTTPS URLs. No file uploads or data URIs are stored.
 * - Advertisements are never downloaded or proxied by the server.
 */

const AdService = (function() {

  const ALLOWED_CATEGORIES = [
    'Services',
    'Vehicles',
    'Electronics',
    'Real Estate',
    'Jobs',
    'Community',
    'Buy & Sell'
  ];

  const ALLOWED_CONTACT_PREFERENCES = ['EMAIL', 'PHONE', 'BOTH'];

  /**
   * Creates a new advertisement with status = 'PENDING'.
   * 
   * @param {Object} user - Authenticated user object
   * @param {Object} payload - Ad submission payload
   * @returns {Object} JSON response envelope
   */
  function createAd(user, payload) {
    if (!user) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required to post an ad.', 401);
    }

    if (!payload || typeof payload !== 'object') {
      return Responses.error('VALIDATION_ERROR', 'Ad payload is required.', 400);
    }

    // 1. Required field validations
    const reqErrors = Validation.required(payload, ['title', 'category', 'description', 'location', 'contact_preference']);
    if (reqErrors) {
      return Responses.error('VALIDATION_ERROR', reqErrors.join(' '), 400, reqErrors);
    }

    const title = String(payload.title).trim();
    const category = String(payload.category).trim();
    const description = String(payload.description).trim();
    const location = String(payload.location).trim();
    const contactPreference = String(payload.contact_preference).trim().toUpperCase();
    const rawImageUrl = payload.image_url !== undefined && payload.image_url !== null ? String(payload.image_url).trim() : '';

    // 2. Field constraints
    const titleErr = Validation.stringLength(title, 'title', 5, 120);
    if (titleErr) return Responses.error('VALIDATION_ERROR', titleErr, 400);

    const descErr = Validation.stringLength(description, 'description', 20, 3000);
    if (descErr) return Responses.error('VALIDATION_ERROR', descErr, 400);

    const locErr = Validation.stringLength(location, 'location', 2, 100);
    if (locErr) return Responses.error('VALIDATION_ERROR', locErr, 400);

    // Category validation
    let validCategories = ALLOWED_CATEGORIES;
    try {
      const setting = Sheets.findByKey('Settings', 'setting', 'allowed_categories');
      if (setting && setting.value) {
        validCategories = JSON.parse(setting.value);
      }
    } catch (e) {}

    const catErr = Validation.enumValue(category, 'category', validCategories);
    if (catErr) return Responses.error('VALIDATION_ERROR', catErr, 400);

    // Contact preference validation
    const contactErr = Validation.enumValue(contactPreference, 'contact_preference', ALLOWED_CONTACT_PREFERENCES);
    if (contactErr) return Responses.error('VALIDATION_ERROR', contactErr, 400);

    // 3. Image URL validation (Strict: External HTTP/HTTPS only; reject javascript:, data:, file:, etc.)
    const imgErr = Validation.imageUrl(rawImageUrl, true);
    if (imgErr) {
      return Responses.error('INVALID_IMAGE_URL', imgErr, 400);
    }

    // 4. Persistence in Google Sheets (inside script lock)
    return Sheets.withLock(function() {
      const adId = Sheets.generateId('ad');
      const nowIso = new Date().toISOString();
      const durationDays = Number(Config.get('DEFAULT_AD_EXPIRY_DAYS', 30));
      const expiresAt = new Date(Date.now() + (durationDays * 24 * 3600 * 1000)).toISOString();

      // Check if user holds active membership for sponsored placement
      const isSponsored = (user.membership_status === 'ACTIVE_MEMBER');

      // 5. Construct ad record - STATUS IS ALWAYS 'PENDING'
      const adRecord = {
        ad_id: adId,
        user_id: user.user_id,
        title: title,
        category: category,
        description: description,
        image_url: rawImageUrl,
        location: location,
        contact_preference: contactPreference,
        status: 'PENDING', // CRITICAL: Awaiting admin approval
        rejection_reason: '',
        is_sponsored: isSponsored,
        sponsored_until: isSponsored ? expiresAt : '',
        created_at: nowIso,
        updated_at: nowIso,
        approved_at: '',
        expires_at: expiresAt
      };

      Sheets.insert('Ads', adRecord);

      // 6. Record in ActivityLog
      LoggerUtil.logActivity(user.user_id, 'AD_CREATE', 'AD', adId, {
        title: title,
        category: category,
        status: 'PENDING'
      });

      // Invalidate admin overview cache
      try {
        if (typeof AdminService !== 'undefined' && typeof AdminService.invalidateStatsCache === 'function') {
          AdminService.invalidateStatsCache();
        }
      } catch (e) {}

      // 7. Return sanitized response
      return Responses.success({
        ad: Validation.sanitizeAd(adRecord),
        message: 'Your advertisement has been submitted and is awaiting admin approval.'
      }, 'Your advertisement has been submitted and is awaiting admin approval.', 201);
    });
  }

  /**
   * Retrieves all advertisements belonging to the authenticated user.
   * 
   * @param {Object} user - Authenticated user object
   * @returns {Object} JSON response envelope with user ads list
   */
  function getMyAds(user) {
    if (!user) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required.', 401);
    }

    const userId = user.user_id;
    const userAds = Sheets.findMany('Ads', function(ad) {
      return String(ad.user_id) === String(userId);
    });

    // Sort newest created first
    userAds.sort(function(a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const sanitized = userAds.map(Validation.sanitizeAd);

    return Responses.success({
      ads: sanitized,
      total: sanitized.length
    });
  }

  /**
   * Updates an existing advertisement belonging to the authenticated user.
   * 
   * SECURITY RULES:
   * - Must belong to authenticated user (403 Forbidden otherwise).
   * - Cannot edit DELETED or EXPIRED ads.
   * - Status is ALWAYS reset to 'PENDING' for admin review.
   * - User CANNOT approve their own ad or set status to APPROVED.
   * - User CANNOT set is_sponsored or sponsored_until.
   * 
   * @param {Object} user - Authenticated user object
   * @param {Object} payload - Update payload
   * @returns {Object} JSON response envelope
   */
  function updateAd(user, payload) {
    if (!user) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required.', 401);
    }

    const adId = payload && (payload.ad_id || payload.id);
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required for update.', 400);
    }

    const existingAd = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!existingAd) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    // Server-side authorization check: ownership
    if (String(existingAd.user_id) !== String(user.user_id)) {
      return Responses.error('FORBIDDEN', 'You do not have permission to modify this advertisement.', 403);
    }

    // Editable status check: PENDING, APPROVED, REJECTED, HIDDEN
    const allowedEditStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'];
    if (!allowedEditStatuses.includes(existingAd.status)) {
      return Responses.error('INVALID_STATE', `Cannot edit an advertisement with status '${existingAd.status}'.`, 400);
    }

    // Required fields validation
    const reqErrors = Validation.required(payload, ['title', 'category', 'description', 'location', 'contact_preference']);
    if (reqErrors) {
      return Responses.error('VALIDATION_ERROR', reqErrors.join(' '), 400, reqErrors);
    }

    const title = String(payload.title).trim();
    const category = String(payload.category).trim();
    const description = String(payload.description).trim();
    const location = String(payload.location).trim();
    const contactPreference = String(payload.contact_preference).trim().toUpperCase();
    const rawImageUrl = payload.image_url !== undefined && payload.image_url !== null ? String(payload.image_url).trim() : '';

    const titleErr = Validation.stringLength(title, 'title', 5, 120);
    if (titleErr) return Responses.error('VALIDATION_ERROR', titleErr, 400);

    const descErr = Validation.stringLength(description, 'description', 20, 3000);
    if (descErr) return Responses.error('VALIDATION_ERROR', descErr, 400);

    const locErr = Validation.stringLength(location, 'location', 2, 100);
    if (locErr) return Responses.error('VALIDATION_ERROR', locErr, 400);

    let validCategories = ALLOWED_CATEGORIES;
    try {
      const setting = Sheets.findByKey('Settings', 'setting', 'allowed_categories');
      if (setting && setting.value) validCategories = JSON.parse(setting.value);
    } catch (e) {}

    const catErr = Validation.enumValue(category, 'category', validCategories);
    if (catErr) return Responses.error('VALIDATION_ERROR', catErr, 400);

    const contactErr = Validation.enumValue(contactPreference, 'contact_preference', ALLOWED_CONTACT_PREFERENCES);
    if (contactErr) return Responses.error('VALIDATION_ERROR', contactErr, 400);

    const imgErr = Validation.imageUrl(rawImageUrl, true);
    if (imgErr) return Responses.error('INVALID_IMAGE_URL', imgErr, 400);

    // ANTI-TAMPERING:
    // Status is always forced to PENDING (cannot self-approve).
    // is_sponsored and sponsored_until cannot be modified by user.
    const nowIso = new Date().toISOString();
    const updateData = {
      title: title,
      category: category,
      description: description,
      location: location,
      contact_preference: contactPreference,
      image_url: rawImageUrl,
      status: 'PENDING', // Forces re-approval
      rejection_reason: '', // Clear previous rejection reason
      approved_at: '',
      updated_at: nowIso
    };

    const updated = Sheets.update('Ads', 'ad_id', adId, updateData);
    if (!updated) {
      return Responses.error('INTERNAL_ERROR', 'Failed to update advertisement.', 500);
    }

    LoggerUtil.logActivity(user.user_id, 'AD_UPDATE', 'AD', adId, {
      title: title,
      previous_status: existingAd.status,
      new_status: 'PENDING'
    });

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement updated and submitted for admin review.'
    }, 'Advertisement updated and submitted for admin review.');
  }

  /**
   * Hides an APPROVED advertisement belonging to the authenticated user.
   * 
   * @param {Object} user - Authenticated user object
   * @param {string} adId - Advertisement ID
   * @returns {Object} JSON response envelope
   */
  function hideAd(user, adId) {
    if (!user) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required.', 400);
    }

    const existingAd = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!existingAd) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    // Server-side authorization check: ownership
    if (String(existingAd.user_id) !== String(user.user_id)) {
      return Responses.error('FORBIDDEN', 'You do not have permission to hide this advertisement.', 403);
    }

    if (existingAd.status !== 'APPROVED') {
      return Responses.error('INVALID_STATE', `Only APPROVED advertisements can be hidden. Current status is '${existingAd.status}'.`, 400);
    }

    const nowIso = new Date().toISOString();
    const updated = Sheets.update('Ads', 'ad_id', adId, {
      status: 'HIDDEN',
      updated_at: nowIso
    });

    LoggerUtil.logActivity(user.user_id, 'AD_HIDE', 'AD', adId);

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement is now hidden.'
    }, 'Advertisement is now hidden.');
  }

  /**
   * Resubmits a REJECTED advertisement for admin review.
   * 
   * @param {Object} user - Authenticated user object
   * @param {string} adId - Advertisement ID
   * @returns {Object} JSON response envelope
   */
  function resubmitAd(user, adId) {
    if (!user) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required.', 400);
    }

    const existingAd = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!existingAd) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    // Server-side authorization check: ownership
    if (String(existingAd.user_id) !== String(user.user_id)) {
      return Responses.error('FORBIDDEN', 'You do not have permission to resubmit this advertisement.', 403);
    }

    if (existingAd.status !== 'REJECTED') {
      return Responses.error('INVALID_STATE', `Only REJECTED advertisements can be resubmitted. Current status is '${existingAd.status}'.`, 400);
    }

    const nowIso = new Date().toISOString();
    const updated = Sheets.update('Ads', 'ad_id', adId, {
      status: 'PENDING',
      rejection_reason: '',
      updated_at: nowIso
    });

    LoggerUtil.logActivity(user.user_id, 'AD_RESUBMIT', 'AD', adId);

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement resubmitted for admin approval.'
    }, 'Advertisement resubmitted for admin approval.');
  }

  /**
   * Deletes an advertisement owned by the authenticated user (transitions status to 'DELETED').
   * 
   * @param {Object} user - Authenticated user object
   * @param {string} adId - Advertisement ID
   * @returns {Object} JSON response envelope
   */
  function deleteAd(user, adId) {
    if (!user) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required.', 400);
    }

    const existingAd = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!existingAd) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    // Server-side authorization check: ownership
    if (String(existingAd.user_id) !== String(user.user_id)) {
      return Responses.error('FORBIDDEN', 'You do not have permission to delete this advertisement.', 403);
    }

    if (existingAd.status === 'DELETED') {
      return Responses.error('INVALID_STATE', 'Advertisement is already deleted.', 400);
    }

    const nowIso = new Date().toISOString();
    const updated = Sheets.update('Ads', 'ad_id', adId, {
      status: 'DELETED',
      updated_at: nowIso
    });

    LoggerUtil.logActivity(user.user_id, 'AD_DELETE', 'AD', adId);

    return Responses.success({
      ad_id: adId,
      status: 'DELETED',
      message: 'Advertisement deleted successfully.'
    }, 'Advertisement deleted successfully.');
  }

  /**
   * Cleanses search input to prevent:
   * - Formula Injection: leading =, +, -, @, or tab/carriage return triggers
   * - HTML / Script Injection: <script>, </script>, tags, or javascript: URI schemes
   */
  function sanitizeSearchQuery(input) {
    if (typeof input !== 'string') return '';
    let str = input.trim();
    // Neutralize formula injection
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    // Remove HTML script tags
    str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    str = str.replace(/<[^>]+>/g, '');
    str = str.replace(/javascript\s*:/gi, '');
    return str.trim();
  }

  /**
   * Checks whether a specific seller currently has an active, authenticated login state.
   * Examines active non-expired sessions in the Sessions sheet and user account status.
   */
  function isSellerLoggedIn(userId) {
    if (!userId) return false;
    const now = new Date();
    try {
      const activeSession = Sheets.findOne('Sessions', function(s) {
        if (String(s.user_id) !== String(userId)) return false;
        const exp = new Date(s.expires_at || s.expiresAt);
        return !isNaN(exp.getTime()) && now <= exp;
      });
      if (!activeSession) return false;

      const user = Sheets.findByKey('Users', 'user_id', userId);
      if (!user || user.account_status !== 'ACTIVE') return false;
      return true;
    } catch (e) {
      LoggerUtil.warn('isSellerLoggedIn error: ' + e.toString());
      return false;
    }
  }

  /**
   * Evaluates if an advertisement is actively sponsored.
   * Returns true if is_sponsored is true AND (sponsored_until is empty OR in the future).
   */
  function isAdActivelySponsored(ad, now) {
    if (!ad) return false;
    const isSpon = (ad.is_sponsored === true || ad.is_sponsored === 'TRUE' || String(ad.is_sponsored).toLowerCase() === 'true');
    if (!isSpon) return false;
    if (!ad.sponsored_until) return true;
    const exp = new Date(ad.sponsored_until);
    if (isNaN(exp.getTime())) return false;
    return (now || new Date()) <= exp;
  }

  /**
   * Retrieves public advertisements with discovery features:
   * - Search by title, description, or keyword
   * - Category filter
   * - Location filter
   * - Date & Sponsored sorting
   * - Server-side pagination
   * 
   * STRICT SECURITY & MODERATION RULES:
   * - Publicly accessible without requiring authentication.
   * - DYNAMIC SELLER LOGIN VISIBILITY: Ads are visible ONLY while the seller has an active, authenticated session.
   * - When seller logs out, ads immediately disappear from public feed, search, and category listings.
   * - Status remains APPROVED (never permanently degraded to INACTIVE).
   * - ONLY ads with status = 'APPROVED' and non-expired are returned.
   * - PENDING, REJECTED, HIDDEN, EXPIRED, and DELETED ads are STRICTLY EXCLUDED.
   * - Private contact fields (phone, email, whatsapp) are strictly withheld unless requester is an authenticated verified user, owner, or admin.
   * 
   * @param {Object} options - Search, filter, sort, and pagination options
   * @param {Object} [currentUser] - Optional authenticated user object
   * @returns {Object} JSON response envelope with paginated ads and metadata
   */
  function getPublicAds(options, currentUser) {
    const allAds = Sheets.getAll('Ads');
    const now = new Date();

    // Batch-query active sessions to determine currently logged-in sellers in O(1)
    const activeSessions = Sheets.getAll('Sessions');
    const loggedInUserIds = {};
    for (let s = 0; s < activeSessions.length; s++) {
      const sess = activeSessions[s];
      if (!sess.user_id) continue;
      const exp = new Date(sess.expires_at || sess.expiresAt);
      if (!isNaN(exp.getTime()) && now <= exp) {
        loggedInUserIds[String(sess.user_id)] = true;
      }
    }

    // 1. Safe Query Extraction & Pre-processing
    const opts = options || {};
    const rawSearch = sanitizeSearchQuery(opts.search || '').toLowerCase();
    const rawTitle = sanitizeSearchQuery(opts.title || opts.title_query || '').toLowerCase();
    const rawDesc = sanitizeSearchQuery(opts.description || opts.description_query || '').toLowerCase();
    const rawLocation = sanitizeSearchQuery(opts.location || '').toLowerCase();
    const rawCategory = String(opts.category || '').trim().toLowerCase();

    const checkCategory = Boolean(rawCategory && rawCategory !== 'all');
    const checkLocation = Boolean(rawLocation && rawLocation !== 'all');
    const checkTitle = Boolean(rawTitle);
    const checkDesc = Boolean(rawDesc);
    const checkSearch = Boolean(rawSearch);

    const locationSet = {};
    const eligibleAds = [];
    const userCache = {};

    // 2. Single-pass filtering over allAds
    for (let i = 0; i < allAds.length; i++) {
      const ad = allAds[i];
      if (ad.status !== 'APPROVED') continue;

      // Dynamic Seller Login Visibility Rule: Enforced only if REQUIRE_SELLER_LOGIN setting is enabled
      const requireSellerLogin = Config.get('REQUIRE_SELLER_LOGIN', 'false') === 'true';
      if (requireSellerLogin && !loggedInUserIds[String(ad.user_id)]) {
        continue;
      }

      // Expiry filter
      if (ad.expires_at) {
        const exp = new Date(ad.expires_at);
        if (!isNaN(exp.getTime()) && now > exp) {
          continue;
        }
      }

      // Seller active account status check
      const uid = String(ad.user_id);
      if (userCache[uid] === undefined) {
        userCache[uid] = Sheets.findByKey('Users', 'user_id', uid);
      }
      const seller = userCache[uid];
      if (!seller || seller.account_status !== 'ACTIVE') {
        continue;
      }

      // Collect distinct locations from all valid approved ads
      if (ad.location) {
        const locClean = String(ad.location).trim();
        if (locClean) locationSet[locClean] = true;
      }

      // Filter by Category
      if (checkCategory && String(ad.category || '').toLowerCase() !== rawCategory) {
        continue;
      }

      // Filter by Location
      if (checkLocation && !String(ad.location || '').toLowerCase().includes(rawLocation)) {
        continue;
      }

      // Filter by Title
      if (checkTitle && !String(ad.title || '').toLowerCase().includes(rawTitle)) {
        continue;
      }

      // Filter by Description
      if (checkDesc && !String(ad.description || '').toLowerCase().includes(rawDesc)) {
        continue;
      }

      // Filter by General Search
      if (checkSearch) {
        const t = String(ad.title || '').toLowerCase();
        const d = String(ad.description || '').toLowerCase();
        const l = String(ad.location || '').toLowerCase();
        if (!t.includes(rawSearch) && !d.includes(rawSearch) && !l.includes(rawSearch)) {
          continue;
        }
      }

      eligibleAds.push(ad);
    }

    const distinctLocations = Object.keys(locationSet).sort();

    // 3. Sorting & Priority Ranking:
    // Group 1: Active sponsored ads of logged-in sellers (newest first)
    // Group 2: Normal approved ads of logged-in sellers (newest first)
    const sortBy = String(opts.sort_by || opts.sort || 'sponsored_first').toLowerCase();

    eligibleAds.sort(function(a, b) {
      const aTime = new Date(a.approved_at || a.created_at || 0).getTime();
      const bTime = new Date(b.approved_at || b.created_at || 0).getTime();

      if (sortBy === 'oldest') {
        return aTime - bTime;
      }

      if (sortBy === 'newest') {
        return bTime - aTime;
      }

      // Default priority ranking ('sponsored_first'):
      const aSpon = isAdActivelySponsored(a, now);
      const bSpon = isAdActivelySponsored(b, now);

      if (aSpon && !bSpon) return -1;
      if (!aSpon && bSpon) return 1;

      // Within each group: newest first
      return bTime - aTime;
    });

    const totalCount = eligibleAds.length;

    // 4. Server-Side Pagination
    let page = parseInt(opts.page, 10);
    if (isNaN(page) || page < 1) page = 1;

    let limit = parseInt(opts.limit, 10);
    if (isNaN(limit) || limit < 1) limit = 12;
    if (limit > 50) limit = 50;

    const totalPages = Math.ceil(totalCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedAds = eligibleAds.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < totalCount;

    // 5. Protected Contact Information Sanitization
    const isVerifiedUser = Boolean(currentUser && (currentUser.email_verified === true || currentUser.email_verified === 'TRUE' || String(currentUser.email_verified).toLowerCase() === 'true'));
    const isAdmin = Boolean(currentUser && Auth.checkAdminStatus(currentUser));

    const slugCounts = {};
    paginatedAds.forEach(function(a) {
      const base = Validation.generateSlug(a.title, a.location, a.ad_id);
      slugCounts[base] = (slugCounts[base] || 0) + 1;
    });
    const seenBases = {};
    paginatedAds.forEach(function(a) {
      const base = Validation.generateSlug(a.title, a.location, a.ad_id);
      if (slugCounts[base] > 1) {
        if (seenBases[base]) {
          a.slug = Validation.generateSlug(a.title, a.location, a.ad_id, true);
        } else {
          seenBases[base] = true;
          a.slug = base;
        }
      } else {
        a.slug = base;
      }
    });

    const sanitized = paginatedAds.map(function(ad) {
      const uid = String(ad.user_id);
      if (userCache[uid] === undefined) {
        userCache[uid] = Sheets.findByKey('Users', 'user_id', uid);
      }
      const sellerUser = userCache[uid] || null;
      const isOwner = Boolean(currentUser && String(currentUser.user_id) === String(ad.user_id));
      const canViewContact = isAdmin || isOwner || isVerifiedUser;
      const isFullAccess = isAdmin || isOwner;
      return Validation.sanitizePublicAd(ad, canViewContact, sellerUser, isFullAccess);
    });

    return Responses.success({
      ads: sanitized,
      total: totalCount,
      page: page,
      limit: limit,
      total_pages: totalPages,
      has_more: hasMore,
      locations: distinctLocations
    });
  }

  /**
   * Retrieves single public ad by ID or slug.
   * Publicly accessible without requiring login.
   * DYNAMIC VISIBILITY RULE: An ad is publicly viewable only if the seller currently has an active login/session.
   * If the seller is logged out (or ad not approved/expired), non-owners and visitors receive 404 NOT_FOUND.
   * Admins and ad owners can view the listing regardless of seller's public login state.
   */
  function getPublicAdById(identifier, currentUser) {
    if (!identifier) {
      return Responses.error('VALIDATION_ERROR', 'Parameter ad_id or slug is required.', 400);
    }

    let ad = Sheets.findByKey('Ads', 'ad_id', identifier);
    if (!ad) {
      const allAds = Sheets.getAll('Ads');
      ad = allAds.find(function(a) {
        const baseSlug = Validation.generateSlug(a.title, a.location, a.ad_id);
        const slugWithSuffix = Validation.generateSlug(a.title, a.location, a.ad_id, true);
        return baseSlug === identifier || slugWithSuffix === identifier || String(a.ad_id) === identifier;
      });
    }
    if (!ad) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    // Check expiry
    let isExpired = false;
    if (ad.expires_at) {
      const exp = new Date(ad.expires_at);
      if (!isNaN(exp.getTime()) && new Date() > exp) {
        isExpired = true;
      }
    }

    const isOwner = Boolean(currentUser && (String(currentUser.user_id) === String(ad.user_id)));
    const isAdmin = Boolean(currentUser && Auth.checkAdminStatus(currentUser));
    const isVerifiedUser = Boolean(currentUser && (currentUser.email_verified === true || currentUser.email_verified === 'TRUE' || String(currentUser.email_verified).toLowerCase() === 'true'));

    // Check seller active login state if required
    const requireSellerLogin = Config.get('REQUIRE_SELLER_LOGIN', 'false') === 'true';
    const sellerLoggedIn = isSellerLoggedIn(ad.user_id);

    // Non-approved, expired, or ads whose seller is logged out (if required) are strictly hidden from public and non-owner/non-admin users
    if (ad.status !== 'APPROVED' || isExpired || (requireSellerLogin && !sellerLoggedIn)) {
      if (!isOwner && !isAdmin) {
        return Responses.error('NOT_FOUND', 'Advertisement not found or no longer available.', 404);
      }
    }

    const sellerUser = Sheets.findByKey('Users', 'user_id', ad.user_id);
    const canViewContact = isAdmin || isOwner || isVerifiedUser;
    const isFullAccess = isAdmin || isOwner;

    return Responses.success({
      ad: Validation.sanitizePublicAd(ad, canViewContact, sellerUser, isFullAccess)
    });
  }

  return {
    createAd: createAd,
    getMyAds: getMyAds,
    updateAd: updateAd,
    hideAd: hideAd,
    resubmitAd: resubmitAd,
    deleteAd: deleteAd,
    getPublicAds: getPublicAds,
    getPublicAdById: getPublicAdById,
    ALLOWED_CATEGORIES: ALLOWED_CATEGORIES,
    ALLOWED_CONTACT_PREFERENCES: ALLOWED_CONTACT_PREFERENCES
  };
})();
