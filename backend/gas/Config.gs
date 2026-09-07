/**
 * FreeAds Post - Configuration Management
 * 
 * Manages configuration and environment variables via Google Apps Script's PropertiesService.
 * Sensitive properties (e.g. SPREADSHEET_ID, JWT_SECRET) are stored in Script Properties
 * and never sent or exposed to frontend clients.
 */

const Config = (function() {
  const DEFAULTS = {
    APP_NAME: 'FreeAds Post',
    TOKEN_EXPIRY_DAYS: 7,
    VERIFICATION_EXPIRY_HOURS: 24,
    DEFAULT_AD_EXPIRY_DAYS: 30,
    LOCK_TIMEOUT_MS: 15000,
    REQUIRE_EMAIL_VERIFICATION: true
  };

  /**
   * Retrieves a configuration property by key.
   * Priority: Script Properties -> Active Spreadsheet ID (for SPREADSHEET_ID) -> Defaults.
   */
  function get(key, defaultValue = null) {
    try {
      const scriptProps = PropertiesService.getScriptProperties();
      const val = scriptProps.getProperty(key);
      if (val !== null && val !== undefined) {
        return val;
      }
    } catch (e) {
      // Fall through to defaults if PropertiesService unavailable
    }

    if (key === 'SPREADSHEET_ID') {
      try {
        const activeSs = SpreadsheetApp.getActiveSpreadsheet();
        if (activeSs) return activeSs.getId();
      } catch (e) {
        // Not container-bound
      }
    }

    if (key in DEFAULTS) {
      return DEFAULTS[key];
    }

    return defaultValue;
  }

  /**
   * Sets a configuration property in Script Properties.
   */
  function set(key, value) {
    const scriptProps = PropertiesService.getScriptProperties();
    scriptProps.setProperty(key, String(value));
  }

  /**
   * Sets multiple properties at once.
   */
  function setAll(propertiesObj) {
    const scriptProps = PropertiesService.getScriptProperties();
    scriptProps.setProperties(propertiesObj);
  }

  /**
   * Returns a sanitized public configuration object safe to share with clients if ever requested.
   * STRICT: NEVER includes SPREADSHEET_ID, secrets, or internal keys.
   */
  function getPublicConfig() {
    return {
      appName: get('APP_NAME'),
      requireEmailVerification: get('REQUIRE_EMAIL_VERIFICATION') === true || get('REQUIRE_EMAIL_VERIFICATION') === 'true',
      defaultAdExpiryDays: Number(get('DEFAULT_AD_EXPIRY_DAYS'))
    };
  }

  return {
    get: get,
    set: set,
    setAll: setAll,
    getPublicConfig: getPublicConfig
  };
})();
