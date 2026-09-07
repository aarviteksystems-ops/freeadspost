/**
 * FreeAds Post - User Activity & Inactivity Management Service
 * 
 * Tracks user activity based on last_login (fallback: created_at) and implements:
 * 1. Configurable inactivity settings in Settings sheet (INACTIVITY_WARNING_DAYS, INACTIVITY_HIDE_AD_DAYS).
 * 2. Automated ad pausing: When inactive >= INACTIVITY_HIDE_AD_DAYS, APPROVED ads become HIDDEN.
 * 3. Advance warning notification: When inactive >= INACTIVITY_WARNING_DAYS with active ads, sends warning email.
 * 4. Safe reactivation workflow: Login does NOT automatically publish ads; users request reactivation (HIDDEN -> PENDING).
 * 5. Non-destructive safety: User and advertisement data are NEVER permanently deleted automatically.
 * 6. Audit logging: All automated transitions and reactivation requests are recorded in ActivityLog.
 */

const UserActivityService = (function() {

  /**
   * Retrieves dynamic inactivity settings from the Settings sheet.
   * Never hard-codes threshold values in business logic.
   * 
   * @returns {{ warningDays: number, hideDays: number }}
   */
  function getInactivitySettings() {
    let warningDays = 60;
    let hideDays = 90;

    try {
      const warnRow = Sheets.findByKey('Settings', 'setting', 'inactivity_warning_days');
      if (warnRow && warnRow.value !== undefined && warnRow.value !== null && warnRow.value !== '') {
        const parsed = parseInt(warnRow.value, 10);
        if (!isNaN(parsed) && parsed > 0) warningDays = parsed;
      }

      const hideRow = Sheets.findByKey('Settings', 'setting', 'inactivity_hide_ad_days');
      if (hideRow && hideRow.value !== undefined && hideRow.value !== null && hideRow.value !== '') {
        const parsed = parseInt(hideRow.value, 10);
        if (!isNaN(parsed) && parsed > 0) hideDays = parsed;
      }
    } catch (e) {
      LoggerUtil.warn('Could not read inactivity settings from Settings sheet, using defaults: ' + e.toString());
    }

    return {
      warningDays: warningDays,
      hideDays: hideDays
    };
  }

  /**
   * Calculates inactivity metrics for a given user.
   * Uses last_login timestamp, falling back to created_at if user has never logged in again.
   * 
   * @param {Object} user - User record from Users sheet
   * @param {Date} [now] - Current reference date
   * @returns {{ daysInactive: number, status: 'ACTIVE' | 'WARNING' | 'INACTIVE', lastActiveDate: string }}
   */
  function calculateUserInactivity(user, now) {
    if (!now) now = new Date();
    const settings = getInactivitySettings();
    const lastActiveStr = (user && user.last_login && user.last_login.trim() !== '')
      ? user.last_login
      : (user && user.created_at ? user.created_at : now.toISOString());

    const lastActive = new Date(lastActiveStr);
    let diffMs = now.getTime() - (isNaN(lastActive.getTime()) ? now.getTime() : lastActive.getTime());
    if (diffMs < 0) diffMs = 0;

    const daysInactive = Math.floor(diffMs / (86400000));

    let status = 'ACTIVE';
    if (daysInactive >= settings.hideDays) {
      status = 'INACTIVE';
    } else if (daysInactive >= settings.warningDays) {
      status = 'WARNING';
    }

    return {
      daysInactive: daysInactive,
      status: status,
      lastActiveDate: lastActiveStr
    };
  }

  /**
   * Runs the automated inactivity evaluation job.
   * Scans all users, dispatches warning emails, and pauses APPROVED ads of inactive users.
   * Records every automated change in ActivityLog.
   * 
   * @param {Object} [actor] - Admin user or system cron context
   * @returns {Object} JSON response envelope with execution summary
   */
  function processInactivity(actor) {
    const actorId = (actor && (actor.user_id || actor.email)) || 'SYSTEM_CRON';
    const settings = getInactivitySettings();
    const now = new Date();
    const nowIso = now.toISOString();

    const users = Sheets.getAll('Users');
    const allAds = Sheets.getAll('Ads');

    let warningsSent = 0;
    let adsHidden = 0;
    let activeUsersCount = 0;
    let warningUsersCount = 0;
    let inactiveUsersCount = 0;

    // Index ads by user_id
    const userAdsMap = {};
    allAds.forEach(function(ad) {
      const uId = String(ad.user_id);
      if (!userAdsMap[uId]) userAdsMap[uId] = [];
      userAdsMap[uId].push(ad);
    });

    users.forEach(function(user) {
      const inactivity = calculateUserInactivity(user, now);
      const userAds = userAdsMap[String(user.user_id)] || [];
      const approvedAds = userAds.filter(function(a) { return a.status === 'APPROVED'; });

      if (inactivity.status === 'ACTIVE') {
        activeUsersCount++;
      } else if (inactivity.status === 'WARNING') {
        warningUsersCount++;
        // If user has active approved ads, send advance warning if not already sent recently
        if (approvedAds.length > 0 && user.email) {
          const recentWarning = Sheets.findOne('ActivityLog', function(l) {
            if (l.action === 'USER_INACTIVITY_WARNING' && String(l.entity_id) === String(user.user_id)) {
              const logDate = new Date(l.timestamp);
              const daysSinceLog = (now.getTime() - logDate.getTime()) / (86400000);
              return daysSinceLog < 30; // Don't warn more than once every 30 days
            }
            return false;
          });

          if (!recentWarning) {
            const daysRemaining = Math.max(1, settings.hideDays - inactivity.daysInactive);
            EmailService.sendInactivityWarningEmail(user.email, user.name, inactivity.daysInactive, daysRemaining);
            LoggerUtil.logActivity(actorId, 'USER_INACTIVITY_WARNING', 'USER', user.user_id, {
              email: user.email,
              days_inactive: inactivity.daysInactive,
              days_remaining: daysRemaining,
              approved_ads_count: approvedAds.length
            });
            warningsSent++;
          }
        }
      } else if (inactivity.status === 'INACTIVE') {
        inactiveUsersCount++;
        // Automatically pause all APPROVED ads: APPROVED -> HIDDEN
        let userAdsHidden = 0;
        approvedAds.forEach(function(ad) {
          Sheets.update('Ads', 'ad_id', ad.ad_id, {
            status: 'HIDDEN',
            updated_at: nowIso
          });

          LoggerUtil.logActivity(actorId, 'AD_AUTO_HIDE_INACTIVITY', 'AD', ad.ad_id, {
            user_id: user.user_id,
            days_inactive: inactivity.daysInactive,
            previous_status: 'APPROVED',
            reason: `User inactive for ${inactivity.daysInactive} days (threshold: ${settings.hideDays} days)`
          });

          userAdsHidden++;
          adsHidden++;
        });

        // Notify user if any ads were hidden
        if (userAdsHidden > 0 && user.email) {
          EmailService.sendInactivityAdHiddenEmail(user.email, user.name, inactivity.daysInactive, userAdsHidden);
          LoggerUtil.logActivity(actorId, 'USER_INACTIVITY_AD_HIDDEN_NOTIFICATION', 'USER', user.user_id, {
            email: user.email,
            days_inactive: inactivity.daysInactive,
            ads_hidden_count: userAdsHidden
          });
        }
      }
    });

    const summary = {
      timestamp: nowIso,
      thresholds: {
        warning_days: settings.warningDays,
        hide_days: settings.hideDays
      },
      total_users: users.length,
      active_users: activeUsersCount,
      warning_users: warningUsersCount,
      inactive_users: inactiveUsersCount,
      warnings_sent: warningsSent,
      ads_hidden: adsHidden
    };

    LoggerUtil.logActivity(actorId, 'INACTIVITY_SCAN_COMPLETED', 'SYSTEM', 'BATCH_JOB', summary);

    return Responses.success(summary, `Inactivity evaluation completed. ${adsHidden} ads hidden, ${warningsSent} warnings sent.`);
  }

  /**
   * Safe Reactivation Workflow:
   * Submits a HIDDEN advertisement for administrator moderation review (HIDDEN -> PENDING).
   * Prevents unauthorized automatic re-publication upon login.
   * 
   * @param {Object} user - Authenticated user object
   * @param {string} adId - Advertisement ID to reactivate
   * @returns {Object} JSON response envelope
   */
  function reactivateAd(user, adId) {
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

    // Server-side authorization: ownership check
    if (String(existingAd.user_id) !== String(user.user_id)) {
      return Responses.error('FORBIDDEN', 'You do not have permission to reactivate this advertisement.', 403);
    }

    if (existingAd.status !== 'HIDDEN') {
      return Responses.error('INVALID_STATE', `Only HIDDEN advertisements can be reactivated. Current status is '${existingAd.status}'.`, 400);
    }

    // Check expiry
    if (existingAd.expires_at) {
      const exp = new Date(existingAd.expires_at);
      if (!isNaN(exp.getTime()) && new Date() > exp) {
        return Responses.error('EXPIRED_AD', 'This advertisement has expired. Please edit the ad details to renew before requesting reactivation.', 400);
      }
    }

    const nowIso = new Date().toISOString();
    // Safe transition: HIDDEN -> PENDING (requires admin moderation)
    const updated = Sheets.update('Ads', 'ad_id', adId, {
      status: 'PENDING',
      updated_at: nowIso
    });

    LoggerUtil.logActivity(user.user_id, 'AD_REACTIVATE_REQUEST', 'AD', adId, {
      previous_status: 'HIDDEN',
      new_status: 'PENDING',
      user_id: user.user_id
    });

    return Responses.success({
      ad: Validation.sanitizeAd(updated),
      message: 'Advertisement reactivation requested. An administrator will review and approve your listing.'
    }, 'Reactivation request submitted for admin moderation.');
  }

  return {
    getInactivitySettings: getInactivitySettings,
    calculateUserInactivity: calculateUserInactivity,
    processInactivity: processInactivity,
    reactivateAd: reactivateAd
  };
})();
