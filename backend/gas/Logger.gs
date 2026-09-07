/**
 * FreeAds Post - Logging & Audit Trail
 * 
 * Provides centralized console logging and records security/business events
 * into the `ActivityLog` worksheet.
 */

const LoggerUtil = (function() {

  /**
   * Logs an action into the `ActivityLog` worksheet.
   * Wrapped in try-catch so audit logging failure does not abort user operations.
   */
  function logActivity(userId, action, entityType, entityId, metadata = null) {
    try {
      const record = {
        log_id: Sheets.generateId('log'),
        user_id: userId || 'SYSTEM',
        action: action,
        entity_type: entityType,
        entity_id: entityId || '',
        timestamp: new Date().toISOString(),
        metadata: metadata ? (typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata)) : ''
      };

      Sheets.insert('ActivityLog', record);
    } catch (e) {
      console.error('Failed to write activity log:', e.toString());
    }
  }

  function info(message, context = null) {
    console.info(`[INFO] ${message}`, context ? JSON.stringify(context) : '');
  }

  function warn(message, context = null) {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context) : '');
  }

  function error(message, err = null) {
    console.error(`[ERROR] ${message}`, err ? (err.stack || err.toString()) : '');
  }

  return {
    logActivity: logActivity,
    info: info,
    warn: warn,
    error: error
  };
})();
