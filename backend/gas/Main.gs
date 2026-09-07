/**
 * FreeAds Post - Google Apps Script Backend Entry Point & Endpoint Registry
 * 
 * Handles incoming web requests (doGet & doPost), binds routing table,
 * applies authentication, authorization, and rate-limiting middleware,
 * and routes to controller endpoints.
 * 
 * SENSITIVE DATA POLICY:
 * Never exposes spreadsheet IDs, passwords, hashes, salts, or service credentials to frontend clients.
 */

// Initialize all routes on script load
(function initializeRoutes() {

  // --- Health / Root Information ---
  Router.get('', function() {
    return Responses.success(Config.getPublicConfig(), 'FreeAds Post API running.');
  });
  Router.get('health', function() {
    return Responses.success({ status: 'ok' });
  });

  // --- Authentication Endpoints ---

  /**
   * POST /register
   * Registers new user account with status ACTIVE and email_verified = false,
   * then dispatches a single-use verification email.
   */
  Router.post('register', function(req) {
    return AuthService.register(req.body);
  }, [RateLimiter.limitRegister]);

  /**
   * POST /verify-email
   * Validates one-time verification token and marks user email_verified = true.
   */
  Router.post('verify-email', function(req) {
    const token = (req.body && req.body.token) || (req.params && req.params.token);
    return AuthService.verifyEmail(token);
  }, [RateLimiter.limitVerifyEmail]);

  /**
   * GET /verify-email (Supports direct URL token validation)
   */
  Router.get('verify-email', function(req) {
    const token = req.params && req.params.token;
    return AuthService.verifyEmail(token);
  }, [RateLimiter.limitVerifyEmail]);

  /**
   * POST /login
   * Validates credentials and returns authenticated session token.
   */
  Router.post('login', function(req) {
    return AuthService.login(req.body);
  }, [RateLimiter.limitLogin]);

  /**
   * POST /logout
   * Invalidates active session token.
   */
  Router.post('logout', function(req) {
    const token = Auth.extractToken(req);
    const userId = req.user ? req.user.user_id : null;
    return AuthService.logout(token, userId);
  }, [Auth.requireAuth]);

  /**
   * GET & POST /me (Standard REST Profile Endpoint)
   * Returns sanitized profile of the currently authenticated user.
   */
  function handleMe(req) {
    return Responses.success(Validation.sanitizeUser(req.user));
  }
  Router.get('me', handleMe, [Auth.requireAuth]);
  Router.post('me', handleMe, [Auth.requireAuth]);

  /**
   * GET & POST /current-user (RPC Alias for backwards compatibility)
   */
  Router.get('current-user', handleMe, [Auth.requireAuth]);
  Router.post('current-user', handleMe, [Auth.requireAuth]);

  /**
   * GET & POST /dashboard-summary
   * Returns current user profile with calculated ad counts for the user dashboard.
   */
  function handleDashboardSummary(req) {
    const userId = req.user.user_id;
    let userAds = [];
    try {
      userAds = AdRepository.findByUserId(userId);
    } catch (e) {
      LoggerUtil.warn('Failed to query user ads for dashboard summary: ' + e.toString());
    }

    const counts = {
      total: userAds.length,
      pending: userAds.filter(function(a) { return a.status === 'PENDING'; }).length,
      approved: userAds.filter(function(a) { return a.status === 'APPROVED'; }).length,
      rejected: userAds.filter(function(a) { return a.status === 'REJECTED'; }).length
    };

    return Responses.success({
      user: Validation.sanitizeUser(req.user),
      counts: counts
    });
  }

  Router.get('dashboard-summary', handleDashboardSummary, [Auth.requireAuth]);
  Router.post('dashboard-summary', handleDashboardSummary, [Auth.requireAuth]);

  /**
   * Sanitizes resource IDs (e.g. ad_id, user_id, membership_id) to safe alphanumeric characters.
   */
  function cleanId(id) {
    if (!id || typeof id !== 'string') return '';
    return id.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  }

  // --- Advertisement Endpoints ---

  /**
   * GET /ads
   * Returns list of APPROVED advertisements for visitors and authenticated members.
   * Dynamic Seller Login Visibility: Visible only while seller is actively logged in.
   * Contact details are strictly shielded unless authenticated and verified.
   */
  function handleGetPublicAds(req) {
    const opts = (req.body && Object.keys(req.body).length > 0) ? req.body : req.params;
    return AdService.getPublicAds(opts, req.user);
  }
  Router.get('ads', handleGetPublicAds, [Auth.optionalAuth]);

  /**
   * POST /ads
   * Dual-purpose handler:
   * 1. If payload contains ad creation fields (e.g. title), creates new ad (requires auth & rate limit).
   * 2. Otherwise acts as filtered public ads query for RPC client compatibility.
   */
  function handlePostAds(req) {
    if (req.body && req.body.title && req.body.category && req.body.description) {
      return RateLimiter.limitCreateAd(Auth.requireAuth(function(authReq) {
        return AdService.createAd(authReq.user, authReq.body);
      }))(req);
    }
    return handleGetPublicAds(req);
  }
  Router.post('ads', handlePostAds, [Auth.optionalAuth]);

  /**
   * POST /create-ad (RPC Alias for backwards compatibility)
   */
  Router.post('create-ad', function(req) {
    return AdService.createAd(req.user, req.body);
  }, [RateLimiter.limitCreateAd, Auth.requireAuth]);

  /**
   * GET /ads/:id & GET /ad
   * Returns single ad details by ID for visitors and authenticated members.
   * Contact details are strictly withheld unless authenticated and verified.
   */
  function handleGetPublicAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return AdService.getPublicAdById(adId, req.user);
  }
  Router.get('ads/:id', handleGetPublicAd, [Auth.optionalAuth]);
  Router.get('ad', handleGetPublicAd, [Auth.optionalAuth]);
  Router.post('ad', handleGetPublicAd, [Auth.optionalAuth]);

  /**
   * PUT /ads/:id & PUT /update-ad
   * Updates an existing ad and resets its status to PENDING.
   */
  function handleUpdateAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    const payload = Object.assign({}, req.body, { ad_id: adId });
    return AdService.updateAd(req.user, payload);
  }
  Router.put('ads/:id', handleUpdateAd, [Auth.requireAuth]);
  Router.put('update-ad', handleUpdateAd, [Auth.requireAuth]);
  Router.post('update-ad', handleUpdateAd, [Auth.requireAuth]);

  /**
   * DELETE /ads/:id & DELETE /delete-ad
   * Deletes an ad owned by the authenticated user.
   */
  function handleDeleteAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return AdService.deleteAd(req.user, adId);
  }
  Router.del('ads/:id', handleDeleteAd, [Auth.requireAuth]);
  Router.del('delete-ad', handleDeleteAd, [Auth.requireAuth]);
  Router.post('delete-ad', handleDeleteAd, [Auth.requireAuth]);

  /**
   * POST /ads/:id/hide & POST /hide-ad
   * Hides an APPROVED ad belonging to the user.
   */
  function handleHideAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return AdService.hideAd(req.user, adId);
  }
  Router.post('ads/:id/hide', handleHideAd, [Auth.requireAuth]);
  Router.post('hide-ad', handleHideAd, [Auth.requireAuth]);

  /**
   * POST /ads/:id/resubmit & POST /resubmit-ad
   * Resubmits a REJECTED ad for admin review.
   */
  function handleResubmitAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return AdService.resubmitAd(req.user, adId);
  }
  Router.post('ads/:id/resubmit', handleResubmitAd, [Auth.requireAuth]);
  Router.post('resubmit-ad', handleResubmitAd, [Auth.requireAuth]);

  /**
   * GET & POST /my-ads
   * Returns all ads posted by the current authenticated user (any status).
   */
  function handleGetMyAds(req) {
    return AdService.getMyAds(req.user);
  }
  Router.get('my-ads', handleGetMyAds, [Auth.requireAuth]);
  Router.post('my-ads', handleGetMyAds, [Auth.requireAuth]);

  /**
   * POST /reactivate-ad or /ad/reactivate
   * Safely requests reactivation of a HIDDEN ad for admin review (HIDDEN -> PENDING).
   */
  function handleReactivateAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return UserActivityService.reactivateAd(req.user, adId);
  }
  Router.post('reactivate-ad', handleReactivateAd, [Auth.requireAuth]);
  Router.post('ad/reactivate', handleReactivateAd, [Auth.requireAuth]);

  // --- Administrator Endpoints (Admins Sheet Authorization Required) ---

  /**
   * GET & POST /admin/verify-status
   * Verifies if current session is an active admin.
   */
  function handleAdminVerifyStatus(req) {
    return Responses.success({
      is_admin: true,
      email: req.user.email,
      name: req.user.name
    }, 'Active administrator session verified.');
  }
  Router.get('admin/verify-status', handleAdminVerifyStatus, [Auth.requireAdmin]);
  Router.post('admin/verify-status', handleAdminVerifyStatus, [Auth.requireAdmin]);

  /**
   * GET /admin/dashboard & GET /admin/overview
   * Returns platform overview statistics and recent pending ads.
   */
  function handleAdminOverview(req) {
    return AdminService.getOverview(req.user);
  }
  Router.get('admin/dashboard', handleAdminOverview, [Auth.requireAdmin]);
  Router.post('admin/dashboard', handleAdminOverview, [Auth.requireAdmin]);
  Router.get('admin/overview', handleAdminOverview, [Auth.requireAdmin]);
  Router.post('admin/overview', handleAdminOverview, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/users
   * Returns platform users list optionally filtered by inactivity status.
   */
  function handleAdminUsers(req) {
    const filter = (req.body && req.body.filter) || (req.params && req.params.filter);
    return AdminService.getUsers(req.user, filter);
  }
  Router.get('admin/users', handleAdminUsers, [Auth.requireAdmin]);
  Router.post('admin/users', handleAdminUsers, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/ads/pending
   * Returns platform ads currently in PENDING moderation state.
   */
  function handleAdminAdsPending(req) {
    return AdminService.getAds(req.user, 'PENDING');
  }
  Router.get('admin/ads/pending', handleAdminAdsPending, [Auth.requireAdmin]);
  Router.post('admin/ads/pending', handleAdminAdsPending, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/ads/approved
   * Returns platform ads currently in APPROVED moderation state.
   */
  function handleAdminAdsApproved(req) {
    return AdminService.getAds(req.user, 'APPROVED');
  }
  Router.get('admin/ads/approved', handleAdminAdsApproved, [Auth.requireAdmin]);
  Router.post('admin/ads/approved', handleAdminAdsApproved, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/ads/rejected
   * Returns platform ads currently in REJECTED moderation state.
   */
  function handleAdminAdsRejected(req) {
    return AdminService.getAds(req.user, 'REJECTED');
  }
  Router.get('admin/ads/rejected', handleAdminAdsRejected, [Auth.requireAdmin]);
  Router.post('admin/ads/rejected', handleAdminAdsRejected, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/ads (Generic status filter)
   */
  function handleAdminAds(req) {
    const filter = (req.body && req.body.status) || (req.params && req.params.status) || 'ALL';
    return AdminService.getAds(req.user, filter);
  }
  Router.get('admin/ads', handleAdminAds, [Auth.requireAdmin]);
  Router.post('admin/ads', handleAdminAds, [Auth.requireAdmin]);

  /**
   * POST /admin/ads/:id/approve & POST /admin/approve-ad
   * Approves a PENDING ad and sets approved_at.
   */
  function handleAdminApproveAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return AdminService.approveAd(req.user, adId);
  }
  Router.post('admin/ads/:id/approve', handleAdminApproveAd, [Auth.requireAdmin]);
  Router.post('admin/approve-ad', handleAdminApproveAd, [Auth.requireAdmin]);

  /**
   * POST /admin/ads/:id/reject & POST /admin/reject-ad
   * Rejects an ad with mandatory rejection reason.
   */
  function handleAdminRejectAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    const reason = req.body && (req.body.rejection_reason || req.body.reason);
    return AdminService.rejectAd(req.user, adId, reason);
  }
  Router.post('admin/ads/:id/reject', handleAdminRejectAd, [Auth.requireAdmin]);
  Router.post('admin/reject-ad', handleAdminRejectAd, [Auth.requireAdmin]);

  /**
   * POST /admin/ads/:id/delete & POST /admin/delete-ad
   * Administratively deletes an ad.
   */
  function handleAdminDeleteAd(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return AdminService.deleteAd(req.user, adId);
  }
  Router.post('admin/ads/:id/delete', handleAdminDeleteAd, [Auth.requireAdmin]);
  Router.post('admin/delete-ad', handleAdminDeleteAd, [Auth.requireAdmin]);

  /**
   * POST /admin/edit-ad
   * Administratively edits an advertisement's fields.
   */
  Router.post('admin/edit-ad', function(req) {
    return AdminService.editAd(req.user, req.body);
  }, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/inactive-users
   */
  function handleAdminInactiveUsers(req) {
    return AdminService.getInactiveUsers(req.user);
  }
  Router.get('admin/inactive-users', handleAdminInactiveUsers, [Auth.requireAdmin]);
  Router.post('admin/inactive-users', handleAdminInactiveUsers, [Auth.requireAdmin]);

  /**
   * POST /admin/process-inactivity
   */
  Router.post('admin/process-inactivity', function(req) {
    return UserActivityService.processInactivity(req.user);
  }, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/memberships
   */
  function handleAdminMemberships(req) {
    return MembershipService.getAllMemberships(req.user);
  }
  Router.get('admin/memberships', handleAdminMemberships, [Auth.requireAdmin]);
  Router.post('admin/memberships', handleAdminMemberships, [Auth.requireAdmin]);

  /**
   * POST /admin/membership/assign or /admin/assign-membership
   */
  function handleAdminAssignMembership(req) {
    return MembershipService.assignMembership(req.user, req.body);
  }
  Router.post('admin/membership/assign', handleAdminAssignMembership, [Auth.requireAdmin]);
  Router.post('admin/assign-membership', handleAdminAssignMembership, [Auth.requireAdmin]);

  /**
   * POST /admin/sponsor-ad
   */
  Router.post('admin/sponsor-ad', function(req) {
    return MembershipService.assignAdSponsorship(req.user, req.body);
  }, [Auth.requireAdmin]);

  /**
   * POST /admin/revoke-sponsor-ad
   */
  Router.post('admin/revoke-sponsor-ad', function(req) {
    const rawId = (req.params && (req.params.id || req.params.ad_id)) || (req.body && (req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return MembershipService.revokeAdSponsorship(req.user, adId);
  }, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/logs
   */
  function handleAdminLogs(req) {
    const limit = (req.body && req.body.limit) || (req.params && req.params.limit) || 100;
    return AdminService.getActivityLogs(req.user, limit);
  }
  Router.get('admin/logs', handleAdminLogs, [Auth.requireAdmin]);
  Router.post('admin/logs', handleAdminLogs, [Auth.requireAdmin]);

  /**
   * GET & POST /admin/settings
   */
  function handleAdminSettings(req) {
    return AdminService.getSettings(req.user);
  }
  Router.get('admin/settings', handleAdminSettings, [Auth.requireAdmin]);
  Router.post('admin/settings', handleAdminSettings, [Auth.requireAdmin]);

  /**
   * POST /admin/update-setting
   */
  Router.post('admin/update-setting', function(req) {
    const key = req.body && (req.body.setting || req.body.key);
    const value = req.body && req.body.value;
    return AdminService.updateSetting(req.user, key, value);
  }, [Auth.requireAdmin]);

  // --- Membership Endpoints ---

  /**
   * GET & POST /membership
   * Retrieves active membership details and sponsorship eligibility for current user.
   */
  function handleGetMembership(req) {
    return MembershipService.getUserMembership(req.user);
  }
  Router.get('membership', handleGetMembership, [Auth.requireAuth]);
  Router.post('membership', handleGetMembership, [Auth.requireAuth]);

  /**
   * GET & POST /membership/plans
   * Retrieves configured public membership plans (accessible without authentication).
   */
  function handleGetMembershipPlans(req) {
    return MembershipService.getMembershipPlans();
  }
  Router.get('membership/plans', handleGetMembershipPlans);
  Router.post('membership/plans', handleGetMembershipPlans);

  /**
   * POST /membership/cancel
   * Cancels the current user's membership.
   */
  Router.post('membership/cancel', function(req) {
    const rawId = (req.params && (req.params.id || req.params.membership_id)) || (req.body && (req.body.id || req.body.membership_id));
    const membershipId = cleanId(rawId);
    return MembershipService.cancelMembership(req.user, membershipId);
  }, [Auth.requireAuth]);

})();

/**
 * Main HTTP GET handler for Google Apps Script Web App.
 */
function doGet(e) {
  return Router.handle(e, 'GET');
}

/**
 * Main HTTP POST handler for Google Apps Script Web App.
 * Handles POST, and routes PUT/DELETE via method override or standard routing.
 */
function doPost(e) {
  return Router.handle(e, 'POST');
}

/**
 * Scheduled trigger function for processing user inactivity and automated ad pausing.
 */
function processInactivityDailyTrigger() {
  return UserActivityService.processInactivity({
    user_id: 'SYSTEM_DAILY_TRIGGER',
    email: 'system@freeadspost.internal'
  });
}
