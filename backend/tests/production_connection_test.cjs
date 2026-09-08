/**
 * FreeAds Post - PROMPT 07 Production API Connection & Security Test Suite
 * 
 * Verifies all 10 CHECK items, API endpoints, security rules, and seller visibility rules.
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

// SpreadsheetApp Mock
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

global.MailApp = {
  sendEmail: function(email, subject, body, options) {
    return true;
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
let failedTests = 0;

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
    failedTests++;
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
console.log('  PROMPT 07 - PRODUCTION API CONNECTIVITY & SECURITY TESTS   ');
console.log('=============================================================\n');

// Global test variables
let sellerA_Token = null;
let sellerA_UserId = null;
let sellerA_DebugToken = null;
let sellerA_AdId = null;
let sellerA_SponsoredAdId = null;

let sellerB_Token = null;
let sellerB_UserId = null;

let adminToken = null;

const sellerA_Email = `seller_a_${Date.now()}@example.com`;
const sellerB_Email = `seller_b_${Date.now()}@example.com`;
const adminEmail = `admin_${Date.now()}@example.com`;
const testPassword = 'Password123!';

// -------------------------------------------------------------
// PART 1: CORE API CONTRACT ENDPOINTS
// -------------------------------------------------------------

runTest('Endpoint: POST /register creates unverified user', () => {
  const res = dispatch('POST', 'register', {
    name: 'Seller Alice',
    email: sellerA_Email,
    phone: '+91 98765 00001',
    password: testPassword
  });
  assert(res.success === true, 'Registration must return success');
  assert(res.statusCode === 201, 'Status code must be 201');
  assert(res.data.user.email_verified === false, 'email_verified must be false initially');
  assert(res.data.user.password_hash === undefined, 'password_hash must NEVER appear in API response');
  sellerA_UserId = res.data.user.user_id;
  sellerA_DebugToken = res.data.debugToken;
});

runTest('Endpoint: POST /verify-email activates account', () => {
  assert(sellerA_DebugToken, 'Verification token must exist');
  const res = dispatch('POST', 'verify-email', { token: sellerA_DebugToken });
  assert(res.success === true, 'verify-email must succeed');
  assert(res.data.verified === true, 'Account must be verified');
});

runTest('Endpoint: POST /login returns session token and sanitized profile', () => {
  const res = dispatch('POST', 'login', {
    email: sellerA_Email,
    password: testPassword
  });
  assert(res.success === true, 'Login must succeed');
  assert(res.statusCode === 200, 'Status code must be 200');
  assert(res.data.token, 'Token must be returned');
  assert(res.data.user.password_hash === undefined, 'No password hash exposed');
  sellerA_Token = res.data.token;
});

runTest('Endpoint: GET /me returns authenticated profile without password hashes', () => {
  const res = dispatch('GET', 'me', {}, {}, sellerA_Token);
  assert(res.success === true, 'GET /me must succeed');
  assert(res.data.user_id === sellerA_UserId, 'user_id must match');
  assert(res.data.password_hash === undefined, 'password_hash must never appear in /me');
  assert(res.data.token_hash === undefined, 'token_hash must never appear in /me');
});

runTest('Endpoint: POST /ads creates classified ad in PENDING status', () => {
  const res = dispatch('POST', 'ads', {
    title: 'Professional Yamaha Grand Piano',
    category: 'Services',
    description: 'Immaculate condition acoustic piano, perfectly tuned and regulated.',
    location: 'Mumbai, Maharashtra',
    contact_preference: 'BOTH',
    image_url: 'https://images.unsplash.com/photo-1520523839898-507127054976'
  }, {}, sellerA_Token);

  assert(res.success === true, 'POST /ads must succeed');
  assert(res.statusCode === 201, 'Status code must be 201');
  assert(res.data.ad.status === 'PENDING', 'New ad status must be PENDING');
  assert(res.data.ad.is_sponsored === false, 'User cannot set is_sponsored themselves');
  sellerA_AdId = res.data.ad.ad_id;
});

runTest('Endpoint: POST /ads with missing fields returns 400 VALIDATION_ERROR', () => {
  const res = dispatch('POST', 'ads', {
    title: 'Incomplete Ad Title',
    contact_preference: 'EMAIL'
  }, {}, sellerA_Token);

  assert(res.success === false, 'POST /ads with missing fields must fail');
  assert(res.statusCode === 400, 'Status code must be 400');
  assert(res.error.code === 'VALIDATION_ERROR', 'Error code must be VALIDATION_ERROR');
});

runTest('Setup Admin and approve Seller A ads', () => {
  const regAdmin = dispatch('POST', 'register', { name: 'Lead Admin', email: adminEmail, phone: '+91 99999 88888', password: 'AdminPassword1!' });
  dispatch('POST', 'verify-email', { token: regAdmin.data.debugToken });
  const loginRes = dispatch('POST', 'login', { email: adminEmail, password: 'AdminPassword1!' });
  adminToken = loginRes.data.token;
  Sheets.insert('Admins', { admin_id: 'adm_prod_1', email: adminEmail, role: 'SUPER_ADMIN', status: 'ACTIVE', created_at: new Date().toISOString() });

  // Approve the ad
  const appRes = dispatch('POST', `admin/ads/${sellerA_AdId}/approve`, {}, {}, adminToken);
  assert(appRes.success === true, 'Admin approve must succeed');
  assert(appRes.data.ad.status === 'APPROVED', 'Ad status must be APPROVED');
});

runTest('Endpoint: GET /ads returns approved ad while seller is logged in', () => {
  const res = dispatch('GET', 'ads', {});
  assert(res.success === true, 'GET /ads must succeed');
  const found = res.data.ads.some(a => a.ad_id === sellerA_AdId);
  assert(found, 'Approved ad must appear in public feed while seller is logged in');
});

runTest('Endpoint: GET /ads/:id returns ad details with shielded contact for visitors', () => {
  const res = dispatch('GET', `ads/${sellerA_AdId}`, {});
  assert(res.success === true, 'GET /ads/:id must succeed for visitor');
  assert(res.data.ad.contact_locked === true, 'contact_locked must be true for visitors');
  assert(res.data.ad.seller.phone === undefined, 'Seller phone must NOT appear for visitors');
  assert(res.data.ad.seller.email === undefined, 'Seller email must NOT appear for visitors');
});

runTest('Endpoint: POST /ads/:id retrieves ad via POST', () => {
  const res = dispatch('POST', `ads/${sellerA_AdId}`, {});
  assert(res.success === true, 'POST /ads/:id must succeed');
  assert(res.data.ad.ad_id === sellerA_AdId, 'Must return requested ad');
});

runTest('Endpoint: PUT /ads/:id updates ad and resets status to PENDING', () => {
  const res = dispatch('PUT', `ads/${sellerA_AdId}`, {
    title: 'Professional Yamaha Grand Piano - Revised Edition',
    category: 'Services',
    description: 'Immaculate condition acoustic piano with padded bench and humidifier.',
    location: 'Mumbai, Maharashtra',
    contact_preference: 'PHONE'
  }, {}, sellerA_Token);

  assert(res.success === true, 'PUT /ads/:id must succeed');
  assert(res.data.ad.status === 'PENDING', 'Status must reset to PENDING on update');

  // Re-approve for subsequent tests
  dispatch('POST', `admin/ads/${sellerA_AdId}/approve`, {}, {}, adminToken);
});

runTest('Endpoint: DELETE /ads/:id transitions status to DELETED', () => {
  // Create another ad to delete
  const createRes = dispatch('POST', 'ads', {
    title: 'Temporary Ad For Deletion Test',
    category: 'Services',
    description: 'This advertisement is created specifically to test the DELETE endpoint.',
    location: 'Delhi NCR',
    contact_preference: 'EMAIL'
  }, {}, sellerA_Token);
  const deleteAdId = createRes.data.ad.ad_id;

  const delRes = dispatch('DELETE', `ads/${deleteAdId}`, {}, {}, sellerA_Token);
  assert(delRes.success === true, 'DELETE /ads/:id must succeed');
  assert(delRes.data.status === 'DELETED', 'Status must transition to DELETED');
});

// -------------------------------------------------------------
// PART 2: IMPORTANT SECURITY TESTS
// -------------------------------------------------------------

runTest('Security: Public users can browse approved ads', () => {
  const res = dispatch('GET', 'ads', {});
  assert(res.success === true, 'Public visitors can browse ads');
  assert(Array.isArray(res.data.ads), 'Must return array of ads');
});

runTest('Security: Public users cannot receive seller phone/email', () => {
  const res = dispatch('GET', 'ads', {});
  res.data.ads.forEach(ad => {
    assert(ad.seller.phone === undefined, `Ad ${ad.ad_id} must not leak seller.phone to visitor`);
    assert(ad.seller.email === undefined, `Ad ${ad.ad_id} must not leak seller.email to visitor`);
    assert(ad.contact === undefined, `Ad ${ad.ad_id} must not leak contact object to visitor`);
  });
});

runTest('Security: Unauthenticated users cannot create ads', () => {
  const res = dispatch('POST', 'ads', {
    title: 'Unauthenticated Attack Ad',
    category: 'Services',
    description: 'Trying to post an advertisement without providing session token.',
    location: 'Bangalore',
    contact_preference: 'EMAIL'
  });
  assert(res.success === false, 'Must reject unauthenticated ad creation');
  assert(res.statusCode === 401, 'Status code must be 401 UNAUTHORIZED');
});

runTest('Security: Unverified users cannot perform protected actions', () => {
  const unvEmail = `unv_${Date.now()}@example.com`;
  dispatch('POST', 'register', { name: 'Unverified Guy', email: unvEmail, phone: '+91 91111 22222', password: testPassword });
  const loginRes = dispatch('POST', 'login', { email: unvEmail, password: testPassword });
  assert(loginRes.success === false, 'Unverified user cannot log in');
  assert(loginRes.statusCode === 403, 'Must return 403 ACCOUNT_UNVERIFIED');
});

runTest('Security: Users cannot modify another user ad', () => {
  // Register Seller B
  const regB = dispatch('POST', 'register', { name: 'Seller Bob', email: sellerB_Email, phone: '+91 98765 00002', password: testPassword });
  dispatch('POST', 'verify-email', { token: regB.data.debugToken });
  const loginB = dispatch('POST', 'login', { email: sellerB_Email, password: testPassword });
  sellerB_Token = loginB.data.token;
  sellerB_UserId = loginB.data.user.user_id;

  // Seller B tries to modify Seller A's ad
  const res = dispatch('PUT', `ads/${sellerA_AdId}`, {
    title: 'Hijacked by Seller B',
    category: 'Services',
    description: 'Unauthorized edit attempt of someone elses classified ad.',
    location: 'Kolkata',
    contact_preference: 'EMAIL'
  }, {}, sellerB_Token);

  assert(res.success === false, 'User B must not be permitted to edit User A ad');
  assert(res.statusCode === 403, 'Must return 403 FORBIDDEN');
});

runTest('Security: Users cannot make themselves admin', () => {
  // Seller B attempts to pass role: ADMIN in body
  const res = dispatch('GET', 'me', { role: 'ADMIN', user_id: 'fake_admin' }, {}, sellerB_Token);
  assert(res.data.role === 'USER', 'Role must remain USER regardless of body payload');
  const adminCheck = dispatch('GET', 'admin/dashboard', {}, {}, sellerB_Token);
  assert(adminCheck.success === false, 'User cannot access admin dashboard');
  assert(adminCheck.statusCode === 403, 'Must return 403');
});

runTest('Security: Users cannot approve their own ads', () => {
  const res = dispatch('POST', `admin/ads/${sellerA_AdId}/approve`, {}, {}, sellerA_Token);
  assert(res.success === false, 'Normal user cannot call approve ad');
  assert(res.statusCode === 403, 'Must return 403');
});

runTest('Security: Users cannot set is_sponsored themselves', () => {
  const res = dispatch('POST', 'ads', {
    title: 'Tampered Sponsored Flag Ad',
    category: 'Services',
    description: 'Client tries to pass is_sponsored: true manually during creation.',
    location: 'Chennai',
    contact_preference: 'EMAIL',
    is_sponsored: true,
    sponsored_until: '2030-01-01T00:00:00Z'
  }, {}, sellerA_Token);

  assert(res.data.ad.is_sponsored === false, 'Server must enforce is_sponsored = false');
});

runTest('Security: Password hashes never appear in API responses', () => {
  const res = dispatch('POST', 'login', { email: sellerA_Email, password: testPassword });
  const rawStr = JSON.stringify(res);
  assert(!rawStr.includes('password_hash'), 'Response must not contain password_hash key');
  assert(!rawStr.includes('token_hash'), 'Response must not contain token_hash key');
});

runTest('Security: Verification tokens never appear in production API responses', () => {
  // Simulate production environment (EXPOSE_DEBUG_TOKENS: 'false')
  scriptProps.EXPOSE_DEBUG_TOKENS = 'false';
  const prodEmail = `prod_test_${Date.now()}@example.com`;
  const res = dispatch('POST', 'register', { name: 'Prod User', email: prodEmail, phone: '+91 90000 11111', password: testPassword });
  assert(res.data.debugToken === undefined, 'debugToken must be strictly undefined in production');
  scriptProps.EXPOSE_DEBUG_TOKENS = 'true'; // restore for test harness
});

// -------------------------------------------------------------
// PART 3: IMPORTANT SELLER VISIBILITY TEST
// -------------------------------------------------------------

runTest('Visibility: Setup sponsored ad for Seller A', () => {
  const sponRes = dispatch('POST', 'ads', {
    title: 'Premium Sponsored Luxury Villa',
    category: 'Real Estate',
    description: 'Exclusive 5-bedroom villa with private pool and panoramic views.',
    location: 'Goa',
    contact_preference: 'PHONE'
  }, {}, sellerA_Token);
  sellerA_SponsoredAdId = sponRes.data.ad.ad_id;

  // Admin approves and sponsors the ad
  dispatch('POST', `admin/ads/${sellerA_SponsoredAdId}/approve`, {}, {}, adminToken);
  // Assign membership to seller A so sponsorship is valid
  dispatch('POST', 'admin/membership/assign', { user_id: sellerA_UserId, plan: 'PREMIUM_MONTHLY' }, {}, adminToken);
  dispatch('POST', 'admin/sponsor-ad', { ad_id: sellerA_SponsoredAdId, duration_days: 14 }, {}, adminToken);

  const check = AdRepository.findById(sellerA_SponsoredAdId);
  assert(check.is_sponsored === true, 'Ad must be marked sponsored');
});

runTest('Visibility Step 1: Seller A logged in -> Seller A APPROVED ads are publicly visible', () => {
  const feedRes = dispatch('GET', 'ads', {});
  const normalAd = feedRes.data.ads.find(a => a.ad_id === sellerA_AdId);
  const sponsoredAd = feedRes.data.ads.find(a => a.ad_id === sellerA_SponsoredAdId);

  assert(normalAd, 'Seller A normal approved ad must be publicly visible');
  assert(sponsoredAd, 'Seller A sponsored approved ad must be publicly visible');
});

runTest('Visibility Step 2: Seller A logs out -> Seller A APPROVED ads disappear from public listings/search/details', () => {
  // Seller A logs out
  const logoutRes = dispatch('POST', 'logout', {}, {}, sellerA_Token);
  assert(logoutRes.success === true, 'Logout must succeed');

  // 1. Check public listing feed
  const feedRes = dispatch('GET', 'ads', {});
  const normalAd = feedRes.data.ads.find(a => a.ad_id === sellerA_AdId);
  const sponsoredAd = feedRes.data.ads.find(a => a.ad_id === sellerA_SponsoredAdId);
  assert(!normalAd, 'Normal ad must disappear from public listings after logout');
  assert(!sponsoredAd, 'Sponsored ad must disappear from public listings after logout');

  // 2. Check public search
  const searchRes = dispatch('GET', 'ads', {}, { search: 'Yamaha' });
  assert(!searchRes.data.ads.some(a => a.ad_id === sellerA_AdId), 'Ad must not appear in search results');

  // 3. Check direct details endpoint
  const detailNormal = dispatch('GET', `ads/${sellerA_AdId}`, {});
  assert(detailNormal.success === false, 'Direct details request must return 404 for visitor');
  assert(detailNormal.statusCode === 404, 'Must return 404 NOT_FOUND');

  const detailSponsored = dispatch('GET', `ads/${sellerA_SponsoredAdId}`, {});
  assert(detailSponsored.success === false, 'Direct details request for sponsored ad must return 404 for visitor');
  assert(detailSponsored.statusCode === 404, 'Must return 404 NOT_FOUND');
});

runTest('Visibility Step 3: Seller A logs out -> The ad status must remain APPROVED', () => {
  const dbNormalAd = AdRepository.findById(sellerA_AdId);
  assert(dbNormalAd.status === 'APPROVED', 'Normal ad status in sheet must remain APPROVED');

  const dbSponsoredAd = AdRepository.findById(sellerA_SponsoredAdId);
  assert(dbSponsoredAd.status === 'APPROVED', 'Sponsored ad status in sheet must remain APPROVED');
});

runTest('Visibility Step 4: Seller A logs in again -> Previously approved ads become visible again', () => {
  const loginRes = dispatch('POST', 'login', { email: sellerA_Email, password: testPassword });
  sellerA_Token = loginRes.data.token;

  // 1. Check public feed
  const feedRes = dispatch('GET', 'ads', {});
  const normalAd = feedRes.data.ads.find(a => a.ad_id === sellerA_AdId);
  const sponsoredAd = feedRes.data.ads.find(a => a.ad_id === sellerA_SponsoredAdId);

  assert(normalAd, 'Normal ad must reappear in public feed upon login');
  assert(sponsoredAd, 'Sponsored ad must reappear in public feed upon login');

  // 2. Check direct details endpoint
  const detailRes = dispatch('GET', `ads/${sellerA_AdId}`, {});
  assert(detailRes.success === true, 'Direct details endpoint must now return 200 OK');
  assert(detailRes.data.ad.ad_id === sellerA_AdId, 'Ad ID must match');
});

console.log('\n-------------------------------------------------------------');
console.log(`  Results: ${passedTests} of ${totalTests} test cases passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('-------------------------------------------------------------\n');

if (failedTests === 0) {
  console.log('\x1b[32m✔ ALL PRODUCTION CONNECTIVITY & SECURITY TESTS PASSED!\x1b[0m\n');
  process.exit(0);
} else {
  console.error(`\x1b[31m✖ ${failedTests} TESTS FAILED.\x1b[0m\n`);
  process.exit(1);
}
