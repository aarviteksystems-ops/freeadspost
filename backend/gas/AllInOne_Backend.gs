// === FREEADS POST ALL-IN-ONE GOOGLE APPS SCRIPT BACKEND ===

// ==========================================
// FILE: Config.gs
// ==========================================

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


// ==========================================
// FILE: Responses.gs
// ==========================================

/**
 * FreeAds Post - HTTP Responses & CORS Strategy
 * 
 * Standardizes API JSON responses. Google Apps Script Web Apps automatically 
 * provide standard CORS headers (`Access-Control-Allow-Origin: *`) on ContentService outputs
 * when the web app is deployed with access: "Anyone".
 */

const Responses = (function() {

  /**
   * Generates a successful JSON response envelope.
   */
  function success(data = null, message = null, statusCode = 200) {
    const payload = {
      success: true,
      statusCode: statusCode,
      message: message,
      data: data,
      error: null,
      timestamp: new Date().toISOString()
    };
    return buildOutput(payload);
  }

  /**
   * Generates a standardized error response envelope.
   * 
   * @param {string} code - Machine-readable error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND')
   * @param {string} message - Human-readable explanation
   * @param {number} statusCode - HTTP status code
   * @param {any} details - Optional field-level validation errors or metadata
   */
  function error(code, message, statusCode = 400, details = null) {
    const payload = {
      success: false,
      statusCode: statusCode,
      data: null,
      error: {
        code: code,
        message: message,
        details: details
      },
      timestamp: new Date().toISOString()
    };
    return buildOutput(payload);
  }

  /**
   * Serializes payload to JSON and sets appropriate MIME type.
   */
  function buildOutput(payload) {
    const output = ContentService.createTextOutput(JSON.stringify(payload));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }

  return {
    success: success,
    error: error,
    buildOutput: buildOutput
  };
})();


// ==========================================
// FILE: Logger.gs
// ==========================================

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


// ==========================================
// FILE: Validation.gs
// ==========================================

/**
 * FreeAds Post - Validation & Sanitization Utilities
 * 
 * Reusable validation routines for inputs and strict sanitizers for outputs.
 * Guarantees that sensitive data (password hashes, salts, internal row numbers)
 * are NEVER returned to frontend clients.
 */

const Validation = (function() {

  /**
   * Verifies that all specified fields exist and are non-empty in the data object.
   * Returns null if valid, or an array of error messages.
   */
  function required(data, fields) {
    if (!data || typeof data !== 'object') {
      return ['Missing request body'];
    }

    const errors = [];
    fields.forEach(function(field) {
      const val = data[field];
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        errors.push(`Field '${field}' is required.`);
      }
    });

    return errors.length > 0 ? errors : null;
  }

  /**
   * Validates email address format.
   */
  function email(emailStr) {
    if (!emailStr || typeof emailStr !== 'string') return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(emailStr.trim().toLowerCase());
  }

  /**
   * Validates external image URL.
   * Enforces:
   * - Optional (allowed empty)
   * - Must use http:// or https:// protocol
   * - Rejects javascript:, data:, file:, blob:, vbscript:
   * - Rejects malformed URLs and excessive length (max 500 chars)
   */
  function imageUrl(urlStr, allowEmpty = true) {
    if (!urlStr || typeof urlStr !== 'string' || urlStr.trim() === '') {
      return allowEmpty ? null : 'Image URL is required.';
    }

    const trimmed = urlStr.trim();

    if (trimmed.length > 500) {
      return 'Image URL cannot exceed 500 characters.';
    }

    // Explicitly reject dangerous schemes
    const lower = trimmed.toLowerCase().replace(/\s+/g, '');
    if (lower.startsWith('javascript:') || lower.includes('javascript:')) {
      return 'Invalid URL: javascript: URLs are strictly prohibited.';
    }
    if (lower.startsWith('data:') || lower.includes('data:')) {
      return 'Invalid URL: Base64 data URIs are not allowed. Please provide an external HTTP/HTTPS image URL.';
    }
    if (lower.startsWith('file:') || lower.startsWith('blob:') || lower.startsWith('vbscript:')) {
      return 'Invalid URL: Unsupported protocol. Only HTTP and HTTPS URLs are allowed.';
    }

    // Must start with http:// or https://
    const validProtocol = /^https?:\/\//i.test(trimmed);
    if (!validProtocol) {
      return 'Image URL must start with http:// or https://';
    }

    // Full URL pattern validation
    const re = /^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/i;
    if (!re.test(trimmed)) {
      return 'Malformed image URL. Please enter a valid external image web address.';
    }

    return null;
  }

  /**
   * Validates external HTTPS URL.
   */
  function httpsUrl(urlStr, allowEmpty = true) {
    return imageUrl(urlStr, allowEmpty) === null;
  }

  /**
   * Validates string length.
   */
  function stringLength(val, fieldName, min = 0, max = Infinity) {
    if (typeof val !== 'string') {
      return `Field '${fieldName}' must be a string.`;
    }
    const len = val.trim().length;
    if (len < min) {
      return `Field '${fieldName}' must be at least ${min} characters.`;
    }
    if (len > max) {
      return `Field '${fieldName}' cannot exceed ${max} characters.`;
    }
    return null;
  }

  /**
   * Validates value against an allowed set of enum values.
   */
  function enumValue(val, fieldName, allowedValues) {
    if (!allowedValues.includes(val)) {
      return `Field '${fieldName}' must be one of: ${allowedValues.join(', ')}.`;
    }
    return null;
  }

  /**
   * Strips password_hash, salt, and internal sheet row indicators from user objects.
   * STRICT: NEVER expose password hashes or verification hashes.
   */
  function sanitizeUser(userObj) {
    if (!userObj) return null;
    const clean = Object.assign({}, userObj);
    delete clean._rowNumber;
    delete clean.password_hash;
    delete clean.token_hash;
    delete clean.session_id;

    for (const key of Object.keys(clean)) {
      const lower = key.toLowerCase();
      if (lower.includes('_hash') || lower.includes('_salt') || lower.includes('password')) {
        delete clean[key];
      }
    }
    return clean;
  }

  /**
   * Sanitizes ad objects for public/authenticated consumption.
   * Dynamically evaluates sponsored_until: if expired, is_sponsored is forced to false.
   */
  function sanitizeAd(adObj) {
    if (!adObj) return null;
    const clean = Object.assign({}, adObj);
    delete clean._rowNumber;

    // Evaluate sponsorship expiry dynamically
    const isSpon = (clean.is_sponsored === true || clean.is_sponsored === 'TRUE' || String(clean.is_sponsored).toLowerCase() === 'true');
    if (isSpon && clean.sponsored_until) {
      const exp = new Date(clean.sponsored_until);
      if (!isNaN(exp.getTime()) && new Date() > exp) {
        clean.is_sponsored = false;
      } else {
        clean.is_sponsored = true;
      }
    } else {
      clean.is_sponsored = isSpon;
    }

    return clean;
  }

  /**
   * Sanitizes advertisement objects for public discovery, strictly enforcing
   * that private contact details (phone, email, whatsapp) are never exposed to
   * visitors or unverified users.
   * 
   * @param {Object} adObj - Raw ad record from sheet
   * @param {boolean} canViewContact - Whether requester is authorized to view contact info
   * @param {Object} sellerUser - Seller user record from Users sheet
   * @param {boolean} isFullAccess - Whether requester has admin or owner full access
   * @returns {Object} Publicly safe ad object
   */
  function sanitizePublicAd(adObj, canViewContact, sellerUser, isFullAccess) {
    if (!adObj) return null;
    const base = sanitizeAd(adObj);

    // Delete any private or sensitive internal attributes
    delete base._rowNumber;
    delete base.user_phone;
    delete base.user_email;
    delete base.phone;
    delete base.email;
    delete base.whatsapp;

    const sellerName = sellerUser ? (sellerUser.name || sellerUser.company_name || 'Verified Seller') : 'Verified Seller';
    const contactPreference = (base.contact_preference || 'EMAIL').toUpperCase();
    const hasContactAvailable = Boolean(sellerUser && (sellerUser.phone || sellerUser.email));

    base.seller = {
      name: sellerName
    };
    base.contact_available = hasContactAvailable;
    base.contact_locked = !canViewContact;
    base.slug = (adObj && adObj.slug) || generateSlug(base.title, base.location, base.ad_id);

    if (canViewContact && sellerUser) {
      const contactObj = {
        preference: contactPreference
      };

      if (isFullAccess || contactPreference === 'PHONE' || contactPreference === 'BOTH') {
        if (sellerUser.phone) {
          base.seller.phone = sellerUser.phone;
          contactObj.phone = sellerUser.phone;
        }
      }
      if (isFullAccess || contactPreference === 'EMAIL' || contactPreference === 'BOTH') {
        if (sellerUser.email) {
          base.seller.email = sellerUser.email;
          contactObj.email = sellerUser.email;
        }
      }
      base.contact = contactObj;
      if (!isFullAccess) {
        delete base.rejection_reason;
      }
    } else {
      // Strictly remove private contact & internal seller fields for visitors and unverified users
      delete base.seller.phone;
      delete base.seller.email;
      delete base.seller.whatsapp;
      delete base.contact;
      delete base.user_id;
      delete base.rejection_reason;
      delete base.user_email;
      delete base.user_phone;
      delete base.token;
      delete base.session_id;
      delete base.password_hash;
    }

    return base;
  }

  /**
   * Sanitizes membership records for client consumption.
   */
  function sanitizeMembership(membershipObj) {
    if (!membershipObj) return null;
    const clean = Object.assign({}, membershipObj);
    delete clean._rowNumber;
    return clean;
  }

  /**
   * Validates phone number format. Requires at least 7 digits, permits +, dashes, parens, spaces.
   */
  function phone(phoneStr) {
    if (!phoneStr || typeof phoneStr !== 'string') return false;
    const trimmed = phoneStr.trim();
    const re = /^\+?[0-9\s\-().]{7,20}$/;
    if (!re.test(trimmed)) return false;
    const digitsOnly = trimmed.replace(/\D/g, '');
    return digitsOnly.length >= 7 && digitsOnly.length <= 15;
  }

  /**
   * Validates password strength:
   * Minimum 8 characters, must contain at least one letter and at least one number.
   */
  function passwordStrength(password) {
    if (!password || typeof password !== 'string') {
      return 'Password is required.';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (password.length > 128) {
      return 'Password cannot exceed 128 characters.';
    }
    if (!/[A-Za-z]/.test(password)) {
      return 'Password must contain at least one letter.';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number.';
    }
    return null;
  }

  /**
   * Generates a safe URL slug from ad title and location, with stable ID suffix for duplicates.
   */
  function generateSlug(title, location, adId, isDuplicate) {
    var text = String(title || '').toLowerCase().trim();
    var loc = String(location || '').toLowerCase().trim();
    if (text && loc && text.indexOf(loc) === -1) {
      text = text + ' ' + loc;
    }
    var slug = text
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) slug = 'ad';
    if (isDuplicate && adId) {
      var cleanId = String(adId).toLowerCase().replace(/[^a-z0-9]/g, '');
      var suffix = cleanId.length > 5 ? cleanId.slice(-5) : cleanId;
      slug = slug + '-' + suffix;
    }
    return slug;
  }

  return {
    required: required,
    email: email,
    phone: phone,
    passwordStrength: passwordStrength,
    imageUrl: imageUrl,
    httpsUrl: httpsUrl,
    stringLength: stringLength,
    enumValue: enumValue,
    sanitizeUser: sanitizeUser,
    sanitizeAd: sanitizeAd,
    sanitizePublicAd: sanitizePublicAd,
    sanitizeMembership: sanitizeMembership,
    generateSlug: generateSlug
  };
})();


// ==========================================
// FILE: Sheets.gs
// ==========================================

/**
 * FreeAds Post - Google Sheets Access Layer
 * 
 * Provides an abstract, safe CRUD interface over Google Sheets.
 * Enforces transactional locking via LockService to prevent race conditions during write operations.
 * Operates purely on column headers (Row 1) and stable business IDs.
 */

const Sheets = (function() {
  let cachedSpreadsheet = null;
  const cachedSheets = {};
  const readCache = {};

  /**
   * Clears the in-execution sheet read cache.
   * Can clear a specific sheet or all sheets.
   */
  function clearCache(sheetName = null) {
    if (sheetName) {
      delete readCache[sheetName];
    } else {
      for (const k of Object.keys(readCache)) {
        delete readCache[k];
      }
    }
  }

  /**
   * Retrieves the target Google Spreadsheet instance.
   * Memoizes the instance across the execution lifecycle to avoid redundant openById() RPCs.
   */
  function getSpreadsheet() {
    if (cachedSpreadsheet) {
      return cachedSpreadsheet;
    }
    const spreadsheetId = Config.get('SPREADSHEET_ID');
    if (spreadsheetId) {
      cachedSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
      return cachedSpreadsheet;
    }
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      cachedSpreadsheet = active;
      return cachedSpreadsheet;
    }
    throw new Error('Spreadsheet not configured. Set SPREADSHEET_ID in Script Properties.');
  }

  /**
   * Retrieves a worksheet by name.
   * Memoizes sheet instances to avoid repeated getSheetByName() calls.
   */
  function getSheet(sheetName) {
    if (cachedSheets[sheetName]) {
      return cachedSheets[sheetName];
    }
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet.`);
    }
    cachedSheets[sheetName] = sheet;
    return sheet;
  }

  /**
   * Executes a callback function inside a transactional script lock.
   */
  function withLock(callback, timeoutMs = null) {
    const lock = LockService.getScriptLock();
    const waitTime = timeoutMs || Number(Config.get('LOCK_TIMEOUT_MS', 15000));
    const hasLock = lock.tryLock(waitTime);

    if (!hasLock) {
      throw new Error('Database is currently busy. Please try again.');
    }

    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Neutralizes formula / CSV injection vulnerabilities.
   * If a string value starts with =, +, -, @, \t, or \r, it is prefixed with an apostrophe (').
   * In Google Sheets and Excel, a leading apostrophe instructs the engine to treat the cell purely
   * as literal text, preventing formula and macro execution.
   */
  function sanitizeCellValue(val) {
    if (typeof val === 'string' && /^[=+\-@\t\r]/.test(val)) {
      return "'" + val;
    }
    return val;
  }

  /**
   * Unescapes sanitized formula cell values when read from sheets.
   */
  function unescapeCellValue(val) {
    if (typeof val === 'string' && val.startsWith("'") && /^[=+\-@\t\r]/.test(val.substring(1))) {
      return val.substring(1);
    }
    return val;
  }

  /**
   * Reads all records from a worksheet as an array of JavaScript objects.
   * Row 1 must contain column headers.
   * Utilizes in-execution readCache to prevent duplicate sheet range reads.
   */
  function getAll(sheetName) {
    if (readCache[sheetName]) {
      return readCache[sheetName].slice();
    }

    const sheet = getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1 || lastCol < 1) {
      readCache[sheetName] = [];
      return [];
    }

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = values[0];
    const records = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const record = { _rowNumber: i + 1 };
      let hasData = false;

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (header) {
          record[header] = unescapeCellValue(row[j]);
          if (row[j] !== '' && row[j] !== null) hasData = true;
        }
      }

      if (hasData) {
        records.push(record);
      }
    }

    readCache[sheetName] = records;
    return records.slice();
  }

  /**
   * Finds the first record matching a predicate function.
   */
  function findOne(sheetName, predicate) {
    const all = getAll(sheetName);
    for (let i = 0; i < all.length; i++) {
      if (predicate(all[i])) {
        return all[i];
      }
    }
    return null;
  }

  /**
   * Finds a record by a specific key-value pair.
   * Uses in-memory cache if available; otherwise performs targeted TextFinder row lookup
   * to avoid reading and parsing the entire sheet unnecessarily.
   */
  function findByKey(sheetName, keyColumn, value) {
    if (value === undefined || value === null) return null;
    const strVal = String(value).toLowerCase();

    // 1. Fast in-memory scan if sheet is already cached in this execution
    if (readCache[sheetName]) {
      const all = readCache[sheetName];
      for (let i = 0; i < all.length; i++) {
        if (String(all[i][keyColumn]).toLowerCase() === strVal) {
          return Object.assign({}, all[i]);
        }
      }
      return null;
    }

    // 2. Targeted single-row lookup via native TextFinder on the key column
    try {
      const sheet = getSheet(sheetName);
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow <= 1 || lastCol < 1) return null;

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const colIdx = headers.indexOf(keyColumn);

      if (colIdx !== -1 && typeof sheet.createTextFinder === 'function') {
        const finder = sheet.getRange(2, colIdx + 1, lastRow - 1, 1)
          .createTextFinder(String(value))
          .matchEntireCell(true)
          .matchCase(false);
        const matchCell = finder.findNext();
        if (matchCell) {
          const rowNum = matchCell.getRow();
          const rowVals = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
          const record = { _rowNumber: rowNum };
          for (let j = 0; j < headers.length; j++) {
            if (headers[j]) {
              record[headers[j]] = unescapeCellValue(rowVals[j]);
            }
          }
          return record;
        }
        return null;
      }
    } catch (finderErr) {
      // Fallback to in-memory findOne if TextFinder is not supported
    }

    return findOne(sheetName, function(row) {
      return String(row[keyColumn]).toLowerCase() === strVal;
    });
  }

  /**
   * Finds all records matching a predicate function.
   */
  function findMany(sheetName, predicate = null) {
    const all = getAll(sheetName);
    if (!predicate) return all;
    return all.filter(predicate);
  }

  /**
   * Inserts a single record object into the sheet.
   * Matches object keys to column headers in Row 1.
   */
  function insert(sheetName, recordObj) {
    return withLock(function() {
      const sheet = getSheet(sheetName);
      const lastCol = sheet.getLastColumn();
      if (lastCol < 1) {
        throw new Error(`Sheet "${sheetName}" has no columns defined.`);
      }

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const rowData = [];

      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        let val = recordObj[header];
        if (val === undefined || val === null) {
          val = '';
        } else if (typeof val === 'boolean') {
          val = val ? true : false;
        } else if (typeof val === 'object' && !(val instanceof Date)) {
          val = JSON.stringify(val);
        } else if (typeof val === 'string') {
          val = sanitizeCellValue(val);
        }
        rowData.push(val);
      }

      sheet.appendRow(rowData);
      clearCache(sheetName);
      return recordObj;
    });
  }

  /**
   * Updates an existing record in the sheet matched by a key column and value.
   * Writes the entire updated row in a single atomic setValues() call rather than looping setValue().
   */
  function update(sheetName, keyColumn, keyValue, updateObj) {
    return withLock(function() {
      const sheet = getSheet(sheetName);
      const all = getAll(sheetName);
      const target = all.find(function(row) {
        return String(row[keyColumn]) === String(keyValue);
      });

      if (!target) {
        return null;
      }

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rowNumber = target._rowNumber;
      const currentRowValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];

      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const header = headers[colIdx];
        if (header in updateObj) {
          let val = updateObj[header];
          if (val === undefined || val === null) {
            val = '';
          } else if (typeof val === 'boolean') {
            val = val ? true : false;
          } else if (typeof val === 'object' && !(val instanceof Date)) {
            val = JSON.stringify(val);
          } else if (typeof val === 'string') {
            val = sanitizeCellValue(val);
          }
          currentRowValues[colIdx] = val;
          target[header] = unescapeCellValue(val);
        }
      }

      // Single atomic row write
      const targetRange = sheet.getRange(rowNumber, 1, 1, headers.length);
      if (typeof targetRange.setValues === 'function') {
        targetRange.setValues([currentRowValues]);
      } else {
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          sheet.getRange(rowNumber, colIdx + 1).setValue(currentRowValues[colIdx]);
        }
      }
      clearCache(sheetName);

      delete target._rowNumber;
      return target;
    });
  }

  /**
   * Deletes a record from a sheet by key column and value.
   */
  function remove(sheetName, keyColumn, keyValue) {
    return withLock(function() {
      const sheet = getSheet(sheetName);
      const all = getAll(sheetName);
      const target = all.find(function(row) {
        return String(row[keyColumn]) === String(keyValue);
      });

      if (!target) {
        return false;
      }

      sheet.deleteRow(target._rowNumber);
      clearCache(sheetName);
      return true;
    });
  }

  /**
   * Generates a stable unique ID with an optional prefix.
   */
  function generateId(prefix = 'id') {
    const rawUuid = Utilities.getUuid().replace(/-/g, '');
    return `${prefix}_${rawUuid}`;
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    clearCache: clearCache,
    withLock: withLock,
    getAll: getAll,
    findOne: findOne,
    findByKey: findByKey,
    findMany: findMany,
    insert: insert,
    update: update,
    remove: remove,
    generateId: generateId,
    sanitizeCellValue: sanitizeCellValue,
    unescapeCellValue: unescapeCellValue
  };
})();


// ==========================================
// FILE: Repositories.gs
// ==========================================

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


// ==========================================
// FILE: AuthMiddleware.gs
// ==========================================

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


// ==========================================
// FILE: EmailService.gs
// ==========================================

/**
 * FreeAds Post - Transactional Email Service
 * 
 * Handles sending system emails (email verification, account alerts) via MailApp.
 * Formulates secure links directing back to the frontend application.
 */

const EmailService = (function() {

  /**
   * Dispatches an account email verification message.
   * 
   * @param {string} toEmail - Recipient email address
   * @param {string} recipientName - Recipient display name
   * @param {string} rawToken - Unhashed one-time verification token
   */
  function sendVerificationEmail(toEmail, recipientName, rawToken) {
    const frontendUrl = Config.get('FRONTEND_URL', 'http://localhost:5173');
    const verificationUrl = `${frontendUrl.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const appName = Config.get('APP_NAME', 'FreeAds Post');

    const subject = `Verify your email address - ${appName}`;
    const plainBody = `Hello ${recipientName},\n\n` +
      `Thank you for registering with ${appName}.\n\n` +
      `Please verify your email address by clicking the link below:\n` +
      `${verificationUrl}\n\n` +
      `This verification link will expire in ${Config.get('VERIFICATION_EXPIRY_HOURS', 24)} hours and can only be used once.\n\n` +
      `If you did not create an account, please disregard this email.\n\n` +
      `Best regards,\nThe ${appName} Team`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to ${appName}!</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Thank you for registering. Please click the button below to verify your email address and activate your account:</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${verificationUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Verify Email Address</a>
        </div>
        <p style="color: #64748b; font-size: 14px; line-height: 20px;">Or copy and paste this link into your browser:<br/><a href="${verificationUrl}" style="color: #2563eb; word-break: break-all;">${verificationUrl}</a></p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; line-height: 18px; margin-bottom: 0;">This verification link will expire in ${Config.get('VERIFICATION_EXPIRY_HOURS', 24)} hours and can only be used once. If you did not create this account, no action is needed.</p>
      </div>
    `;

    try {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody
      });
      LoggerUtil.info(`Verification email sent to ${toEmail}`);
    } catch (e) {
      LoggerUtil.warn(`MailApp.sendEmail failed for ${toEmail}: ${e.toString()}`);
    }

    // Return the generated verification URL so test runners and dev environments can inspect it
    return {
      sent: true,
      verificationUrl: verificationUrl
    };
  }

  /**
   * Dispatches an inactivity warning email to notify user that ads will be paused soon.
   */
  function sendInactivityWarningEmail(toEmail, recipientName, daysInactive, daysRemaining) {
    const frontendUrl = Config.get('FRONTEND_URL', 'http://localhost:5173');
    const loginUrl = `${frontendUrl.replace(/\/+$/, '')}/login`;
    const appName = Config.get('APP_NAME', 'FreeAds Post');

    const subject = `Action Required: Your advertisements will be paused soon - ${appName}`;
    const plainBody = `Hello ${recipientName},\n\n` +
      `We noticed you haven't logged in to ${appName} in ${daysInactive} days.\n\n` +
      `To ensure classified listings remain active and relevant, your active advertisements will be set to HIDDEN in ${daysRemaining} days unless you log in.\n\n` +
      `Simply log in to your account to keep your advertisements active:\n` +
      `${loginUrl}\n\n` +
      `Best regards,\nThe ${appName} Team`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #d97706; margin-top: 0;">Notice: Inactive Account Alert</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">We noticed you haven't logged in to <strong>${appName}</strong> in <strong>${daysInactive} days</strong>.</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">To keep community listings fresh, your active advertisements will be set to <strong>HIDDEN</strong> in <strong>${daysRemaining} days</strong> unless you log in.</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Log In to Keep Ads Active</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; line-height: 18px; margin-bottom: 0;">This is an automated platform maintenance notice from ${appName}.</p>
      </div>
    `;

    try {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody
      });
      LoggerUtil.info(`Inactivity warning email sent to ${toEmail}`);
    } catch (e) {
      LoggerUtil.warn(`MailApp.sendEmail failed for ${toEmail}: ${e.toString()}`);
    }

    return { sent: true };
  }

  /**
   * Dispatches an email notification when user ads have been automatically paused.
   */
  function sendInactivityAdHiddenEmail(toEmail, recipientName, daysInactive, hiddenAdsCount) {
    const frontendUrl = Config.get('FRONTEND_URL', 'http://localhost:5173');
    const myAdsUrl = `${frontendUrl.replace(/\/+$/, '')}/my-ads`;
    const appName = Config.get('APP_NAME', 'FreeAds Post');

    const subject = `Your advertisements have been paused due to inactivity - ${appName}`;
    const plainBody = `Hello ${recipientName},\n\n` +
      `Because your account has been inactive for ${daysInactive} days, ${hiddenAdsCount} of your active advertisements have been set to HIDDEN.\n\n` +
      `Your listing data and details are completely preserved. When you are ready, simply log in and request reactivation for each advertisement:\n` +
      `${myAdsUrl}\n\n` +
      `Best regards,\nThe ${appName} Team`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Advertisements Paused</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Because your account has been inactive for <strong>${daysInactive} days</strong>, <strong>${hiddenAdsCount}</strong> of your active advertisements have been automatically set to <strong>HIDDEN</strong>.</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Your data is completely safe and has not been deleted. You can log in at any time to request reactivation for your listings.</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${myAdsUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Review & Reactivate My Ads</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; line-height: 18px; margin-bottom: 0;">This is an automated platform maintenance notice from ${appName}.</p>
      </div>
    `;

    try {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody
      });
      LoggerUtil.info(`Inactivity ad hidden email sent to ${toEmail}`);
    } catch (e) {
      LoggerUtil.warn(`MailApp.sendEmail failed for ${toEmail}: ${e.toString()}`);
    }

    return { sent: true };
  }

  return {
    sendVerificationEmail: sendVerificationEmail,
    sendInactivityWarningEmail: sendInactivityWarningEmail,
    sendInactivityAdHiddenEmail: sendInactivityAdHiddenEmail
  };
})();


// ==========================================
// FILE: RateLimiter.gs
// ==========================================

/**
 * FreeAds Post - Server-Side Rate Limiter
 * 
 * Provides rate limiting using Google Apps Script's native CacheService.
 * Includes an in-memory fallback for local Node.js testing environments.
 */

const RateLimiter = (function() {
  const fallbackCache = {};

  function getCache() {
    if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
      return CacheService.getScriptCache();
    }
    // In-memory fallback for test runner
    return {
      get: function(key) {
        const item = fallbackCache[key];
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
          delete fallbackCache[key];
          return null;
        }
        return item.value;
      },
      put: function(key, value, expirationInSeconds) {
        fallbackCache[key] = {
          value: String(value),
          expiresAt: Date.now() + (expirationInSeconds * 1000)
        };
      },
      remove: function(key) {
        delete fallbackCache[key];
      }
    };
  }

  /**
   * Evaluates request rate for a given key within a sliding expiration window.
   * 
   * @param {string} key - Unique rate-limit identifier
   * @param {number} maxRequests - Allowed requests in the window
   * @param {number} windowSeconds - Expiration window in seconds
   * @returns {{ allowed: boolean, count: number, remaining: number }}
   */
  function checkLimit(key, maxRequests, windowSeconds) {
    const cache = getCache();
    const cacheKey = 'rl:' + key.replace(/[^a-zA-Z0-9_:.-]/g, '_');
    const currentVal = cache.get(cacheKey);

    let count = 0;
    if (currentVal) {
      count = parseInt(currentVal, 10) || 0;
    }

    if (count >= maxRequests) {
      return {
        allowed: false,
        count: count,
        remaining: 0
      };
    }

    count += 1;
    cache.put(cacheKey, String(count), windowSeconds);

    return {
      allowed: true,
      count: count,
      remaining: Math.max(0, maxRequests - count)
    };
  }

  /**
   * Middleware creator for rate-limited endpoints.
   */
  function createMiddleware(keyExtractor, maxRequests, windowSeconds, actionLabel) {
    return function(handler) {
      return function(req) {
        const key = keyExtractor(req);
        const result = checkLimit(key, maxRequests, windowSeconds);

        if (!result.allowed) {
          return Responses.error(
            'RATE_LIMIT_EXCEEDED',
            `Too many requests for ${actionLabel || 'this action'}. Please try again later.`,
            429,
            { retry_after_seconds: windowSeconds }
          );
        }

        return handler(req);
      };
    };
  }

  return {
    checkLimit: checkLimit,
    createMiddleware: createMiddleware,
    // Pre-configured middlewares
    limitRegister: createMiddleware(
      function(req) { return 'reg:' + ((req.body && req.body.email) || 'anon'); },
      10,
      900,
      'registration'
    ),
    limitLogin: createMiddleware(
      function(req) { return 'login:' + ((req.body && req.body.email) || 'anon'); },
      15,
      900,
      'login'
    ),
    limitVerifyEmail: createMiddleware(
      function(req) { return 'verify:' + ((req.body && req.body.token) || 'anon'); },
      15,
      900,
      'email verification'
    ),
    limitCreateAd: createMiddleware(
      function(req) { return 'ad_create:' + ((req.user && req.user.user_id) || 'anon'); },
      30,
      3600,
      'ad creation'
    )
  };
})();


// ==========================================
// FILE: AuthService.gs
// ==========================================

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


// ==========================================
// FILE: AdService.gs
// ==========================================

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


// ==========================================
// FILE: MembershipService.gs
// ==========================================

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


// ==========================================
// FILE: UserActivityService.gs
// ==========================================

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


// ==========================================
// FILE: AdminService.gs
// ==========================================

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


// ==========================================
// FILE: Setup.gs
// ==========================================

/**
 * FreeAds Post - Google Sheets Database Schema Initializer
 * 
 * Run the `setupDatabase()` function once from the Google Apps Script editor
 * bound to your target Google Spreadsheet (or with SpreadsheetApp.openById).
 * 
 * This script creates all 7 required worksheets, formats column headers,
 * freezes header rows, and populates standard initial settings.
 */

const SCHEMA_DEFINITIONS = {
  Users: [
    'user_id',
    'name',
    'email',
    'phone',
    'company_name',
    'password_hash',
    'email_verified',
    'account_status',
    'role',
    'membership_status',
    'last_login',
    'created_at',
    'updated_at'
  ],
  Ads: [
    'ad_id',
    'user_id',
    'title',
    'category',
    'description',
    'image_url',
    'location',
    'contact_preference',
    'status',
    'rejection_reason',
    'is_sponsored',
    'sponsored_until',
    'created_at',
    'updated_at',
    'approved_at',
    'expires_at'
  ],
  Memberships: [
    'membership_id',
    'user_id',
    'plan',
    'amount',
    'currency',
    'payment_id',
    'payment_provider',
    'start_date',
    'expiry_date',
    'status',
    'created_at'
  ],
  EmailVerification: [
    'token_id',
    'user_id',
    'email',
    'token_hash',
    'expires_at',
    'used',
    'created_at'
  ],
  Admins: [
    'admin_id',
    'email',
    'role',
    'status',
    'created_at'
  ],
  ActivityLog: [
    'log_id',
    'user_id',
    'action',
    'entity_type',
    'entity_id',
    'timestamp',
    'metadata'
  ],
  Sessions: [
    'session_id',
    'token_hash',
    'user_id',
    'role',
    'expires_at',
    'created_at'
  ],
  Settings: [
    'setting',
    'value',
    'description'
  ]
};

const DEFAULT_SETTINGS = [
  ['site_name', 'FreeAds Post', 'Public platform branding name'],
  ['default_ad_duration_days', '30', 'Days an approved ad remains visible before expiring'],
  ['verification_token_expiry_hours', '24', 'Lifetime in hours for email verification tokens'],
  ['session_expiry_days', '7', 'Lifetime in days for user sessions'],
  ['allowed_categories', JSON.stringify(['Services', 'Vehicles', 'Electronics', 'Real Estate', 'Jobs', 'Community', 'Buy & Sell']), 'JSON array of valid ad categories'],
  ['require_email_verification', 'true', 'Require email verification before allowing login or viewing ads'],
  ['max_ads_per_free_user', '5', 'Max active ads for free tier accounts'],
  ['admin_notification_email', '', 'Destination email for new pending ad alerts'],
  ['membership_plans', JSON.stringify([
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
  ]), 'Configured membership plans, pricing, duration, and sponsored ad eligibility'],
  ['inactivity_warning_days', '60', 'Days of user inactivity before an advance warning notification is dispatched'],
  ['inactivity_hide_ad_days', '90', 'Days of user inactivity before approved ads are automatically paused (status=HIDDEN)']
];

/**
 * Initializes or updates the active Google Spreadsheet with the required schema.
 * Safe to run multiple times (idempotent).
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No active spreadsheet found. Please run this script inside the target Google Sheet container or provide spreadsheet ID.');
  }

  const existingSheets = ss.getSheets().map(s => s.getName());

  Object.keys(SCHEMA_DEFINITIONS).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    const headers = SCHEMA_DEFINITIONS[sheetName];

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // Set headers in Row 1
    const currentHeadersRange = sheet.getRange(1, 1, 1, headers.length);
    currentHeadersRange.setValues([headers]);
    currentHeadersRange.setFontWeight('bold');
    currentHeadersRange.setBackground('#1e293b');
    currentHeadersRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);

    // Format all columns as Plain Text by default to preserve IDs, JSON, and ISO timestamps
    sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), headers.length).setNumberFormat('@');

    // Auto-resize columns
    sheet.autoResizeColumns(1, headers.length);
  });

  // Populate default settings if empty
  const settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet && settingsSheet.getLastRow() <= 1) {
    settingsSheet.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
    settingsSheet.autoResizeColumns(1, 3);
  }

  // Remove default 'Sheet1' if our schemas are present
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {
      // Ignore if cannot delete
    }
  }

  Logger.log('FreeAds Post database schema successfully initialized.');
}


// ==========================================
// FILE: Router.gs
// ==========================================

/**
 * FreeAds Post - Request Router
 * 
 * Routes incoming HTTP requests (from doGet / doPost) to registered endpoint handlers.
 * Supports standard REST paths, parameterized paths (:id), RPC action names, and HTTP method overriding (_method).
 */

const Router = (function() {
  const routes = [];

  /**
   * Registers a route handler with method and path/action.
   */
  function register(method, path, handler, middlewares = []) {
    let finalHandler = handler;
    // Apply middlewares in reverse order
    for (let i = middlewares.length - 1; i >= 0; i--) {
      finalHandler = middlewares[i](finalHandler);
    }

    const normPath = normalizePath(path);
    const segments = normPath.split('/').filter(Boolean);
    const hasParams = segments.some(function(s) { return s.startsWith(':'); });

    routes.push({
      method: method.toUpperCase(),
      path: normPath,
      segments: segments,
      hasParams: hasParams,
      handler: finalHandler
    });
  }

  function get(path, handler, middlewares = []) {
    register('GET', path, handler, middlewares);
  }

  function post(path, handler, middlewares = []) {
    register('POST', path, handler, middlewares);
  }

  function put(path, handler, middlewares = []) {
    register('PUT', path, handler, middlewares);
  }

  function del(path, handler, middlewares = []) {
    register('DELETE', path, handler, middlewares);
  }

  /**
   * Normalizes path string (strips leading/trailing slashes, lowercase).
   */
  function normalizePath(p) {
    if (!p) return '';
    return p.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  }

  /**
   * Parses incoming Google Apps Script event object into a unified request object.
   */
  function parseRequest(e, httpMethod) {
    const params = (e && e.parameter) ? Object.assign({}, e.parameter) : {};
    let body = {};
    let headers = {};

    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (err) {
        // Fallback for form-encoded or raw strings
        body = { raw: e.postData.contents };
      }
    }

    // Determine target route/action
    const targetPath = normalizePath(
      (body && (body.action || body.path)) ||
      params.action ||
      params.path ||
      (e && e.pathInfo) ||
      ''
    );

    // Support HTTP method override (_method) via POST body or query params, strictly whitelisted
    let effectiveMethod = httpMethod.toUpperCase();
    if (httpMethod.toUpperCase() === 'POST') {
      const overrideVal = (body && typeof body._method === 'string' && body._method) ||
                          (params && typeof params._method === 'string' && params._method);
      if (overrideVal) {
        const requestedMethod = overrideVal.trim().toUpperCase();
        const allowedOverrides = ['PUT', 'DELETE'];
        if (allowedOverrides.indexOf(requestedMethod) !== -1) {
          effectiveMethod = requestedMethod;
        }
      }
    }

    return {
      method: effectiveMethod,
      path: targetPath,
      params: params,
      body: body,
      headers: headers,
      rawEvent: e
    };
  }

  /**
   * Dispatches request to the matching registered route.
   */
  function handle(e, defaultMethod) {
    try {
      const request = parseRequest(e, defaultMethod);

      // 1. Try exact match first
      let match = routes.find(function(r) {
        return r.method === request.method && r.path === request.path;
      });
      let pathParams = {};

      // 2. Try parameterized match (:param) if no exact match found
      if (!match) {
        const reqSegments = request.path.split('/').filter(Boolean);
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          if (r.method !== request.method || !r.hasParams || r.segments.length !== reqSegments.length) {
            continue;
          }
          let isMatch = true;
          const extracted = {};
          for (let s = 0; s < r.segments.length; s++) {
            if (r.segments[s].startsWith(':')) {
              const paramName = r.segments[s].substring(1);
              extracted[paramName] = reqSegments[s];
            } else if (r.segments[s] !== reqSegments[s]) {
              isMatch = false;
              break;
            }
          }
          if (isMatch) {
            match = r;
            pathParams = extracted;
            break;
          }
        }
      }

      if (!match) {
        return Responses.error(
          'ENDPOINT_NOT_FOUND',
          `Route ${request.method} /${request.path} was not found.`,
          404,
          { method: request.method, path: request.path }
        );
      }

      // Merge extracted path parameters into request.params and request.body
      if (Object.keys(pathParams).length > 0) {
        Object.assign(request.params, pathParams);
        if (pathParams.id) {
          if (!request.params.ad_id) request.params.ad_id = pathParams.id;
          if (!request.body.ad_id) request.body.ad_id = pathParams.id;
          if (!request.body.id) request.body.id = pathParams.id;
        }
      }

      return match.handler(request);
    } catch (err) {
      LoggerUtil.error('Unhandled router exception', err);
      return Responses.error(
        'INTERNAL_SERVER_ERROR',
        'An unexpected server error occurred. Please try again later.',
        500
      );
    }
  }

  return {
    register: register,
    get: get,
    post: post,
    put: put,
    del: del,
    handle: handle,
    parseRequest: parseRequest
  };
})();


// ==========================================
// FILE: Main.gs
// ==========================================

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
   * 1. If payload contains ad creation fields (e.g. title + category + description, or contact_preference),
   *    creates new ad (requires auth & rate limit).
   * 2. Otherwise acts as filtered public ads query for RPC client compatibility.
   */
  function handlePostAds(req) {
    const isCreate = req.body && (
      (req.body.title && req.body.category && req.body.description) ||
      req.body.contact_preference !== undefined
    );
    if (isCreate) {
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
   * GET /ads/:id, GET /ad/:slug & GET /ad
   * Returns single ad details by slug or ID for visitors and authenticated members.
   * Contact details are strictly withheld unless authenticated and verified.
   */
  function handleGetPublicAd(req) {
    const rawId = (req.params && (req.params.slug || req.params.id || req.params.ad_id)) || 
                  (req.body && (req.body.slug || req.body.id || req.body.ad_id));
    const adId = cleanId(rawId);
    return AdService.getPublicAdById(adId, req.user);
  }
  Router.get('ads/:id', handleGetPublicAd, [Auth.optionalAuth]);
  Router.post('ads/:id', handleGetPublicAd, [Auth.optionalAuth]);
  Router.get('ad/:slug', handleGetPublicAd, [Auth.optionalAuth]);
  Router.post('ad/:slug', handleGetPublicAd, [Auth.optionalAuth]);
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
  Router.post('ads/:id/update', handleUpdateAd, [Auth.requireAuth]);
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
  Router.post('ads/:id/delete', handleDeleteAd, [Auth.requireAuth]);
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


