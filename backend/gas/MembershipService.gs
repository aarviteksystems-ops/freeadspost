/**
 * FreeAds Post - Membership & Sponsorship Service (Google Apps Script)
 * 
 * Manages membership records, lifecycle state transitions, automatic expiration,
 * sponsorship eligibility verification, and ad sponsorship assignments.
 * 
 * CORE RULES:
 * - Membership states: ACTIVE, EXPIRED, CANCELLED, PENDING.
 * - When membership expires: ACTIVE -> EXPIRED automatically.
 * - When ad sponsorship expires: is_sponsored = false automatically.
 * - Frontend is NEVER trusted to set is_sponsored = true.
 * - Only eligible members with ACTIVE non-FREE memberships can have sponsored ads.
 * - Ranking: 1. Active sponsored ads (newest first), 2. Normal approved ads (newest first).
 * - No payment processing logic is included yet.
 */

const MembershipService = (function() {
  const ALLOWED_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING'];
  const ALLOWED_PLANS = ['FREE', 'PREMIUM_MONTHLY', 'PREMIUM_YEARLY', 'BASIC', 'SILVER', 'GOLD', 'PLATINUM', 'BUSINESS', 'PRO'];

  /**
   * Retrieves configured membership plans from Settings sheet (or standard defaults).
   * 
   * @returns {Object} JSON response envelope with list of plans
   */
  function getMembershipPlans() {
    const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
    if (cache) {
      try {
        const cached = cache.get('membership_plans');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return Responses.success({ plans: parsed });
          }
        }
      } catch (cacheErr) {}
    }

    try {
      const setting = Sheets.findByKey('Settings', 'setting', 'membership_plans');
      if (setting && setting.value) {
        const parsed = JSON.parse(setting.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (cache) {
            try {
              cache.put('membership_plans', JSON.stringify(parsed), 600);
            } catch (err) {}
          }
          return Responses.success({ plans: parsed });
        }
      }
    } catch (e) {
      LoggerUtil.warn('Failed to parse membership_plans setting: ' + e.toString());
    }

    const defaultPlans = [
      {
        plan_id: 'FREE',
        name: 'Free Membership',
        description: 'Standard classified ads posting with essential community visibility.',
        amount: 0,
        currency: 'USD',
        billing_period: 'lifetime',
        duration_days: 0,
        features: [
          'Standard ad listings',
          'Community search & discovery',
          'Direct contact preferences',
          'Standard customer support'
        ],
        is_sponsored_eligible: false,
        max_active_ads: 5
      },
      {
        plan_id: 'PREMIUM_MONTHLY',
        name: 'Premium Monthly',
        description: 'Priority placement, sponsored ad eligibility, and increased visibility.',
        amount: 19.99,
        currency: 'USD',
        billing_period: 'monthly',
        duration_days: 30,
        features: [
          'Priority placement above standard ads',
          'Prominent SPONSORED badge eligibility',
          'Up to 50 active advertisement postings',
          'Enhanced seller profile badge',
          'Priority customer support'
        ],
        is_sponsored_eligible: true,
        max_active_ads: 50
      },
      {
        plan_id: 'PREMIUM_YEARLY',
        name: 'Premium Yearly',
        description: 'Maximum exposure with 2 months free, annual savings, and top-tier placement.',
        amount: 199.99,
        currency: 'USD',
        billing_period: 'yearly',
        duration_days: 365,
        features: [
          'Top-tier priority placement on /ads',
          'Continuous SPONSORED badge eligibility',
          'Up to 200 active advertisement postings',
          '2 months free compared to monthly plan',
          'Dedicated VIP customer support'
        ],
        is_sponsored_eligible: true,
        max_active_ads: 200
      }
    ];

    if (cache) {
      try {
        cache.put('membership_plans', JSON.stringify(defaultPlans), 600);
      } catch (err) {}
    }

    return Responses.success({ plans: defaultPlans });
  }

  /**
   * Checks and dynamically updates membership expiry.
   * If status is ACTIVE and now > expiry_date, transitions to EXPIRED.
   * 
   * @param {Object} membership - Membership record from database
   * @returns {Object} Updated membership record
   */
  function evaluateMembershipExpiry(membership) {
    if (!membership) return null;
    if (membership.status !== 'ACTIVE') return membership;

    if (membership.expiry_date) {
      const exp = new Date(membership.expiry_date);
      const now = new Date();
      if (!isNaN(exp.getTime()) && now > exp) {
        // Automatic transition: ACTIVE -> EXPIRED
        const updated = Sheets.update('Memberships', 'membership_id', membership.membership_id, {
          status: 'EXPIRED'
        });

        // Also update Users sheet membership_status
        if (membership.user_id) {
          Sheets.update('Users', 'user_id', membership.user_id, {
            membership_status: 'EXPIRED'
          });

          LoggerUtil.logActivity(membership.user_id, 'MEMBERSHIP_EXPIRED', 'MEMBERSHIP', membership.membership_id, {
            plan: membership.plan,
            expiry_date: membership.expiry_date
          });
        }

        return updated || Object.assign({}, membership, { status: 'EXPIRED' });
      }
    }
    return membership;
  }

  /**
   * Checks if a given user is currently eligible for sponsored ads.
   * Eligible: User exists, has an ACTIVE non-FREE membership, and expiry_date has not passed.
   * 
   * @param {string} userId - Target user ID
   * @returns {boolean} True if eligible for sponsorship
   */
  function checkUserEligibility(userId) {
    if (!userId) return false;

    // Find all memberships for this user
    const userMemberships = Sheets.findMany('Memberships', function(m) {
      return String(m.user_id) === String(userId);
    });

    if (!userMemberships || userMemberships.length === 0) {
      return false;
    }

    // Sort by created_at newest first
    userMemberships.sort(function(a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    // Check the latest membership
    for (let i = 0; i < userMemberships.length; i++) {
      const m = evaluateMembershipExpiry(userMemberships[i]);
      if (m.status === 'ACTIVE' && String(m.plan).toUpperCase() !== 'FREE') {
        return true;
      }
    }

    return false;
  }

  /**
   * Retrieves active or latest membership record for current authenticated user.
   * 
   * @param {Object} currentUser - Authenticated user object
   * @returns {Object} JSON response envelope
   */
  function getUserMembership(currentUser) {
    if (!currentUser) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required.', 401);
    }

    const userId = (typeof currentUser === 'object' && currentUser !== null) ? currentUser.user_id : String(currentUser);
    const records = Sheets.findMany('Memberships', function(m) {
      return String(m.user_id) === String(userId);
    });

    // Sort newest first
    records.sort(function(a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    let currentMembership = null;
    if (records.length > 0) {
      currentMembership = evaluateMembershipExpiry(records[0]);
    }

    const isEligible = checkUserEligibility(userId);

    return Responses.success({
      membership: currentMembership ? Validation.sanitizeMembership(currentMembership) : null,
      plan: currentMembership ? currentMembership.plan : (currentUser.membership_status || 'FREE'),
      status: currentMembership ? currentMembership.status : 'ACTIVE',
      is_eligible_for_sponsorship: isEligible
    });
  }

  /**
   * Assigns or updates a user membership record (Authorized Admin action).
   * Supports payment-ready fields: amount, currency, payment_id, payment_provider.
   * 
   * @param {Object} adminUser - Authenticated admin user
   * @param {Object} payload - { user_id, plan, duration_days, status, amount, currency, payment_id, payment_provider }
   * @returns {Object} JSON response envelope
   */
  function assignMembership(adminUser, payload) {
    const isSystemWebhook = adminUser && (adminUser.is_system_webhook === true || adminUser.role === 'SYSTEM_WEBHOOK');
    if (!adminUser || (!isSystemWebhook && !Auth.checkAdminStatus(adminUser))) {
      return Responses.error('FORBIDDEN', 'Administrator privileges required.', 403);
    }

    const reqErrors = Validation.required(payload, ['user_id', 'plan']);
    if (reqErrors) {
      return Responses.error('VALIDATION_ERROR', reqErrors.join(' '), 400);
    }

    const userId = String(payload.user_id).trim();
    const targetUser = Sheets.findByKey('Users', 'user_id', userId);
    if (!targetUser) {
      return Responses.error('NOT_FOUND', 'Target user does not exist.', 404);
    }

    const plan = String(payload.plan).trim().toUpperCase();
    if (!ALLOWED_PLANS.includes(plan)) {
      return Responses.error('VALIDATION_ERROR', `Plan must be one of: ${ALLOWED_PLANS.join(', ')}.`, 400);
    }

    const status = String(payload.status || 'ACTIVE').trim().toUpperCase();
    if (!ALLOWED_STATUSES.includes(status)) {
      return Responses.error('VALIDATION_ERROR', `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`, 400);
    }

    // Default duration calculation based on plan if duration_days not provided
    let defaultDays = 30;
    if (plan === 'PREMIUM_YEARLY') defaultDays = 365;
    else if (plan === 'PREMIUM_MONTHLY') defaultDays = 30;
    else if (plan === 'FREE') defaultDays = 0;

    let durationDays = parseInt(payload.duration_days !== undefined ? payload.duration_days : defaultDays, 10);
    if (isNaN(durationDays) || (durationDays <= 0 && plan !== 'FREE')) {
      durationDays = defaultDays;
    }

    // Payment fields preparation (extensible for future providers)
    const amount = payload.amount !== undefined 
      ? Number(payload.amount) 
      : (plan === 'PREMIUM_YEARLY' ? 199.99 : plan === 'PREMIUM_MONTHLY' ? 19.99 : 0);
    const currency = String(payload.currency || 'USD').toUpperCase();
    const paymentId = String(payload.payment_id || '');
    const paymentProvider = String(payload.payment_provider || '');

    const now = new Date();
    const nowIso = now.toISOString();
    const expiryDate = durationDays > 0 
      ? new Date(now.getTime() + durationDays * 86400000).toISOString()
      : '';

    const membershipId = Sheets.generateId('mem');
    const record = {
      membership_id: membershipId,
      user_id: userId,
      plan: plan,
      amount: amount,
      currency: currency,
      payment_id: paymentId,
      payment_provider: paymentProvider,
      start_date: nowIso,
      expiry_date: expiryDate,
      status: status,
      created_at: nowIso
    };

    Sheets.insert('Memberships', record);

    // Update Users worksheet
    Sheets.update('Users', 'user_id', userId, {
      membership_status: status === 'ACTIVE' ? plan : status
    });

    const actorId = isSystemWebhook ? 'SYSTEM_PAYMENT' : (adminUser.user_id || 'ADMIN');
    LoggerUtil.logActivity(actorId, 'MEMBERSHIP_ASSIGN', 'MEMBERSHIP', membershipId, {
      target_user_id: userId,
      plan: plan,
      status: status,
      amount: amount,
      currency: currency,
      payment_id: paymentId,
      payment_provider: paymentProvider,
      duration_days: durationDays,
      expiry_date: expiryDate
    });

    return Responses.success({
      membership: Validation.sanitizeMembership(record),
      message: `Membership '${plan}' successfully assigned to user.`
    }, `Membership '${plan}' successfully assigned.`);
  }

  /**
   * Cancels a membership record.
   * Can be initiated by user (own membership) or by an administrator.
   * 
   * @param {Object} currentUser - Authenticated user or admin
   * @param {string} membershipId - Target membership ID
   * @returns {Object} JSON response envelope
   */
  function cancelMembership(currentUser, membershipId) {
    if (!currentUser) {
      return Responses.error('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (!membershipId) {
      return Responses.error('VALIDATION_ERROR', 'membership_id is required.', 400);
    }

    const record = Sheets.findByKey('Memberships', 'membership_id', membershipId);
    if (!record) {
      return Responses.error('NOT_FOUND', 'Membership record not found.', 404);
    }

    const isOwner = String(record.user_id) === String(currentUser.user_id);
    const isAdmin = Auth.checkAdminStatus(currentUser);

    if (!isOwner && !isAdmin) {
      return Responses.error('FORBIDDEN', 'You do not have permission to cancel this membership.', 403);
    }

    const updated = Sheets.update('Memberships', 'membership_id', membershipId, {
      status: 'CANCELLED'
    });

    // Update Users worksheet
    Sheets.update('Users', 'user_id', record.user_id, {
      membership_status: 'CANCELLED'
    });

    LoggerUtil.logActivity(currentUser.user_id, 'MEMBERSHIP_CANCEL', 'MEMBERSHIP', membershipId, {
      previous_status: record.status,
      new_status: 'CANCELLED'
    });

    return Responses.success({
      membership: Validation.sanitizeMembership(updated),
      message: 'Membership has been cancelled.'
    }, 'Membership has been cancelled.');
  }

  /**
   * Assigns sponsorship to an APPROVED advertisement (Authorized Admin action).
   * 
   * CRITICAL SECURITY & BUSINESS RULES:
   * - Ad must exist and have status = 'APPROVED'.
   * - Ad owner MUST be an eligible active member (checkUserEligibility).
   * - Sets is_sponsored = true and sponsored_until.
   * 
   * @param {Object} adminUser - Authenticated admin user
   * @param {Object} payload - { ad_id, duration_days }
   * @returns {Object} JSON response envelope
   */
  function assignAdSponsorship(adminUser, payload) {
    if (!adminUser || !Auth.checkAdminStatus(adminUser)) {
      return Responses.error('FORBIDDEN', 'Administrator privileges required.', 403);
    }

    const adId = payload && (payload.ad_id || payload.id);
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required.', 400);
    }

    const ad = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!ad) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    if (ad.status !== 'APPROVED') {
      return Responses.error('INVALID_STATE', `Only APPROVED advertisements can receive sponsorship. Current status is '${ad.status}'.`, 400);
    }

    // Check ad owner eligibility
    const isEligible = checkUserEligibility(ad.user_id);
    if (!isEligible) {
      return Responses.error('INELIGIBLE_FOR_SPONSORSHIP', 'User does not have an active membership eligible for sponsored ads.', 400);
    }

    const durationDays = parseInt(payload.duration_days || 7, 10);
    if (isNaN(durationDays) || durationDays <= 0) {
      return Responses.error('VALIDATION_ERROR', 'duration_days must be a positive integer.', 400);
    }

    const now = new Date();
    const sponsoredUntil = new Date(now.getTime() + durationDays * 86400000).toISOString();

    const updated = Sheets.update('Ads', 'ad_id', adId, {
      is_sponsored: true,
      sponsored_until: sponsoredUntil,
      updated_at: now.toISOString()
    });

    LoggerUtil.logActivity(adminUser.user_id, 'ADMIN_SPONSOR_AD', 'AD', adId, {
      owner_user_id: ad.user_id,
      duration_days: durationDays,
      sponsored_until: sponsoredUntil
    });

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement has been granted sponsored priority placement.'
    }, 'Advertisement sponsorship activated.');
  }

  /**
   * Revokes sponsorship from an advertisement manually.
   * 
   * @param {Object} adminUser - Authenticated admin user
   * @param {string} adId - Target advertisement ID
   * @returns {Object} JSON response envelope
   */
  function revokeAdSponsorship(adminUser, adId) {
    if (!adminUser || !Auth.checkAdminStatus(adminUser)) {
      return Responses.error('FORBIDDEN', 'Administrator privileges required.', 403);
    }

    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required.', 400);
    }

    const ad = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!ad) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    const updated = Sheets.update('Ads', 'ad_id', adId, {
      is_sponsored: false,
      sponsored_until: '',
      updated_at: new Date().toISOString()
    });

    LoggerUtil.logActivity(adminUser.user_id, 'ADMIN_REVOKE_SPONSOR_AD', 'AD', adId, {
      owner_user_id: ad.user_id
    });

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement sponsorship has been revoked.'
    }, 'Advertisement sponsorship revoked.');
  }

  /**
   * Retrieves all memberships for admin review with dynamic expiry evaluation.
   * 
   * @param {Object} adminUser - Authenticated admin user
   * @returns {Object} JSON response envelope
   */
  function getAllMemberships(adminUser) {
    if (!adminUser || !Auth.checkAdminStatus(adminUser)) {
      return Responses.error('FORBIDDEN', 'Administrator privileges required.', 403);
    }

    const all = Sheets.getAll('Memberships');
    const evaluated = all.map(function(m) {
      const current = evaluateMembershipExpiry(m);
      return Validation.sanitizeMembership(current);
    });

    return Responses.success({
      memberships: evaluated,
      total: evaluated.length
    });
  }

  return {
    getUserMembership: getUserMembership,
    assignMembership: assignMembership,
    cancelMembership: cancelMembership,
    checkUserEligibility: checkUserEligibility,
    assignAdSponsorship: assignAdSponsorship,
    revokeAdSponsorship: revokeAdSponsorship,
    getAllMemberships: getAllMemberships,
    evaluateMembershipExpiry: evaluateMembershipExpiry,
    getMembershipPlans: getMembershipPlans,
    ALLOWED_STATUSES: ALLOWED_STATUSES,
    ALLOWED_PLANS: ALLOWED_PLANS
  };
})();
