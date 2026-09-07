/**
 * FreeAds Post - Comprehensive API Contract & Backend Foundation Test Suite
 * 
 * Validates all requirements of PROMPT 04:
 * Part 1: Official API contract endpoints (Auth, Ads, Admin, Membership)
 * Part 2: Unified JSON response envelopes and zero sensitive data leakage
 * Part 3: Server-side authentication and email verification enforcement
 * Part 4: Public ads browsing without authentication
 * Part 5: Dynamic seller login visibility calculation (intact APPROVED status)
 * Part 6: Server-side contact privacy enforcement (contact_locked: true)
 * Part 7: Ad ownership verification (user_id === ad.user_id)
 * Part 8: Server-side admin authorization via Admins sheet
 * Part 9: Repositories & Data Access layer with stable IDs
 * Part 10: Server-side payload & URL security validation
 * Part 11: Structured ActivityLog auditing
 * Part 12: Server-side rate limiting protection
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

// 1. In-Memory Mock Google Sheets Database
const memorySheets = {
  Users: [],
  Ads: [],
  Memberships: [],
  EmailVerification: [],
  Admins: [],
  ActivityLog: [],
  Settings: [],
  Sessions: []
};

const TABLE_HEADERS = {
  Users: ['user_id', 'name', 'email', 'phone', 'company_name', 'password_hash', 'email_verified', 'account_status', 'role', 'membership_status', 'last_login', 'is_logged_in', 'created_at', 'updated_at'],
  EmailVerification: ['token_id', 'user_id', 'email', 'token_hash', 'expires_at', 'used', 'created_at'],
  Sessions: ['session_id', 'token_hash', 'user_id', 'role', 'expires_at', 'created_at'],
  Admins: ['admin_id', 'email', 'role', 'status', 'created_at'],
  ActivityLog: ['log_id', 'user_id', 'action', 'entity_type', 'entity_id', 'timestamp', 'metadata'],
  Ads: ['ad_id', 'user_id', 'title', 'category', 'description', 'image_url', 'location', 'contact_preference', 'status', 'rejection_reason', 'is_sponsored', 'sponsored_until', 'created_at', 'updated_at', 'approved_at', 'expires_at'],
  Memberships: ['membership_id', 'user_id', 'plan', 'amount', 'currency', 'payment_id', 'payment_provider', 'start_date', 'expiry_date', 'status', 'created_at'],
  Settings: ['setting', 'value', 'description']
};

// 2. Mock Google Apps Script Global Environment
global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  computeDigest: function(algo, text) {
    const hash = crypto.createHash('sha256').update(text, 'utf8').digest();
    const signedBytes = [];
    for (let i = 0; i < hash.length; i++) {
      let b = hash[i];
      if (b > 127) b = b - 256;
      signedBytes.push(b);
    }
    return signedBytes;
  },
  getUuid: function() {
    return crypto.randomUUID();
  }
};

global.LockService = {
  getScriptLock: function() {
    return {
      tryLock: () => true,
      waitLock: () => true,
      releaseLock: () => {}
    };
  }
};

const scriptProps = {
  EXPOSE_DEBUG_TOKENS: 'true',
  VERIFICATION_EXPIRY_HOURS: '24',
  REQUIRE_EMAIL_VERIFICATION: 'true'
};

global.PropertiesService = {
  getScriptProperties: function() {
    return {
      getProperty: (k) => (k in scriptProps ? scriptProps[k] : null),
      setProperty: (k, v) => { scriptProps[k] = String(v); },
      setProperties: (obj) => { Object.assign(scriptProps, obj); }
    };
  }
};

global.ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: function(content) {
    return {
      _content: content,
      getContent: function() { return this._content; },
      setMimeType: function() { return this; }
    };
  }
};

global.MailApp = {
  sentEmails: [],
  sendEmail: function(options) {
    this.sentEmails.push(options);
  }
};

global.Logger = {
  log: function(...args) {}
};

global.SpreadsheetApp = {
  openById: function(id) {
    return this.getActiveSpreadsheet();
  },
  getActiveSpreadsheet: function() {
    return {
      getId: () => 'mock_spreadsheet_id',
      getSheetByName: function(name) {
        if (!memorySheets[name]) memorySheets[name] = [];
        return {
          getName: () => name,
          getLastRow: () => memorySheets[name].length + 1,
          getLastColumn: () => (TABLE_HEADERS[name] ? TABLE_HEADERS[name].length : 16),
          getRange: function(row, col, numRows, numCols) {
            return {
              getValues: function() {
                const headers = TABLE_HEADERS[name] || [];
                const resRows = [];
                const actualNumRows = (numRows !== undefined && numRows !== null) ? numRows : 1;
                const actualNumCols = (numCols !== undefined && numCols !== null) ? numCols : headers.length;

                for (let r = 0; r < actualNumRows; r++) {
                  const currRowNum = row + r;
                  let fullRow = [];
                  if (currRowNum === 1) {
                    fullRow = headers;
                  } else {
                    const item = memorySheets[name][currRowNum - 2];
                    fullRow = headers.map(h => (item && item[h] !== undefined) ? item[h] : '');
                  }
                  const startCol = (col || 1) - 1;
                  resRows.push(fullRow.slice(startCol, startCol + actualNumCols));
                }
                return resRows;
              },
              setValue: function(val) {
                const rowIndex = row - 2;
                if (rowIndex >= 0 && rowIndex < memorySheets[name].length) {
                  const headers = TABLE_HEADERS[name] || [];
                  const headerName = headers[col - 1];
                  if (headerName) {
                    memorySheets[name][rowIndex][headerName] = val;
                  }
                }
              },
              setValues: function(valuesMatrix) {
                const headers = TABLE_HEADERS[name] || [];
                for (let r = 0; r < valuesMatrix.length; r++) {
                  const targetRowIndex = row - 2 + r;
                  if (targetRowIndex >= 0 && targetRowIndex < memorySheets[name].length) {
                    const rowVals = valuesMatrix[r];
                    for (let cIdx = 0; cIdx < rowVals.length; cIdx++) {
                      const headerName = headers[(col || 1) - 1 + cIdx];
                      if (headerName) {
                        memorySheets[name][targetRowIndex][headerName] = rowVals[cIdx];
                      }
                    }
                  }
                }
              }
            };
          },
          appendRow: function(rowValues) {
            const headers = TABLE_HEADERS[name] || [];
            const obj = {};
            headers.forEach((h, idx) => {
              obj[h] = rowValues[idx];
            });
            memorySheets[name].push(obj);
          },
          deleteRow: function(rowNum) {
            const idx = rowNum - 2;
            if (idx >= 0 && idx < memorySheets[name].length) {
              memorySheets[name].splice(idx, 1);
            }
          }
        };
      }
    };
  }
};

// 3. Load backend GAS files in order
const gasDir = path.join(__dirname, '..', 'gas');
const filesToLoad = [
  'Config.gs',
  'Responses.gs',
  'Sheets.gs',
  'Repositories.gs',
  'RateLimiter.gs',
  'Validation.gs',
  'Logger.gs',
  'AuthMiddleware.gs',
  'EmailService.gs',
  'AuthService.gs',
  'AdService.gs',
  'MembershipService.gs',
  'UserActivityService.gs',
  'AdminService.gs',
  'Router.gs',
  'Main.gs'
];

filesToLoad.forEach(f => {
  let content = fs.readFileSync(path.join(gasDir, f), 'utf8');
  content = content.replace(/^const (\w+)\s*=/gm, 'global.$1 =');
  vm.runInThisContext(content);
});

// Helper for invoking the router with mock HTTP events
function dispatch(method, path, body = {}, params = {}, token = null) {
  Sheets.clearCache();
  const reqBody = Object.assign({}, body);
  if (token && !reqBody.token) {
    reqBody.token = token;
  }
  const event = {
    parameter: Object.assign({}, params, { path: path }),
    pathInfo: path,
    postData: {
      contents: JSON.stringify(Object.assign({ path: path, action: path }, reqBody))
    }
  };
  const res = Router.handle(event, method.toUpperCase());
  return JSON.parse(res.getContent());
}

// Test harness
let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  Sheets.clearCache();
  try {
    fn();
    console.log(` \x1b[32m✔ PASS\x1b[0m [${totalTests}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` \x1b[31m✖ FAIL\x1b[0m [${totalTests}] ${name}`);
    console.error(`   Error: ${err.message}\n`);
  } finally {
    Sheets.clearCache();
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('\n=============================================================');
console.log('  FreeAds Post - API Contract & Backend Foundation Tests     ');
console.log('=============================================================\n');

// Initialize settings in mock sheet
Sheets.insert('Settings', { setting: 'allowed_categories', value: JSON.stringify(['Services', 'Vehicles', 'Electronics', 'Buy & Sell']), description: 'Categories' });

// --- SUITE 1: REPOSITORIES ABSTRACTION LAYER ---
runTest('Repositories Layer: Stable ID operations over GoogleSheetsService', () => {
  assert(typeof GoogleSheetsService.insert === 'function', 'GoogleSheetsService must wrap Sheets');
  assert(typeof UserRepository.findById === 'function', 'UserRepository must expose findById');
  assert(typeof AdRepository.findById === 'function', 'AdRepository must expose findById');
  assert(typeof MembershipRepository.findByUserId === 'function', 'MembershipRepository must expose findByUserId');
  assert(typeof AdminRepository.isAdmin === 'function', 'AdminRepository must expose isAdmin');
  assert(typeof ActivityLogRepository.log === 'function', 'ActivityLogRepository must expose log');
  assert(typeof SessionRepository.createSession === 'function', 'SessionRepository must expose createSession');
});

// --- SUITE 2: AUTHENTICATION API CONTRACT ---
let userToken = null;
let testUserId = null;
let userDebugToken = null;
const userEmail = `seller_contract_${Date.now()}@example.com`;
const userPassword = 'Password123!';

runTest('Contract: POST /register creates unverified user and returns standard envelope', () => {
  const res = dispatch('POST', 'register', {
    name: 'Contract Test Seller',
    email: userEmail,
    phone: '+1 555-0188',
    password: userPassword
  });

  assert(res.success === true, 'Registration must return success = true');
  assert(res.statusCode === 201, 'Status code must be 201');
  assert(res.data.user.email === userEmail, 'User email must match');
  assert(res.data.user.email_verified === false, 'email_verified must be false initially');
  assert(res.data.user.account_status === 'ACTIVE', 'account_status must be ACTIVE');
  assert(res.data.user.password_hash === undefined, 'password_hash must NEVER be exposed');
  assert(res.data.user.salt === undefined, 'salt must NEVER be exposed');
  assert(res.data.user._rowNumber === undefined, '_rowNumber must NEVER be exposed');
  testUserId = res.data.user.user_id;
  userDebugToken = res.data.debugToken;
  assert(testUserId.startsWith('usr_'), 'user_id must be stable prefixed ID');
});

runTest('Contract: POST /login rejects unverified user with ACCOUNT_UNVERIFIED', () => {
  const res = dispatch('POST', 'login', {
    email: userEmail,
    password: userPassword
  });

  assert(res.success === false, 'Login must fail for unverified account');
  assert(res.statusCode === 403, 'Status code must be 403');
  assert(res.error.code === 'EMAIL_NOT_VERIFIED' || res.error.code === 'ACCOUNT_UNVERIFIED', 'Error code must indicate unverified email');
});

runTest('Contract: POST /verify-email verifies user account', () => {
  assert(userDebugToken, 'userDebugToken must be available from registration');
  const res = dispatch('POST', 'verify-email', { token: userDebugToken });
  assert(res.success === true, 'Email verification must succeed');
  assert(res.data.verified === true, 'verified must be true');

  const user = UserRepository.findById(testUserId);
  assert(user.email_verified === true || user.email_verified === 'TRUE', 'User email_verified must be set to true in sheet');
});

runTest('Contract: POST /login returns session token and sanitized user profile', () => {
  const res = dispatch('POST', 'login', {
    email: userEmail,
    password: userPassword
  });

  assert(res.success === true, 'Login must succeed');
  assert(res.statusCode === 200, 'Status code must be 200');
  assert(res.data.token, 'Must return session token');
  assert(res.data.user.user_id === testUserId, 'User ID must match');
  assert(res.data.user.password_hash === undefined, 'No password hash exposed');
  userToken = res.data.token;
});

runTest('Contract: GET /me returns authenticated user profile', () => {
  const res = dispatch('GET', 'me', {}, {}, userToken);
  assert(res.success === true, 'GET /me must succeed with valid token');
  assert(res.data.user_id === testUserId, 'Profile user_id must match');
  assert(res.data.email === userEmail, 'Profile email must match');
  assert(res.data.password_hash === undefined, 'Zero password exposure');
});

runTest('Contract: Server-side Auth Rejection: Ignores client-supplied fake user_id/role', () => {
  const res = dispatch('GET', 'me', { user_id: 'fake_user_id', role: 'ADMIN' }, {}, userToken);
  assert(res.data.user_id === testUserId, 'Must ignore fake body user_id and use token identity');
  assert(res.data.role === 'USER', 'Must ignore fake body role');
});

// --- SUITE 3: ADVERTISEMENT API CONTRACT & REST ROUTING ---
let createdAdId = null;

runTest('Contract: POST /ads creates classified advertisement with status PENDING', () => {
  const res = dispatch('POST', 'ads', {
    title: 'Vintage Synthesizer 1982',
    category: 'Electronics',
    description: 'Analog synthesizer in museum condition. Tested and fully functional.',
    location: 'Chicago, IL',
    price: 1200,
    contact_preference: 'BOTH',
    image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4'
  }, {}, userToken);

  assert(res.success === true, 'POST /ads must succeed');
  assert(res.statusCode === 201, 'Status code must be 201');
  assert(res.data.ad.status === 'PENDING', 'Initial status must be PENDING');
  assert(res.data.ad.is_sponsored === false, 'is_sponsored must be false');
  createdAdId = res.data.ad.ad_id;
  assert(createdAdId.startsWith('ad_'), 'ad_id must be stable prefixed ID');
});

runTest('Contract: Validation: Rejects invalid or dangerous image URLs (javascript:, data:)', () => {
  const resJs = dispatch('POST', 'ads', {
    title: 'Malicious Synthesizer',
    category: 'Electronics',
    description: 'Analog synthesizer in museum condition. Tested and fully functional.',
    location: 'Chicago, IL',
    contact_preference: 'EMAIL',
    image_url: 'javascript:alert(1)'
  }, {}, userToken);
  assert(resJs.success === false, 'Must reject javascript: URL');
  assert(resJs.error.code === 'INVALID_IMAGE_URL', 'Must return INVALID_IMAGE_URL');

  const resData = dispatch('POST', 'ads', {
    title: 'Malicious Data Synthesizer',
    category: 'Electronics',
    description: 'Analog synthesizer in museum condition. Tested and fully functional.',
    location: 'Chicago, IL',
    contact_preference: 'EMAIL',
    image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA'
  }, {}, userToken);
  assert(resData.success === false, 'Must reject data: URI');
});

runTest('Contract: Dynamic Visibility: PENDING ad is absent from public GET /ads', () => {
  const res = dispatch('GET', 'ads', {});
  assert(res.success === true, 'Public GET /ads must succeed without auth');
  const found = res.data.ads.some(a => a.ad_id === createdAdId);
  assert(!found, 'PENDING ad must NOT appear in public feed');
});

// --- SUITE 4: ADMIN APPROVAL & CONTACT PRIVACY ---
let adminToken = null;
const adminEmail = `admin_contract_${Date.now()}@example.com`;

runTest('Contract: Admin setup and GET /admin/dashboard', () => {
  // Register and verify admin
  const regAdmin = dispatch('POST', 'register', { name: 'Super Admin', email: adminEmail, phone: '+1 555-0999', password: 'AdminPassword1!' });
  dispatch('POST', 'verify-email', { token: regAdmin.data.debugToken });
  const loginRes = dispatch('POST', 'login', { email: adminEmail, password: 'AdminPassword1!' });
  adminToken = loginRes.data.token;

  // Authorize in Admins sheet
  Sheets.insert('Admins', { admin_id: 'adm_1', email: adminEmail, role: 'SUPER_ADMIN', status: 'ACTIVE', created_at: new Date().toISOString() });

  const dashRes = dispatch('GET', 'admin/dashboard', {}, {}, adminToken);
  assert(dashRes.success === true, 'GET /admin/dashboard must succeed for admin');
  assert(dashRes.data.stats.total_users >= 2, 'Stats must count registered users');
});

runTest('Contract: Normal user blocked from GET /admin/dashboard with 403', () => {
  const res = dispatch('GET', 'admin/dashboard', {}, {}, userToken);
  assert(res.success === false, 'Normal user must be forbidden from admin endpoint');
  assert(res.statusCode === 403, 'Must return 403 Forbidden');
});

runTest('Contract: GET /admin/ads/pending lists the pending ad', () => {
  const res = dispatch('GET', 'admin/ads/pending', {}, {}, adminToken);
  assert(res.success === true, 'GET /admin/ads/pending must succeed');
  assert(res.data.ads.some(a => a.ad_id === createdAdId), 'Pending ad must be present in pending list');
});

runTest('Contract: POST /admin/ads/:id/approve approves the ad', () => {
  const res = dispatch('POST', `admin/ads/${createdAdId}/approve`, {}, {}, adminToken);
  assert(res.success === true, 'POST /admin/ads/:id/approve must succeed');
  assert(res.data.ad.status === 'APPROVED', 'Ad status must transition to APPROVED');

  // Verify activity log
  const log = Sheets.findOne('ActivityLog', a => a.action === 'ADMIN_APPROVE_AD' && a.entity_id === createdAdId);
  assert(log, 'ADMIN_APPROVE_AD must be recorded in ActivityLog');
});

runTest('Contract: Public GET /ads displays approved ad while seller is logged in', () => {
  const res = dispatch('GET', 'ads', {});
  assert(res.success === true, 'GET /ads must succeed');
  const ad = res.data.ads.find(a => a.ad_id === createdAdId);
  assert(ad, 'Approved ad must appear in public feed while seller is logged in');
  assert(ad.seller.name === 'Contract Test Seller', 'Seller name must be visible');
  // Contact Privacy check for visitors:
  assert(ad.contact_locked === true, 'contact_locked must be true for visitors');
  assert(ad.contact_available === true, 'contact_available must be true');
  assert(ad.seller.phone === undefined, 'Visitor must NOT receive seller phone');
  assert(ad.seller.email === undefined, 'Visitor must NOT receive seller email');
  assert(ad.contact === undefined, 'Visitor must NOT receive contact object');
});

runTest('Contract: Public GET /ads/:id shields contact for unauthenticated visitors', () => {
  const res = dispatch('GET', `ads/${createdAdId}`, {});
  assert(res.success === true, 'GET /ads/:id must succeed for visitor');
  assert(res.data.ad.contact_locked === true, 'contact_locked must be true for unauthenticated visitor');
  assert(res.data.ad.contact_available === true, 'contact_available must be true');
  assert(res.data.ad.seller.phone === undefined, 'Seller phone must NOT be in visitor response');
  assert(res.data.ad.seller.email === undefined, 'Seller email must NOT be in visitor response');
});

runTest('Contract: Authenticated GET /ads/:id reveals contact to verified user', () => {
  const res = dispatch('GET', `ads/${createdAdId}`, {}, {}, userToken);
  assert(res.success === true, 'GET /ads/:id must succeed for authenticated member');
  assert(res.data.ad.contact_locked === false, 'contact_locked must be false for verified member');
  assert(res.data.ad.seller.phone === '+1 555-0188', 'Verified member receives seller phone');
  assert(res.data.ad.seller.email === userEmail, 'Verified member receives seller email');
});

// --- SUITE 5: SELLER LOGOUT VISIBILITY RULE ---
runTest('Contract: Dynamic Visibility: Seller logs out -> ad immediately hidden from public listing & direct detail', () => {
  // Invalidate seller session (logout)
  dispatch('POST', 'logout', {}, {}, userToken);

  // 1. Check public feed
  const feedRes = dispatch('GET', 'ads', {});
  const inFeed = feedRes.data.ads.some(a => a.ad_id === createdAdId);
  assert(!inFeed, 'Ad must immediately disappear from public feed after seller logout');

  // 2. Check direct GET /ads/:id as visitor
  const detailRes = dispatch('GET', `ads/${createdAdId}`, {});
  assert(detailRes.success === false, 'Direct detail request must fail when seller is logged out');
  assert(detailRes.statusCode === 404, 'Must return 404 NOT_FOUND');

  // 3. Verify status in database remains APPROVED (never degraded permanently)
  const dbAd = AdRepository.findById(createdAdId);
  assert(dbAd.status === 'APPROVED', 'Ad status in sheet must remain APPROVED, not permanently degraded');
});

runTest('Contract: Dynamic Visibility: Seller logs in again -> ad reappears in public listing', () => {
  // Seller logs in again
  const loginRes = dispatch('POST', 'login', { email: userEmail, password: userPassword });
  userToken = loginRes.data.token;

  // Check public feed
  const feedRes = dispatch('GET', 'ads', {});
  const ad = feedRes.data.ads.find(a => a.ad_id === createdAdId);
  assert(ad, 'Ad must automatically become visible again once seller logs back in');
});

// --- SUITE 6: AD LIFECYCLE & OWNERSHIP ENFORCEMENT ---
runTest('Contract: PUT /ads/:id updates ad and resets status to PENDING', () => {
  const res = dispatch('PUT', `ads/${createdAdId}`, {
    title: 'Vintage Synthesizer 1982 Updated Edition',
    category: 'Electronics',
    description: 'Updated condition and new patch cables included with instrument.',
    location: 'Chicago, IL',
    contact_preference: 'PHONE',
    image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4'
  }, {}, userToken);

  assert(res.success === true, 'PUT /ads/:id must succeed');
  assert(res.data.ad.status === 'PENDING', 'Status must reset to PENDING upon update');
});

runTest('Contract: Ownership Enforcement: Other user cannot modify ad', () => {
  // Create second user
  const otherEmail = `other_${Date.now()}@example.com`;
  const regOther = dispatch('POST', 'register', { name: 'Other User', email: otherEmail, phone: '+1 555-0333', password: 'Password123!' });
  dispatch('POST', 'verify-email', { token: regOther.data.debugToken });
  const otherLogin = dispatch('POST', 'login', { email: otherEmail, password: 'Password123!' });
  const otherToken = otherLogin.data.token;

  const res = dispatch('PUT', `ads/${createdAdId}`, {
    title: 'Attacker Hijack Attempt',
    category: 'Electronics',
    description: 'Hijacking attempt description text must fail.',
    location: 'Chicago, IL',
    contact_preference: 'EMAIL'
  }, {}, otherToken);

  assert(res.success === false, 'Other user must NOT be permitted to modify ad');
  assert(res.statusCode === 403, 'Must return 403 FORBIDDEN');
});

runTest('Contract: POST /ads/:id/hide hides an approved ad', () => {
  // First re-approve the updated ad
  dispatch('POST', `admin/ads/${createdAdId}/approve`, {}, {}, adminToken);

  const res = dispatch('POST', `ads/${createdAdId}/hide`, {}, {}, userToken);
  assert(res.success === true, 'POST /ads/:id/hide must succeed');
  assert(res.data.ad.status === 'HIDDEN', 'Status must transition to HIDDEN');
});

runTest('Contract: POST /admin/ads/:id/reject rejects with mandatory reason', () => {
  // First submit another ad
  const newAdRes = dispatch('POST', 'ads', {
    title: 'Guitar for Moderation Test',
    category: 'Services',
    description: 'Acoustic guitar in great condition for rejection test.',
    location: 'Austin, TX',
    contact_preference: 'EMAIL'
  }, {}, userToken);
  const rejectAdId = newAdRes.data.ad.ad_id;

  // Rejection without reason must fail
  const failRes = dispatch('POST', `admin/ads/${rejectAdId}/reject`, {}, {}, adminToken);
  assert(failRes.success === false, 'Reject without reason must fail');

  // Rejection with reason succeeds
  const res = dispatch('POST', `admin/ads/${rejectAdId}/reject`, {
    rejection_reason: 'Inappropriate pricing and missing contact phone number.'
  }, {}, adminToken);
  assert(res.success === true, 'Reject with reason must succeed');
  assert(res.data.ad.status === 'REJECTED', 'Status must transition to REJECTED');

  // Resubmit rejected ad
  const resubmitRes = dispatch('POST', `ads/${rejectAdId}/resubmit`, {}, {}, userToken);
  assert(resubmitRes.success === true, 'Resubmit ad must succeed');
  assert(resubmitRes.data.ad.status === 'PENDING', 'Status must transition to PENDING');
});

runTest('Contract: DELETE /ads/:id marks ad DELETED', () => {
  const res = dispatch('DELETE', `ads/${createdAdId}`, {}, {}, userToken);
  assert(res.success === true, 'DELETE /ads/:id must succeed');
  assert(res.data.status === 'DELETED', 'Status must transition to DELETED');
});

// --- SUITE 7: MEMBERSHIP CONTRACT ---
runTest('Contract: GET /membership/plans returns public membership tiers', () => {
  const res = dispatch('GET', 'membership/plans', {});
  assert(res.success === true, 'GET /membership/plans must succeed without auth');
  assert(Array.isArray(res.data.plans), 'Must return plans array');
  assert(res.data.plans.some(p => p.plan_id === 'FREE'), 'Free tier must exist');
  assert(res.data.plans.some(p => p.plan_id === 'PREMIUM_MONTHLY'), 'Premium tier must exist');
});

runTest('Contract: GET /membership returns authenticated user membership details', () => {
  const res = dispatch('GET', 'membership', {}, {}, userToken);
  assert(res.success === true, 'GET /membership must succeed for member');
  assert(res.data.status === 'ACTIVE' || res.data.status === 'FREE', 'Must return valid membership status');
  assert(typeof res.data.is_eligible_for_sponsorship === 'boolean', 'Must return sponsorship eligibility');
});

// --- SUITE 8: RATE LIMITER ENFORCEMENT ---
runTest('Contract: Rate Limiter rejects excessive requests with 429', () => {
  const limiterTestKey = `test_flood_${Date.now()}`;
  let allowedCount = 0;
  let wasBlocked = false;

  for (let i = 0; i < 15; i++) {
    const check = RateLimiter.checkLimit(limiterTestKey, 5, 60);
    if (check.allowed) {
      allowedCount++;
    } else {
      wasBlocked = true;
      break;
    }
  }

  assert(allowedCount === 5, `Expected 5 allowed requests before limit, got ${allowedCount}`);
  assert(wasBlocked === true, 'Rate limiter must block after maxRequests exceeded');
});

console.log('\n-------------------------------------------------------------');
console.log(`  Results: ${passedTests} of ${totalTests} test cases passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('-------------------------------------------------------------\n');

if (passedTests === totalTests) {
  console.log('\x1b[32m✔ ALL API CONTRACT TESTS PASSED SUCCESSFULLY.\x1b[0m\n');
  process.exit(0);
} else {
  console.error('\x1b[31m✖ SOME API CONTRACT TESTS FAILED.\x1b[0m\n');
  process.exit(1);
}
