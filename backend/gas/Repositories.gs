/**
 * FreeAds Post - Repositories & Data Access Layer
 * 
 * Provides a clean abstraction over Google Sheets.
 * Eliminates direct spreadsheet row manipulation and column queries from business logic.
 * Enforces stable identifiers (user_id, ad_id, membership_id, log_id) across all operations.
 */

// GoogleSheetsService serves as the primary gateway to Sheets operations
const GoogleSheetsService = Sheets;

/**
 * User Data Access Repository
 */
const UserRepository = (function() {
  const SHEET_NAME = 'Users';

  function findById(userId) {
    if (!userId) return null;
    return GoogleSheetsService.findByKey(SHEET_NAME, 'user_id', String(userId).trim());
  }

  function findByEmail(email) {
    if (!email) return null;
    return GoogleSheetsService.findByKey(SHEET_NAME, 'email', String(email).trim().toLowerCase());
  }

  function create(userData) {
    return GoogleSheetsService.insert(SHEET_NAME, userData);
  }

  function update(userId, updateData) {
    return GoogleSheetsService.update(SHEET_NAME, 'user_id', String(userId).trim(), updateData);
  }

  function getAll() {
    return GoogleSheetsService.getAll(SHEET_NAME);
  }

  function sanitize(user) {
    return Validation.sanitizeUser(user);
  }

  return {
    findById: findById,
    findByEmail: findByEmail,
    create: create,
    update: update,
    getAll: getAll,
    sanitize: sanitize
  };
})();

/**
 * Session Data Access Repository
 */
const SessionRepository = (function() {
  const SHEET_NAME = 'Sessions';

  function createSession(sessionData) {
    return GoogleSheetsService.insert(SHEET_NAME, sessionData);
  }

  function findValidSession(token) {
    if (!token) return null;
    const tokenHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
      .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2))
      .join('');

    const session = GoogleSheetsService.findByKey(SHEET_NAME, 'token_hash', tokenHash);
    if (!session) return null;

    const now = new Date();
    const exp = new Date(session.expires_at || session.expiresAt);
    if (isNaN(exp.getTime()) || now > exp) {
      return null;
    }

    return session;
  }

  function invalidateSession(token) {
    if (!token) return false;
    const tokenHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
      .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2))
      .join('');

    return GoogleSheetsService.remove(SHEET_NAME, 'token_hash', tokenHash);
  }

  function getActiveSessionUserIds() {
    const allSessions = GoogleSheetsService.getAll(SHEET_NAME);
    const now = new Date();
    const activeMap = {};

    for (let i = 0; i < allSessions.length; i++) {
      const sess = allSessions[i];
      if (!sess.user_id) continue;
      const exp = new Date(sess.expires_at || sess.expiresAt);
      if (!isNaN(exp.getTime()) && now <= exp) {
        activeMap[String(sess.user_id)] = true;
      }
    }

    return activeMap;
  }

  function isUserLoggedIn(userId) {
    if (!userId) return false;
    const now = new Date();
    const session = GoogleSheetsService.findOne(SHEET_NAME, function(s) {
      if (String(s.user_id) !== String(userId)) return false;
      const exp = new Date(s.expires_at || s.expiresAt);
      return !isNaN(exp.getTime()) && now <= exp;
    });
    return Boolean(session);
  }

  return {
    createSession: createSession,
    findValidSession: findValidSession,
    invalidateSession: invalidateSession,
    getActiveSessionUserIds: getActiveSessionUserIds,
    isUserLoggedIn: isUserLoggedIn
  };
})();

/**
 * Advertisement Data Access Repository
 */
const AdRepository = (function() {
  const SHEET_NAME = 'Ads';

  function findById(adId) {
    if (!adId) return null;
    return GoogleSheetsService.findByKey(SHEET_NAME, 'ad_id', String(adId).trim());
  }

  function findByUserId(userId) {
    if (!userId) return [];
    return GoogleSheetsService.findMany(SHEET_NAME, function(ad) {
      return String(ad.user_id) === String(userId);
    });
  }

  function findByStatus(status) {
    if (!status || status === 'ALL') {
      return GoogleSheetsService.getAll(SHEET_NAME);
    }
    const cleanStatus = String(status).trim().toUpperCase();
    return GoogleSheetsService.findMany(SHEET_NAME, function(ad) {
      return String(ad.status).toUpperCase() === cleanStatus;
    });
  }

  function create(adData) {
    return GoogleSheetsService.insert(SHEET_NAME, adData);
  }

  function update(adId, updateData) {
    return GoogleSheetsService.update(SHEET_NAME, 'ad_id', String(adId).trim(), updateData);
  }

  function remove(adId) {
    return GoogleSheetsService.remove(SHEET_NAME, 'ad_id', String(adId).trim());
  }

  function getAll() {
    return GoogleSheetsService.getAll(SHEET_NAME);
  }

  return {
    findById: findById,
    findByUserId: findByUserId,
    findByStatus: findByStatus,
    create: create,
    update: update,
    remove: remove,
    getAll: getAll
  };
})();

/**
 * Membership Data Access Repository
 */
const MembershipRepository = (function() {
  const SHEET_NAME = 'Memberships';

  function findByUserId(userId) {
    if (!userId) return null;
    return GoogleSheetsService.findByKey(SHEET_NAME, 'user_id', String(userId).trim());
  }

  function findById(membershipId) {
    if (!membershipId) return null;
    return GoogleSheetsService.findByKey(SHEET_NAME, 'membership_id', String(membershipId).trim());
  }

  function create(membershipData) {
    return GoogleSheetsService.insert(SHEET_NAME, membershipData);
  }

  function update(membershipId, updateData) {
    return GoogleSheetsService.update(SHEET_NAME, 'membership_id', String(membershipId).trim(), updateData);
  }

  function getAll() {
    return GoogleSheetsService.getAll(SHEET_NAME);
  }

  return {
    findByUserId: findByUserId,
    findById: findById,
    create: create,
    update: update,
    getAll: getAll
  };
})();

/**
 * Admin Data Access Repository
 */
const AdminRepository = (function() {
  const SHEET_NAME = 'Admins';

  function findAdminByEmail(email) {
    if (!email) return null;
    return GoogleSheetsService.findByKey(SHEET_NAME, 'email', String(email).trim().toLowerCase());
  }

  function isAdmin(email) {
    const admin = findAdminByEmail(email);
    return Boolean(admin && admin.status === 'ACTIVE');
  }

  function getAll() {
    return GoogleSheetsService.getAll(SHEET_NAME);
  }

  return {
    findAdminByEmail: findAdminByEmail,
    isAdmin: isAdmin,
    getAll: getAll
  };
})();

/**
 * Activity Log Data Access Repository
 */
const ActivityLogRepository = (function() {
  const SHEET_NAME = 'ActivityLog';

  function log(userId, action, entityType, entityId, metadata = null) {
    try {
      const record = {
        log_id: GoogleSheetsService.generateId('log'),
        user_id: userId || 'SYSTEM',
        action: action,
        entity_type: entityType,
        entity_id: entityId || '',
        timestamp: new Date().toISOString(),
        metadata: metadata ? (typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata)) : ''
      };
      return GoogleSheetsService.insert(SHEET_NAME, record);
    } catch (e) {
      console.error('Failed to insert activity log:', e.toString());
      return null;
    }
  }

  function getRecent(limit = 100) {
    const all = GoogleSheetsService.getAll(SHEET_NAME);
    return all.slice(-Math.min(limit, all.length)).reverse();
  }

  return {
    log: log,
    getRecent: getRecent
  };
})();
