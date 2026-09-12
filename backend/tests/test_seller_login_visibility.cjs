/**
 * FreeAds Post - Seller Login-Based Ad Visibility Test Suite
 * 
 * Verifies all 13 core requirements:
 *  1. Seller logged in + approved ad -> visible
 *  2. Seller logs out -> ad disappears immediately
 *  3. Direct request to ad detail after logout -> 404 NOT_FOUND
 *  4. Seller logs in again -> ad becomes visible again
 *  5. Seller logs out -> sponsored ad disappears from sponsored section
 *  6. Seller logs in again -> sponsored ad returns to sponsored ranking
 *  7. Seller has PENDING ad + logs in -> remains invisible
 *  8. Seller has REJECTED ad + logs in -> remains invisible
 *  9. Seller has HIDDEN ad + logs in -> remains invisible
 * 10. Seller has EXPIRED ad + logs in -> remains invisible
 * 11. Admin views seller's ads -> admin can see/manage them regardless of seller login state
 * 12. Browser tries to manipulate login state manually -> backend ignores it
 * 13. API responses -> logged-out seller ads never returned in payload
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// In-Memory Database Simulator for Google Apps Script Sheets
const TABLE_HEADERS = {
  Users: [
    'user_id', 'name', 'email', 'phone', 'company_name',
    'password_hash', 'email_verified', 'account_status',
    'role', 'membership_status', 'last_login', 'is_logged_in', 'created_at', 'updated_at'
  ],
  Ads: [
    'ad_id', 'user_id', 'title', 'category', 'description',
    'location', 'contact_preference', 'image_url', 'status',
    'is_sponsored', 'sponsored_until', 'rejection_reason',
    'approved_at', 'expires_at', 'created_at', 'updated_at'
  ],
  Admins: [
    'admin_id', 'email', 'role', 'status', 'created_at'
  ],
  Memberships: [
    'membership_id', 'user_id', 'plan', 'amount', 'currency',
    'payment_id', 'payment_provider', 'start_date', 'expiry_date',
    'status', 'created_at'
  ],
  EmailVerification: [
    'token_id', 'user_id', 'email', 'token_hash', 'expires_at', 'used', 'created_at'
  ],
  Sessions: [
    'session_id', 'token_hash', 'user_id', 'role', 'expires_at', 'created_at'
  ],
  ActivityLog: [
    'log_id', 'user_id', 'action', 'entity_type', 'entity_id', 'timestamp', 'metadata'
  ],
  Settings: [
    'setting', 'value', 'description'
  ]
};

const memorySheets = {};
Object.keys(TABLE_HEADERS).forEach(k => { memorySheets[k] = []; });

// Mock GAS globals
global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest: function(algo, text, charset) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(text).digest();
    const bytes = [];
    for (let i = 0; i < hash.length; i++) {
      let b = hash[i];
      if (b > 127) b -= 256;
      bytes.push(b);
    }
    return bytes;
  },
  getUuid: function() {
    return 'uuid-' + Math.random().toString(36).substring(2, 10);
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
  REQUIRE_EMAIL_VERIFICATION: 'true',
  REQUIRE_SELLER_LOGIN: 'true'
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
  sendEmail: function(options) {}
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
          getLastColumn: () => 16,
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
              setValues: function(matrix) {
                const headers = TABLE_HEADERS[name] || [];
                for (let rIdx = 0; rIdx < matrix.length; rIdx++) {
                  const targetRowIndex = (row + rIdx) - 2;
                  if (targetRowIndex >= 0 && targetRowIndex < memorySheets[name].length) {
                    const rowVals = matrix[rIdx];
                    for (let cIdx = 0; cIdx < rowVals.length; cIdx++) {
                      const headerName = headers[(col + cIdx) - 1];
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

// Load backend GAS files
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

let totalTests = 0;
let passedTests = 0;

function runScenario(name, fn) {
  totalTests++;
  Sheets.clearCache();
  try {
    fn();
    console.log(` \x1b[32m✔ PASS\x1b[0m [Case ${totalTests}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` \x1b[31m✖ FAIL\x1b[0m [Case ${totalTests}] ${name}`);
    console.error(`   Error: ${err.message}\n`);
  } finally {
    Sheets.clearCache();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\n=============================================================');
console.log('  FreeAds Post - Seller Login-Based Ad Visibility Tests       ');
console.log('=============================================================\n');

// Shared state
let sellerEmail = `seller_vis_${Date.now()}@example.com`;
let sellerUserId = null;
let sellerToken = null;
let sellerApprovedAdId = null;
let sellerSponsoredAdId = null;

let adminEmail = `admin_vis_${Date.now()}@example.com`;
let adminToken = null;

// Setup: Register & Verify Seller & Admin
const regSeller = AuthService.register({
  name: 'Visible Seller',
  email: sellerEmail,
  phone: '+919876543210',
  password: 'SecurePassword123!'
});
const sellerDbgToken = JSON.parse(regSeller.getContent()).data.debugToken;
AuthService.verifyEmail(sellerDbgToken);
const sellerRecord = Sheets.findOne('Users', u => u.email === sellerEmail);
sellerUserId = sellerRecord.user_id;

// Register & Verify Admin
const regAdmin = AuthService.register({
  name: 'Platform Admin',
  email: adminEmail,
  phone: '+919876543211',
  password: 'AdminPassword123!'
});
const adminDbgToken = JSON.parse(regAdmin.getContent()).data.debugToken;
AuthService.verifyEmail(adminDbgToken);
Sheets.insert('Admins', {
  admin_id: 'adm_' + Date.now(),
  email: adminEmail,
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  created_at: new Date().toISOString()
});
const adminLoginRes = AuthService.login({ email: adminEmail, password: 'AdminPassword123!' });
adminToken = JSON.parse(adminLoginRes.getContent()).data.token;

// --------------------------------------------------------------------------
// Scenario 1: Seller logged in + approved ad -> visible
// --------------------------------------------------------------------------
runScenario('Seller logged in + approved ad -> visible in public listing', () => {
  // Seller logs in
  const loginRes = AuthService.login({ email: sellerEmail, password: 'SecurePassword123!' });
  const loginData = JSON.parse(loginRes.getContent());
  assert(loginData.success, 'Seller login must succeed');
  sellerToken = loginData.data.token;

  // Verify Users sheet has is_logged_in = true
  const user = Sheets.findByKey('Users', 'user_id', sellerUserId);
  assert(user.is_logged_in === true, 'user.is_logged_in must be true upon login');

  // Create an approved ad
  const newAd = Sheets.insert('Ads', {
    ad_id: Sheets.generateId('ad'),
    user_id: sellerUserId,
    title: 'Professional Photography Rig',
    category: 'Electronics',
    description: 'High end camera gear and lenses in mint condition.',
    location: 'Mumbai, MH',
    contact_preference: 'BOTH',
    status: 'APPROVED',
    is_sponsored: false,
    approved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });
  sellerApprovedAdId = newAd.ad_id;

  // Query public ads as visitor (no token)
  const pubReq = { postData: { contents: JSON.stringify({ action: 'ads' }) } };
  const pubRes = Router.handle(pubReq, 'POST');
  const pubData = JSON.parse(pubRes.getContent());

  assert(pubData.success, 'Public ads query must succeed');
  const found = pubData.data.ads.find(a => a.ad_id === sellerApprovedAdId);
  assert(found, 'Approved ad must be visible in public listings while seller is logged in');
  assert(found.status === 'APPROVED', 'Status must be APPROVED');
});

// --------------------------------------------------------------------------
// Scenario 2: Seller logs out -> ad disappears immediately from public listing
// --------------------------------------------------------------------------
runScenario('Seller logs out -> ad disappears from public listing immediately', () => {
  // Seller logs out
  const logoutRes = AuthService.logout(sellerToken);
  const logoutData = JSON.parse(logoutRes.getContent());
  assert(logoutData.success, 'Logout must succeed');

  // Verify Users sheet has is_logged_in = false
  const user = Sheets.findByKey('Users', 'user_id', sellerUserId);
  assert(user.is_logged_in === false, 'user.is_logged_in must be false upon logout');

  // Verify Ads sheet status remains APPROVED (NEVER changed to INACTIVE or LOGGED_OUT)
  const adInSheet = Sheets.findByKey('Ads', 'ad_id', sellerApprovedAdId);
  assert(adInSheet.status === 'APPROVED', `Ad status MUST remain APPROVED in sheet, got: ${adInSheet.status}`);

  // Query public ads as visitor (no token)
  const pubReq = { postData: { contents: JSON.stringify({ action: 'ads' }) } };
  const pubRes = Router.handle(pubReq, 'POST');
  const pubData = JSON.parse(pubRes.getContent());

  assert(pubData.success, 'Public ads query must succeed');
  const found = pubData.data.ads.find(a => a.ad_id === sellerApprovedAdId);
  assert(!found, 'Ad MUST NOT appear in public listing once seller has logged out');
});

// --------------------------------------------------------------------------
// Scenario 3: Direct request to ad detail after logout -> 404 NOT_FOUND
// --------------------------------------------------------------------------
runScenario('Direct request to ad detail after logout -> 404 NOT_FOUND', () => {
  // Visitor tries to open /ad/:id directly
  const reqVisitor = {
    postData: {
      contents: JSON.stringify({
        action: 'ad',
        ad_id: sellerApprovedAdId
      })
    }
  };
  const resVisitor = Router.handle(reqVisitor, 'POST');
  const dataVisitor = JSON.parse(resVisitor.getContent());

  assert(!dataVisitor.success, 'Logged-out seller ad must not be returned via direct detail query');
  assert(dataVisitor.statusCode === 404, `Expected HTTP 404, got ${dataVisitor.statusCode}`);
  assert(dataVisitor.error.code === 'NOT_FOUND', `Expected NOT_FOUND code, got ${dataVisitor.error.code}`);
});

// --------------------------------------------------------------------------
// Scenario 4: Seller logs in again -> ad becomes visible again
// --------------------------------------------------------------------------
runScenario('Seller logs in again -> ad becomes visible again', () => {
  // Seller logs in again
  const loginRes = AuthService.login({ email: sellerEmail, password: 'SecurePassword123!' });
  const loginData = JSON.parse(loginRes.getContent());
  assert(loginData.success, 'Seller re-login must succeed');
  sellerToken = loginData.data.token;

  // Verify Users sheet has is_logged_in = true
  const user = Sheets.findByKey('Users', 'user_id', sellerUserId);
  assert(user.is_logged_in === true, 'user.is_logged_in must be true upon re-login');

  // Query public ads as visitor
  const pubReq = { postData: { contents: JSON.stringify({ action: 'ads' }) } };
  const pubRes = Router.handle(pubReq, 'POST');
  const pubData = JSON.parse(pubRes.getContent());

  const found = pubData.data.ads.find(a => a.ad_id === sellerApprovedAdId);
  assert(found, 'Ad must immediately reappear in public listing upon seller re-login');

  // Direct detail query as visitor now succeeds
  const reqVisitor = { postData: { contents: JSON.stringify({ action: 'ad', ad_id: sellerApprovedAdId }) } };
  const resVisitor = Router.handle(reqVisitor, 'POST');
  const dataVisitor = JSON.parse(resVisitor.getContent());
  assert(dataVisitor.success, 'Direct ad detail query must succeed once seller is logged in');
  assert(dataVisitor.data.ad.ad_id === sellerApprovedAdId, 'Ad details returned');
});

// --------------------------------------------------------------------------
// Scenario 5: Seller logs out -> sponsored ad disappears from sponsored section
// --------------------------------------------------------------------------
runScenario('Seller logs out -> sponsored ad disappears from sponsored section', () => {
  // Assign membership and sponsor the ad
  Sheets.update('Users', 'user_id', sellerUserId, { membership_status: 'PREMIUM_MONTHLY' });
  const sponAd = Sheets.insert('Ads', {
    ad_id: Sheets.generateId('ad'),
    user_id: sellerUserId,
    title: 'Featured Premium Studio Apartment',
    category: 'Real Estate',
    description: 'Prime location studio apartment with luxury amenities.',
    location: 'Bangalore, KA',
    contact_preference: 'PHONE',
    status: 'APPROVED',
    is_sponsored: true,
    sponsored_until: new Date(Date.now() + 14 * 86400000).toISOString(),
    approved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });
  sellerSponsoredAdId = sponAd.ad_id;

  // Verify visible while seller is logged in
  const checkReq = { postData: { contents: JSON.stringify({ action: 'ads', sort: 'sponsored_first' }) } };
  const checkData = JSON.parse(Router.handle(checkReq, 'POST').getContent());
  assert(checkData.data.ads.some(a => a.ad_id === sellerSponsoredAdId && a.is_sponsored === true), 'Sponsored ad must be visible while logged in');

  // Seller logs out
  AuthService.logout(sellerToken);

  // Check public feed
  const postLogoutData = JSON.parse(Router.handle(checkReq, 'POST').getContent());
  const found = postLogoutData.data.ads.find(a => a.ad_id === sellerSponsoredAdId);
  assert(!found, 'Sponsored ad MUST NOT appear in feed or sponsored section when seller is logged out');
});

// --------------------------------------------------------------------------
// Scenario 6: Seller logs in again -> sponsored ad returns to sponsored ranking
// --------------------------------------------------------------------------
runScenario('Seller logs in again -> sponsored ad returns to sponsored ranking', () => {
  // Seller re-logs in
  const loginRes = AuthService.login({ email: sellerEmail, password: 'SecurePassword123!' });
  sellerToken = JSON.parse(loginRes.getContent()).data.token;

  // Check public feed
  const checkReq = { postData: { contents: JSON.stringify({ action: 'ads', sort: 'sponsored_first' }) } };
  const data = JSON.parse(Router.handle(checkReq, 'POST').getContent());

  const found = data.data.ads.find(a => a.ad_id === sellerSponsoredAdId);
  assert(found, 'Sponsored ad must reappear when seller logs back in');
  assert(found.is_sponsored === true, 'Sponsored flag must be preserved and active');
});

// --------------------------------------------------------------------------
// Scenario 7: Seller has PENDING ad + logs in -> remains invisible
// --------------------------------------------------------------------------
runScenario('Seller has PENDING ad + logs in -> remains invisible', () => {
  const pendingAd = Sheets.insert('Ads', {
    ad_id: Sheets.generateId('ad'),
    user_id: sellerUserId,
    title: 'Pending Review Vehicle Listing',
    category: 'Vehicles',
    description: 'Well maintained sedan with low mileage.',
    location: 'Delhi, DL',
    contact_preference: 'EMAIL',
    status: 'PENDING',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });

  // Query public ads as visitor
  const pubReq = { postData: { contents: JSON.stringify({ action: 'ads' }) } };
  const pubData = JSON.parse(Router.handle(pubReq, 'POST').getContent());
  assert(!pubData.data.ads.some(a => a.ad_id === pendingAd.ad_id), 'PENDING ad must never appear in public feed');

  // Direct detail query as visitor
  const detailReq = { postData: { contents: JSON.stringify({ action: 'ad', ad_id: pendingAd.ad_id }) } };
  const detailData = JSON.parse(Router.handle(detailReq, 'POST').getContent());
  assert(!detailData.success && detailData.statusCode === 404, 'PENDING ad direct lookup must return 404');
});

// --------------------------------------------------------------------------
// Scenario 8: Seller has REJECTED ad + logs in -> remains invisible
// --------------------------------------------------------------------------
runScenario('Seller has REJECTED ad + logs in -> remains invisible', () => {
  const rejectedAd = Sheets.insert('Ads', {
    ad_id: Sheets.generateId('ad'),
    user_id: sellerUserId,
    title: 'Rejected Prohibited Material',
    category: 'Services',
    description: 'Prohibited listing description content.',
    location: 'Chennai, TN',
    contact_preference: 'EMAIL',
    status: 'REJECTED',
    rejection_reason: 'Policy violation',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });

  const pubReq = { postData: { contents: JSON.stringify({ action: 'ads' }) } };
  const pubData = JSON.parse(Router.handle(pubReq, 'POST').getContent());
  assert(!pubData.data.ads.some(a => a.ad_id === rejectedAd.ad_id), 'REJECTED ad must never appear in public feed');

  const detailReq = { postData: { contents: JSON.stringify({ action: 'ad', ad_id: rejectedAd.ad_id }) } };
  const detailData = JSON.parse(Router.handle(detailReq, 'POST').getContent());
  assert(!detailData.success && detailData.statusCode === 404, 'REJECTED ad direct lookup must return 404');
});

// --------------------------------------------------------------------------
// Scenario 9: Seller has HIDDEN ad + logs in -> remains invisible
// --------------------------------------------------------------------------
runScenario('Seller has HIDDEN ad + logs in -> remains invisible', () => {
  const hiddenAd = Sheets.insert('Ads', {
    ad_id: Sheets.generateId('ad'),
    user_id: sellerUserId,
    title: 'User Paused Hidden Ad',
    category: 'Services',
    description: 'Temporarily hidden listing paused by seller.',
    location: 'Pune, MH',
    contact_preference: 'PHONE',
    status: 'HIDDEN',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });

  const pubReq = { postData: { contents: JSON.stringify({ action: 'ads' }) } };
  const pubData = JSON.parse(Router.handle(pubReq, 'POST').getContent());
  assert(!pubData.data.ads.some(a => a.ad_id === hiddenAd.ad_id), 'HIDDEN ad must never appear in public feed');

  const detailReq = { postData: { contents: JSON.stringify({ action: 'ad', ad_id: hiddenAd.ad_id }) } };
  const detailData = JSON.parse(Router.handle(detailReq, 'POST').getContent());
  assert(!detailData.success && detailData.statusCode === 404, 'HIDDEN ad direct lookup must return 404');
});

// --------------------------------------------------------------------------
// Scenario 10: Seller has EXPIRED ad + logs in -> remains invisible
// --------------------------------------------------------------------------
runScenario('Seller has EXPIRED ad + logs in -> remains invisible', () => {
  const expiredAd = Sheets.insert('Ads', {
    ad_id: Sheets.generateId('ad'),
    user_id: sellerUserId,
    title: 'Past Expired Item Listing',
    category: 'Buy & Sell',
    description: 'This advertisement has expired 10 days ago.',
    location: 'Kolkata, WB',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: false,
    approved_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    expires_at: new Date(Date.now() - 10 * 86400000).toISOString() // in the past
  });

  const pubReq = { postData: { contents: JSON.stringify({ action: 'ads' }) } };
  const pubData = JSON.parse(Router.handle(pubReq, 'POST').getContent());
  assert(!pubData.data.ads.some(a => a.ad_id === expiredAd.ad_id), 'EXPIRED ad must never appear in public feed');

  const detailReq = { postData: { contents: JSON.stringify({ action: 'ad', ad_id: expiredAd.ad_id }) } };
  const detailData = JSON.parse(Router.handle(detailReq, 'POST').getContent());
  assert(!detailData.success && detailData.statusCode === 404, 'EXPIRED ad direct lookup must return 404');
});

// --------------------------------------------------------------------------
// Scenario 11: Admin views seller's ads -> admin can see/manage them regardless of seller login state
// --------------------------------------------------------------------------
runScenario('Admin views seller\'s ads -> admin can see and manage them regardless of seller login state', () => {
  // Seller logs out first
  AuthService.logout(sellerToken);

  // Admin looks up the ad directly via 'ad' action
  const adminAdReq = {
    postData: {
      contents: JSON.stringify({
        action: 'ad',
        ad_id: sellerApprovedAdId,
        token: adminToken
      })
    }
  };
  const adminAdData = JSON.parse(Router.handle(adminAdReq, 'POST').getContent());
  assert(adminAdData.success, 'Admin must be able to view ad details even if seller is logged out');
  assert(adminAdData.data.ad.ad_id === sellerApprovedAdId, 'Ad returned to admin');

  // Admin can edit the ad
  const adminEditReq = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/edit-ad',
        ad_id: sellerApprovedAdId,
        title: 'Admin Revised Photography Gear',
        category: 'Electronics',
        description: 'High end camera gear revised by administrator for clarity.',
        location: 'Mumbai, MH',
        contact_preference: 'BOTH',
        token: adminToken
      })
    }
  };
  const adminEditData = JSON.parse(Router.handle(adminEditReq, 'POST').getContent());
  assert(adminEditData.success, 'Admin must be able to manage/edit ad while seller is logged out');
});

// --------------------------------------------------------------------------
// Scenario 12: Browser tries to manipulate login state manually -> backend ignores it
// --------------------------------------------------------------------------
runScenario('Browser tries to manipulate login state manually -> backend ignores it and verifies server-side session', () => {
  // Attacker tries to pass fake is_logged_in, seller_logged_in, or spoofed session token
  const spoofReq = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        is_logged_in: true,
        seller_logged_in: true,
        user_id: sellerUserId,
        token: 'fake-invalid-or-forged-token'
      })
    }
  };
  const spoofData = JSON.parse(Router.handle(spoofReq, 'POST').getContent());
  assert(spoofData.success, 'Query completes');
  // Since seller is logged out, ad must NOT be returned despite client-sent flags
  const found = spoofData.data.ads.find(a => a.ad_id === sellerApprovedAdId);
  assert(!found, 'Spoofed client flags MUST be ignored; backend strictly verifies server-side Sessions sheet');
});

// --------------------------------------------------------------------------
// Scenario 13: Check browser Network/API responses -> logged-out seller's ads not returned in payload
// --------------------------------------------------------------------------
runScenario('API responses -> logged-out seller\'s ads are completely absent from returned payload', () => {
  // Confirm seller is logged out
  const user = Sheets.findByKey('Users', 'user_id', sellerUserId);
  assert(user.is_logged_in === false, 'Seller must be logged out');

  // Request ads list with full search, category, and location options
  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        search: 'photography',
        category: 'Electronics',
        location: 'Mumbai'
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const rawBody = res.getContent();

  // Assert neither ad_id nor seller_id appears in the raw response body
  assert(!rawBody.includes(sellerApprovedAdId), 'Response body MUST NOT contain logged-out ad ID');
  assert(!rawBody.includes(sellerUserId), 'Response body MUST NOT leak logged-out seller user ID');
});

console.log('-------------------------------------------------------------');
console.log(`  Results: ${passedTests} of ${totalTests} test cases passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('-------------------------------------------------------------\n');

if (passedTests === totalTests) {
  console.log('✔ ALL 13 SELLER LOGIN-BASED VISIBILITY TEST CASES PASSED SUCCESSFULLY.\n');
  process.exit(0);
} else {
  console.error('✖ SOME TEST CASES FAILED.\n');
  process.exit(1);
}
