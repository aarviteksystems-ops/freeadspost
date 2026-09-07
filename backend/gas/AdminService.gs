/**
 * FreeAds Post - Administrator Service
 * 
 * Provides platform-level administration operations, statistics aggregation,
 * advertisement moderation (Approve, Reject, Delete), membership management,
 * activity audit trail, and system settings.
 * 
 * SECURITY:
 * All methods require an active administrator authenticated via the Admins Google Sheet.
 */

const AdminService = (function() {
  const CACHE_KEY_STATS = 'admin_overview_stats';

  /**
   * Invalidates the cached administrator overview statistics.
   */
  function invalidateStatsCache() {
    const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
    if (cache) {
      try {
        cache.remove(CACHE_KEY_STATS);
      } catch (e) {}
    }
  }

  /**
   * Aggregates the 8 core platform statistics.
   * Uses single-pass iterations and caches non-sensitive aggregate counts in CacheService for 60s.
   * 
   * Statistics:
   * 1. Total users
   * 2. Verified users
   * 3. Active users
   * 4. Pending ads
   * 5. Approved ads
   * 6. Rejected ads
   * 7. Sponsored ads
   * 8. Active memberships
   * 
   * @param {Object} adminUser - Authenticated admin user
   * @returns {Object} JSON response envelope with stats and recent items
   */
  function getOverview(adminUser) {
    const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
    let stats = null;

    if (cache) {
      try {
        const raw = cache.get(CACHE_KEY_STATS);
        if (raw) {
          stats = JSON.parse(raw);
        }
      } catch (e) {}
    }

    let ads = [];

    // Compute stats in a single pass if not cached
    if (!stats) {
      let users = [];
      let memberships = [];

      try {
        users = Sheets.getAll('Users');
      } catch (e) {
        LoggerUtil.warn('Failed to read Users for admin overview: ' + e.toString());
      }

      try {
        ads = Sheets.getAll('Ads');
      } catch (e) {
        LoggerUtil.warn('Failed to read Ads for admin overview: ' + e.toString());
      }

      try {
        memberships = Sheets.getAll('Memberships');
      } catch (e) {
        LoggerUtil.warn('Failed to read Memberships for admin overview: ' + e.toString());
      }

      // Single-pass computation for Users
      let verifiedUsers = 0;
      let activeUsers = 0;
      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        if (u.email_verified === true || u.email_verified === 'TRUE' || String(u.email_verified).toLowerCase() === 'true') {
          verifiedUsers++;
        }
        if (String(u.account_status).toUpperCase() === 'ACTIVE') {
          activeUsers++;
        }
      }

      // Single-pass computation for Ads
      let pendingAds = 0;
      let approvedAds = 0;
      let rejectedAds = 0;
      let sponsoredAds = 0;
      for (let i = 0; i < ads.length; i++) {
        const a = ads[i];
        const status = a.status;
        if (status === 'PENDING') pendingAds++;
        else if (status === 'APPROVED') approvedAds++;
        else if (status === 'REJECTED') rejectedAds++;

        const isSpon = (a.is_sponsored === true || a.is_sponsored === 'TRUE' || String(a.is_sponsored).toLowerCase() === 'true');
        if (isSpon && status !== 'DELETED') {
          sponsoredAds++;
        }
      }

      // Single-pass computation for Memberships
      let activeMemberships = 0;
      for (let i = 0; i < memberships.length; i++) {
        if (String(memberships[i].status).toUpperCase() === 'ACTIVE') {
          activeMemberships++;
        }
      }

      stats = {
        total_users: users.length,
        verified_users: verifiedUsers,
        active_users: activeUsers,
        pending_ads: pendingAds,
        approved_ads: approvedAds,
        rejected_ads: rejectedAds,
        sponsored_ads: sponsoredAds,
        active_memberships: activeMemberships
      };

      if (cache) {
        try {
          cache.put(CACHE_KEY_STATS, JSON.stringify(stats), 60);
        } catch (e) {}
      }
    } else {
      // If stats were cached, only fetch ads if needed for recent pending list
      try {
        ads = Sheets.getAll('Ads');
      } catch (e) {}
    }

    // Include recent pending ads for quick review
    const recentPendingAds = ads
      .filter(function(a) { return a.status === 'PENDING'; })
      .sort(function(a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
      .slice(0, 5)
      .map(Validation.sanitizeAd);

    return Responses.success({
      stats: stats,
      recent_pending_ads: recentPendingAds,
      admin: {
        email: adminUser.email,
        name: adminUser.name
      }
    });
  }

  /**
   * Retrieves all users on the platform with sensitive credentials removed
   * and enriched with inactivity tracking metadata.
   */
  function getUsers(adminUser, filter) {
    if (!adminUser || !Auth.checkAdminStatus(adminUser)) {
      return Responses.error('FORBIDDEN', 'Administrator privileges required.', 403);
    }

    const users = Sheets.getAll('Users');
    const now = new Date();
    let inactiveCount = 0;
    let warningCount = 0;

    const enriched = users.map(function(u) {
      const sanitized = Validation.sanitizeUser(u);
      const inactivity = UserActivityService.calculateUserInactivity(u, now);
      sanitized.days_inactive = inactivity.daysInactive;
      sanitized.inactivity_status = inactivity.status;
      sanitized.last_active_date = inactivity.lastActiveDate;
      if (inactivity.status === 'INACTIVE') inactiveCount++;
      else if (inactivity.status === 'WARNING') warningCount++;
      return sanitized;
    });

    let filtered = enriched;
    const filterKey = filter ? String(filter).toUpperCase().trim() : '';
    if (filterKey === 'INACTIVE') {
      filtered = enriched.filter(function(u) { return u.inactivity_status === 'INACTIVE'; });
    } else if (filterKey === 'WARNING') {
      filtered = enriched.filter(function(u) { return u.inactivity_status === 'WARNING'; });
    } else if (filterKey === 'ACTIVE') {
      filtered = enriched.filter(function(u) { return u.inactivity_status === 'ACTIVE'; });
    }

    return Responses.success({
      users: filtered,
      total: filtered.length,
      all_count: enriched.length,
      inactive_count: inactiveCount,
      warning_count: warningCount
    });
  }

  /**
   * Retrieves specifically inactive users for administrator review.
   */
  function getInactiveUsers(adminUser) {
    return getUsers(adminUser, 'INACTIVE');
  }

  /**
   * Retrieves platform advertisements, optionally filtered by status.
   * Enhances each ad with the user's name and email for administrator review.
   */
  function getAds(adminUser, statusFilter) {
    let ads = Sheets.getAll('Ads');
    let users = [];
    try {
      users = Sheets.getAll('Users');
    } catch (e) {}

    const userMap = {};
    users.forEach(function(u) {
      userMap[String(u.user_id)] = {
        name: u.name || 'Unknown',
        email: u.email || ''
      };
    });

    if (statusFilter && statusFilter !== 'ALL') {
      ads = ads.filter(function(a) {
        return String(a.status).toUpperCase() === String(statusFilter).toUpperCase();
      });
    }

    ads.sort(function(a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const enhanced = ads.map(function(a) {
      const sanitized = Validation.sanitizeAd(a);
      const uInfo = userMap[String(a.user_id)] || { name: 'Unknown', email: '' };
      sanitized.user_name = uInfo.name;
      sanitized.user_email = uInfo.email;
      return sanitized;
    });

    return Responses.success({
      ads: enhanced,
      total: enhanced.length,
      filter: statusFilter || 'ALL'
    });
  }

  /**
   * Allows an administrator to edit any advertisement details directly.
   */
  function editAd(adminUser, payload) {
    if (!payload || !payload.ad_id) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required for edit.', 400);
    }

    const adId = String(payload.ad_id).trim();
    const ad = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!ad) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    const title = payload.title !== undefined ? String(payload.title).trim() : ad.title;
    const category = payload.category !== undefined ? String(payload.category).trim() : ad.category;
    const description = payload.description !== undefined ? String(payload.description).trim() : ad.description;
    const location = payload.location !== undefined ? String(payload.location).trim() : ad.location;
    const contactPreference = payload.contact_preference !== undefined ? String(payload.contact_preference).trim().toUpperCase() : ad.contact_preference;
    const rawImageUrl = payload.image_url !== undefined ? String(payload.image_url).trim() : ad.image_url;

    if (title.length < 5) return Responses.error('VALIDATION_ERROR', 'Title must be at least 5 characters.', 400);
    if (description.length < 20) return Responses.error('VALIDATION_ERROR', 'Description must be at least 20 characters.', 400);
    if (location.length < 2) return Responses.error('VALIDATION_ERROR', 'Location is required.', 400);

    const imgErr = Validation.imageUrl(rawImageUrl, true);
    if (imgErr) return Responses.error('INVALID_IMAGE_URL', imgErr, 400);

    const updateObj = {
      title: title,
      category: category,
      description: description,
      location: location,
      contact_preference: contactPreference,
      image_url: rawImageUrl,
      updated_at: new Date().toISOString()
    };

    const updated = Sheets.update('Ads', 'ad_id', adId, updateObj);
    invalidateStatsCache();

    LoggerUtil.logActivity(adminUser.user_id, 'ADMIN_EDIT_AD', 'AD', adId, {
      admin_email: adminUser.email,
      ad_title: title
    });

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement updated successfully by administrator.'
    }, 'Advertisement updated successfully by administrator.');
  }

  /**
   * Approves a PENDING advertisement.
   */
  function approveAd(adminUser, adId) {
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required for approval.', 400);
    }

    const ad = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!ad) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    const nowIso = new Date().toISOString();
    const durationDays = Number(Config.get('DEFAULT_AD_EXPIRY_DAYS', 30));
    const expiresAt = new Date(Date.now() + (durationDays * 24 * 3600 * 1000)).toISOString();

    const updated = Sheets.update('Ads', 'ad_id', adId, {
      status: 'APPROVED',
      rejection_reason: '',
      approved_at: nowIso,
      expires_at: expiresAt,
      updated_at: nowIso
    });
    invalidateStatsCache();

    LoggerUtil.logActivity(adminUser.user_id, 'ADMIN_APPROVE_AD', 'AD', adId, {
      admin_email: adminUser.email,
      ad_title: ad.title,
      status: 'APPROVED'
    });

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement has been approved and published.'
    }, 'Advertisement has been approved and published.');
  }

  /**
   * Rejects an advertisement with a mandatory rejection reason.
   */
  function rejectAd(adminUser, adId, reason) {
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required.', 400);
    }

    const cleanReason = String(reason || '').trim();
    if (!cleanReason || cleanReason.length < 5) {
      return Responses.error('VALIDATION_ERROR', 'Rejection reason is required (minimum 5 characters).', 400);
    }

    const ad = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!ad) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    const nowIso = new Date().toISOString();
    const updated = Sheets.update('Ads', 'ad_id', adId, {
      status: 'REJECTED',
      rejection_reason: cleanReason,
      updated_at: nowIso
    });
    invalidateStatsCache();

    LoggerUtil.logActivity(adminUser.user_id, 'ADMIN_REJECT_AD', 'AD', adId, {
      admin_email: adminUser.email,
      reason: cleanReason,
      ad_title: ad.title
    });

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement rejected.'
    }, 'Advertisement rejected.');
  }

  /**
   * Administratively deletes an advertisement.
   */
  function deleteAd(adminUser, adId) {
    if (!adId) {
      return Responses.error('VALIDATION_ERROR', 'ad_id is required.', 400);
    }

    const ad = Sheets.findByKey('Ads', 'ad_id', adId);
    if (!ad) {
      return Responses.error('NOT_FOUND', 'Advertisement not found.', 404);
    }

    const nowIso = new Date().toISOString();
    const updated = Sheets.update('Ads', 'ad_id', adId, {
      status: 'DELETED',
      updated_at: nowIso
    });
    invalidateStatsCache();

    LoggerUtil.logActivity(adminUser.user_id, 'ADMIN_DELETE_AD', 'AD', adId, {
      admin_email: adminUser.email,
      ad_title: ad.title
    });

    return Responses.success({
      ad_id: adId,
      status: 'DELETED',
      message: 'Advertisement deleted by administrator.'
    }, 'Advertisement deleted by administrator.');
  }

  /**
   * Retrieves all membership records.
   */
  function getMemberships(adminUser) {
    const memberships = Sheets.getAll('Memberships');
    return Responses.success({
      memberships: memberships,
      total: memberships.length
    });
  }

  /**
   * Retrieves platform activity logs.
   */
  function getActivityLogs(adminUser, limit) {
    const max = Number(limit) || 100;
    const logs = Sheets.getAll('ActivityLog');

    logs.sort(function(a, b) {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    return Responses.success({
      logs: logs.slice(0, max),
      total: logs.length
    });
  }

  /**
   * Retrieves system settings.
   */
  function getSettings(adminUser) {
    const settings = Sheets.getAll('Settings');
    return Responses.success({
      settings: settings
    });
  }

  /**
   * Updates a system setting.
   */
  function updateSetting(adminUser, key, value) {
    if (!key) {
      return Responses.error('VALIDATION_ERROR', 'Setting key is required.', 400);
    }

    const existing = Sheets.findByKey('Settings', 'setting', key);
    if (!existing) {
      // Insert new setting
      Sheets.insert('Settings', {
        setting: key,
        value: String(value),
        description: 'Custom configuration key'
      });
    } else {
      // Update existing setting
      Sheets.update('Settings', 'setting', key, {
        value: String(value)
      });
    }

    // If membership_plans setting changed, invalidate its cache
    if (key === 'membership_plans') {
      const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
      if (cache) {
        try {
          cache.remove('membership_plans');
        } catch (e) {}
      }
    }

    LoggerUtil.logActivity(adminUser.user_id, 'ADMIN_UPDATE_SETTING', 'SETTINGS', key, {
      admin_email: adminUser.email,
      key: key,
      value: String(value)
    });

    return Responses.success({
      setting: key,
      value: String(value)
    }, `Setting '${key}' updated successfully.`);
  }

  return {
    getOverview: getOverview,
    invalidateStatsCache: invalidateStatsCache,
    getUsers: getUsers,
    getAds: getAds,
    approveAd: approveAd,
    rejectAd: rejectAd,
    editAd: editAd,
    deleteAd: deleteAd,
    getMemberships: getMemberships,
    getActivityLogs: getActivityLogs,
    getSettings: getSettings,
    updateSetting: updateSetting,
    getInactiveUsers: getInactiveUsers
  };
})();
