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
