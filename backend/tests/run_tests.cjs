/**
 * FreeAds Post - CLI Automated Test Runner for Node.js
 * 
 * Tests the exact backend auth logic against all 7 test cases.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. In-Memory Mock Google Sheets Database
const memorySheets = {
  Users: [],
  Ads: [],
  Memberships: [],
  EmailVerification: [],
  Admins: [],
  ActivityLog: [],
  Settings: []
};

// 2. Mock Google Apps Script Global Environment
global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  computeDigest: function(algo, text) {
    const hash = crypto.createHash('sha256').update(text, 'utf8').digest();
    // Return array of signed 8-bit integers (-128 to 127) to match GAS behavior
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

global.MailApp = {
  sentEmails: [],
  sendEmail: function(options) {
    global.MailApp.sentEmails.push(options);
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

global.Logger = {
  log: function(...args) { console.log(...args); }
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

const vm = require('vm');
filesToLoad.forEach(f => {
  let content = fs.readFileSync(path.join(gasDir, f), 'utf8');
  content = content.replace(/^const (\w+)\s*=/gm, 'global.$1 =');
  vm.runInThisContext(content);
});

// 4. Test Suite Execution
console.log('\n======================================================');
console.log('  FreeAds Post - Registration & Verification Tests    ');
console.log('======================================================\n');

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

function makeSellerLoggedIn(userId, email = `${userId}@example.com`, name = 'Active Test Seller') {
  let user = Sheets.findByKey('Users', 'user_id', userId);
  if (!user) {
    Sheets.insert('Users', {
      user_id: userId,
      name: name,
      email: email,
      phone: '+15551234567',
      company_name: '',
      password_hash: 'hash:salt',
      email_verified: true,
      account_status: 'ACTIVE',
      role: 'USER',
      membership_status: 'FREE',
      last_login: new Date().toISOString(),
      is_logged_in: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } else {
    Sheets.update('Users', 'user_id', userId, {
      account_status: 'ACTIVE',
      is_logged_in: true,
      last_login: new Date().toISOString()
    });
  }
  const existingSession = Sheets.findOne('Sessions', s => s.user_id === userId);
  if (!existingSession) {
    Sheets.insert('Sessions', {
      session_id: `sess_${userId}_${Date.now()}`,
      token_hash: `token_hash_${userId}`,
      user_id: userId,
      role: 'USER',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString()
    });
  }
}

const uniqueEmail = `test_${Date.now()}@example.com`;
let generatedRawToken = null;

// Test 1: Invalid email format
runTest('Test Invalid Email: Rejects malformed email address', () => {
  const res = AuthService.register({
    name: 'Invalid Email User',
    email: 'not-an-email',
    phone: '+15551234567',
    password: 'SecurePassword123'
  });
  const data = JSON.parse(res.getContent());
  assert(!data.success, 'Should not succeed');
  assert(data.error.code === 'INVALID_EMAIL', `Expected INVALID_EMAIL, got ${data.error.code}`);
});

// Test 2: Weak password
runTest('Test Weak Password: Rejects password under 8 characters or missing numbers/letters', () => {
  const res = AuthService.register({
    name: 'Weak Pass User',
    email: 'weak@example.com',
    phone: '+15551234567',
    password: 'short'
  });
  const data = JSON.parse(res.getContent());
  assert(!data.success, 'Should not succeed');
  assert(data.error.code === 'WEAK_PASSWORD', `Expected WEAK_PASSWORD, got ${data.error.code}`);

  // Test missing number
  const resNoNum = AuthService.register({
    name: 'No Number User',
    email: 'nonum@example.com',
    phone: '+15551234567',
    password: 'OnlyLettersPassword'
  });
  const dataNoNum = JSON.parse(resNoNum.getContent());
  assert(!dataNoNum.success, 'Should fail without numbers');
  assert(dataNoNum.error.code === 'WEAK_PASSWORD', 'Expected WEAK_PASSWORD');
});

// Test 3: Successful registration
runTest('Test Successful Registration: Creates user with email_verified=false and hashes password', () => {
  const res = AuthService.register({
    name: 'Jane Doe',
    email: uniqueEmail,
    phone: '+1 555-0199',
    company_name: 'Acme Classifieds',
    password: 'Password123!'
  });
  const data = JSON.parse(res.getContent());

  assert(data.success, `Expected success, got error: ${data.error?.message}`);
  assert(data.statusCode === 201, `Expected status 201, got ${data.statusCode}`);
  assert(data.data.user.email === uniqueEmail, 'User email matches');
  assert(data.data.user.email_verified === false, 'User email_verified should be false initially');
  assert(!data.data.user.password_hash, 'SECURITY CHECK: password_hash must NEVER be returned');

  // Verify in database
  const userInDb = Sheets.findByKey('Users', 'email', uniqueEmail);
  assert(userInDb, 'User record must exist in Users sheet');
  assert(userInDb.password_hash.includes(':'), 'Password hash must be salted format (hash:salt)');
  assert(!userInDb.password_hash.includes('Password123!'), 'Plain-text password must never be stored');
  assert(userInDb.account_status === 'ACTIVE', 'Account status should be ACTIVE');
  assert(userInDb.role === 'USER', 'Default role should be USER');

  // Verify verification token in database
  const tokenInDb = Sheets.findOne('EmailVerification', t => t.email === uniqueEmail);
  assert(tokenInDb, 'Token record must exist in EmailVerification sheet');
  assert(tokenInDb.used === false, 'Token used must be false');
  assert(tokenInDb.token_hash.length === 64, 'Token must be stored as 64-char SHA-256 hash');

  generatedRawToken = data.data.debugToken;
  assert(generatedRawToken, 'Debug token should be returned in test environment');
  assert(Auth.hashToken(generatedRawToken) === tokenInDb.token_hash, 'Hash of raw token must match stored token_hash');
});

// Test 4: Duplicate email rejection
runTest('Test Duplicate Email: Rejects registration with existing email', () => {
  const res = AuthService.register({
    name: 'Jane Clone',
    email: uniqueEmail, // Duplicate
    phone: '+1 555-0999',
    password: 'AnotherPassword456'
  });
  const data = JSON.parse(res.getContent());
  assert(!data.success, 'Duplicate registration must fail');
  assert(data.statusCode === 409, `Expected HTTP 409, got ${data.statusCode}`);
  assert(data.error.code === 'EMAIL_ALREADY_EXISTS', `Expected EMAIL_ALREADY_EXISTS, got ${data.error.code}`);
});

// Test 5: Expired verification token
runTest('Test Expired Token: Rejects token whose expires_at is in the past', () => {
  const expiredRawToken = 'expired_raw_token_xyz_' + Date.now();
  const expiredHash = Auth.hashToken(expiredRawToken);
  const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

  Sheets.insert('EmailVerification', {
    token_id: Sheets.generateId('tok'),
    user_id: 'usr_mock_expired',
    email: 'expired_user@example.com',
    token_hash: expiredHash,
    expires_at: pastDate,
    used: false,
    created_at: pastDate
  });

  const res = AuthService.verifyEmail(expiredRawToken);
  const data = JSON.parse(res.getContent());
  assert(!data.success, 'Expired token must not succeed');
  assert(data.error.code === 'TOKEN_EXPIRED', `Expected TOKEN_EXPIRED, got ${data.error.code}`);
});

// Test 6: Successful verification
runTest('Test Successful Verification: Activates user account and marks email_verified=true', () => {
  const res = AuthService.verifyEmail(generatedRawToken);
  const data = JSON.parse(res.getContent());

  assert(data.success, `Expected verification success, got: ${data.error?.message}`);
  assert(data.data.verified === true, 'Response verified flag must be true');

  // Verify in database
  const userInDb = Sheets.findByKey('Users', 'email', uniqueEmail);
  assert(userInDb.email_verified === true, 'User email_verified must now be true in database');

  const tokenInDb = Sheets.findOne('EmailVerification', t => t.email === uniqueEmail);
  assert(tokenInDb.used === true, 'Token must now be marked used=true');
});

// Test 7: Reused verification token
runTest('Test Reused Token: Rejects token that has already been used', () => {
  const res = AuthService.verifyEmail(generatedRawToken);
  const data = JSON.parse(res.getContent());

  assert(!data.success, 'Reusing token must fail');
  assert(data.error.code === 'TOKEN_ALREADY_USED', `Expected TOKEN_ALREADY_USED, got ${data.error.code}`);
});

// Test 8: Unverified login
runTest('Test Unverified Login: Rejects login attempt before email is verified', () => {
  const unverifiedEmail = `unverified_${Date.now()}@example.com`;
  AuthService.register({
    name: 'Unverified User',
    email: unverifiedEmail,
    phone: '+1 555-0188',
    password: 'Password123!'
  });

  const res = AuthService.login({
    email: unverifiedEmail,
    password: 'Password123!'
  });
  const data = JSON.parse(res.getContent());
  assert(!data.success, 'Login for unverified account must fail');
  assert(data.statusCode === 403, `Expected HTTP 403, got ${data.statusCode}`);
  assert(data.error.code === 'EMAIL_NOT_VERIFIED', `Expected EMAIL_NOT_VERIFIED, got ${data.error.code}`);
  assert(!data.data, 'No session token must be issued for unverified user');
});

// Test 9: Wrong password & email enumeration defense
runTest('Test Wrong Password: Returns generic error for wrong password or non-existent email', () => {
  // 1. Existing user with wrong password
  const resWrongPass = AuthService.login({
    email: uniqueEmail,
    password: 'WrongPassword999!'
  });
  const dataWrongPass = JSON.parse(resWrongPass.getContent());
  assert(!dataWrongPass.success, 'Wrong password must fail');
  assert(dataWrongPass.statusCode === 401, 'Expected HTTP 401');
  assert(dataWrongPass.error.code === 'INVALID_CREDENTIALS', 'Expected INVALID_CREDENTIALS');

  // 2. Non-existent user
  const resNonExistent = AuthService.login({
    email: 'nonexistent_user_999@example.com',
    password: 'SomePassword123!'
  });
  const dataNonExistent = JSON.parse(resNonExistent.getContent());
  assert(!dataNonExistent.success, 'Non-existent user must fail');
  assert(dataNonExistent.statusCode === 401, 'Expected HTTP 401');
  assert(dataNonExistent.error.code === 'INVALID_CREDENTIALS', 'Expected INVALID_CREDENTIALS');

  // 3. Exact message match (defends against email enumeration)
  assert(
    dataWrongPass.error.message === dataNonExistent.error.message,
    'Error message must be identical for wrong password and non-existent email to prevent enumeration'
  );
});

let activeSessionToken = null;

// Test 10: Valid login
runTest('Test Valid Login: Issues secure session token and updates last_login timestamp', () => {
  const userBefore = Sheets.findByKey('Users', 'email', uniqueEmail);
  const initialLastLogin = userBefore.last_login;

  const res = AuthService.login({
    email: uniqueEmail,
    password: 'Password123!'
  });
  const data = JSON.parse(res.getContent());

  assert(data.success, `Login failed: ${data.error?.message}`);
  assert(data.statusCode === 200, `Expected HTTP 200, got ${data.statusCode}`);
  assert(data.data.token, 'Must return session token');
  assert(data.data.token.length === 64, 'Session token must be 64 characters');
  assert(!data.data.user.password_hash, 'SECURITY CHECK: password_hash must NEVER be returned');

  activeSessionToken = data.data.token;

  // Verify in database: session recorded
  const tokenHash = Auth.hashToken(activeSessionToken);
  const sessionRecord = Sheets.findOne('Sessions', s => s.token_hash === tokenHash);
  assert(sessionRecord !== null, 'Session must be stored in Sessions sheet');
  assert(sessionRecord.user_id === userBefore.user_id, 'Session user_id must match');
  assert(new Date(sessionRecord.expires_at) > new Date(), 'Session expires_at must be in the future');

  // Verify in database: last_login updated
  const userAfter = Sheets.findByKey('Users', 'email', uniqueEmail);
  assert(userAfter.last_login !== initialLastLogin, 'last_login must be updated in Users sheet');
  assert(userAfter.last_login.length > 10, 'last_login must be a valid ISO string');
});

// Test 11: Logout
runTest('Test Logout: Invalidates session token in database', () => {
  assert(activeSessionToken, 'Must have active session token');
  const user = Sheets.findByKey('Users', 'email', uniqueEmail);

  // Call logout
  const resLogout = AuthService.logout(activeSessionToken, user.user_id);
  const dataLogout = JSON.parse(resLogout.getContent());
  assert(dataLogout.success, 'Logout must succeed');

  // Verify session removed from Sessions sheet
  const tokenHash = Auth.hashToken(activeSessionToken);
  const sessionAfter = Sheets.findOne('Sessions', s => s.token_hash === tokenHash);
  assert(sessionAfter === null, 'Session record must be removed from Sessions sheet on logout');

  // Verify subsequent API request with logged out token is rejected
  const reqWithLoggedOutToken = {
    postData: {
      contents: JSON.stringify({ action: 'current-user', token: activeSessionToken })
    }
  };
  const resProtected = Router.handle(reqWithLoggedOutToken, 'POST');
  const dataProtected = JSON.parse(resProtected.getContent());
  assert(!dataProtected.success, 'Logged-out token must be rejected');
  assert(dataProtected.statusCode === 401, 'Expected HTTP 401 UNAUTHORIZED');
});

// Test 12: Expired session
runTest('Test Expired Session: Rejects expired session token and cleans up record', () => {
  const expiredSessionToken = 'expired_session_' + Utilities.getUuid();
  const tokenHash = Auth.hashToken(expiredSessionToken);
  const user = Sheets.findByKey('Users', 'email', uniqueEmail);
  const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

  Sheets.insert('Sessions', {
    session_id: Sheets.generateId('ses'),
    token_hash: tokenHash,
    user_id: user.user_id,
    role: user.role,
    expires_at: pastDate,
    created_at: pastDate
  });

  const req = {
    postData: {
      contents: JSON.stringify({ action: 'current-user', token: expiredSessionToken })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(!data.success, 'Expired session must fail');
  assert(data.statusCode === 401, `Expected HTTP 401, got ${data.statusCode}`);
  assert(data.error.code === 'SESSION_EXPIRED', `Expected SESSION_EXPIRED, got ${data.error.code}`);
});

// Test 13: Unauthorized API request
runTest('Test Unauthorized API Request: Rejects missing tokens and enforces admin authorization', () => {
  // 1. Missing token on protected endpoint
  const reqNoToken = {
    postData: {
      contents: JSON.stringify({ action: 'current-user' })
    }
  };
  const resNoToken = Router.handle(reqNoToken, 'POST');
  const dataNoToken = JSON.parse(resNoToken.getContent());
  assert(!dataNoToken.success, 'Request without token must fail');
  assert(dataNoToken.statusCode === 401, 'Expected HTTP 401 UNAUTHORIZED');
  assert(dataNoToken.error.code === 'UNAUTHORIZED', 'Expected UNAUTHORIZED');

  // 2. Regular user token attempting admin action
  // Log in regular user to get fresh token
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const regUserToken = JSON.parse(resLogin.getContent()).data.token;

  const reqAdminAction = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/approve-ad',
        token: regUserToken,
        ad_id: 'ad_mock_123'
      })
    }
  };
  const resAdminAction = Router.handle(reqAdminAction, 'POST');
  const dataAdminAction = JSON.parse(resAdminAction.getContent());
  assert(!dataAdminAction.success, 'Regular user must not access admin action');
  assert(dataAdminAction.statusCode === 403, `Expected HTTP 403, got ${dataAdminAction.statusCode}`);
  assert(dataAdminAction.error.code === 'FORBIDDEN', `Expected FORBIDDEN, got ${dataAdminAction.error.code}`);
});

// Test 14: Protected page access & Admin authorization
runTest('Test Protected Access: Authenticated user accesses profile; Admin accesses admin endpoint', () => {
  // 1. Regular user accessing current-user
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;

  const reqUser = {
    postData: {
      contents: JSON.stringify({ action: 'current-user', token: userToken })
    }
  };
  const resUser = Router.handle(reqUser, 'POST');
  const dataUser = JSON.parse(resUser.getContent());
  assert(dataUser.success, 'Authenticated user can access current-user profile');
  assert(dataUser.data.email === uniqueEmail, 'Profile email matches');
  assert(!dataUser.data.password_hash, 'Password hash is not exposed');

  // 2. Admin user accessing admin endpoint
  const adminEmail = `admin_${Date.now()}@example.com`;
  scriptProps.INITIAL_ADMIN_EMAIL = adminEmail;

  AuthService.register({
    name: 'Super Admin',
    email: adminEmail,
    phone: '+1 555-0100',
    password: 'AdminPassword123!'
  });

  // Verify admin email
  const adminTokenRecord = Sheets.findOne('EmailVerification', t => t.email === adminEmail);
  Sheets.update('Users', 'email', adminEmail, { email_verified: true });

  const resAdminLogin = AuthService.login({ email: adminEmail, password: 'AdminPassword123!' });
  const adminToken = JSON.parse(resAdminLogin.getContent()).data.token;

  // Insert mock pending ad for approval
  memorySheets['Ads'].push({
    ad_id: 'ad_mock_999',
    user_id: 'usr_test',
    title: 'Ad for Admin Approval Test',
    status: 'PENDING'
  });

  const reqAdmin = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/approve-ad',
        token: adminToken,
        ad_id: 'ad_mock_999'
      })
    }
  };
  const resAdmin = Router.handle(reqAdmin, 'POST');
  const dataAdmin = JSON.parse(resAdmin.getContent());
  assert(dataAdmin.success, `Admin action should succeed: ${dataAdmin.error?.message}`);
  assert(dataAdmin.data.ad?.status === 'APPROVED' || dataAdmin.data.status === 'APPROVED', 'Ad approved by admin');
});

// Test 15: Create ad validation - Missing required fields
runTest('Test Create Ad: Rejects missing required fields', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  // Missing description & location
  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'create-ad',
        token: token,
        title: 'Valid Ad Title',
        category: 'Services'
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());
  assert(!data.success, 'Should fail with missing fields');
  assert(data.statusCode === 400, 'Expected HTTP 400');
  assert(data.error.code === 'VALIDATION_ERROR', 'Expected VALIDATION_ERROR');
});

// Test 16: Create ad validation - Rejects dangerous and malformed image URLs
runTest('Test Create Ad Image URL Security: Rejects javascript:, data:, and invalid schemes', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const dangerousUrls = [
    'javascript:alert(1)',
    'JAVASCRIPT:document.cookie',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    'file:///etc/passwd',
    'ftp://example.com/bad.png',
    'ht!tp://broken_url'
  ];

  dangerousUrls.forEach(badUrl => {
    const req = {
      postData: {
        contents: JSON.stringify({
          action: 'create-ad',
          token: token,
          title: 'Testing Security URL',
          category: 'Services',
          description: 'This is a long enough test description for security validation.',
          location: 'San Francisco, CA',
          contact_preference: 'EMAIL',
          image_url: badUrl
        })
      }
    };
    const res = Router.handle(req, 'POST');
    const data = JSON.parse(res.getContent());
    assert(!data.success, `Dangerous image URL '${badUrl}' must be rejected`);
    assert(data.error.code === 'INVALID_IMAGE_URL', `Expected INVALID_IMAGE_URL for '${badUrl}', got ${data.error.code}`);
  });
});

let createdAdId = null;

// Test 17: Create ad success - Sets status PENDING and records in Google Sheets
runTest('Test Create Ad Success: Creates ad with status PENDING and logs activity', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const validExternalImageUrl = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809';

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'create-ad',
        token: token,
        title: 'Professional Web Development',
        category: 'Services',
        description: 'High-quality React and Node development services for small businesses.',
        location: 'New York, NY',
        contact_preference: 'BOTH',
        image_url: validExternalImageUrl
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, `Ad creation should succeed: ${data.error?.message}`);
  assert(data.statusCode === 201, `Expected HTTP 201, got ${data.statusCode}`);
  assert(data.data.ad.status === 'PENDING', 'CRITICAL: Ad status must be PENDING');
  assert(data.data.ad.title === 'Professional Web Development', 'Ad title matches');
  assert(data.data.ad.image_url === validExternalImageUrl, 'External image URL matches');
  assert(
    data.message === 'Your advertisement has been submitted and is awaiting admin approval.',
    'Confirmation message matches required text'
  );

  createdAdId = data.data.ad.ad_id;

  // Verify in database: Ads sheet
  const adInDb = Sheets.findByKey('Ads', 'ad_id', createdAdId);
  assert(adInDb !== null, 'Ad must exist in Ads sheet');
  assert(adInDb.status === 'PENDING', 'Ad in database must have status PENDING');
  assert(adInDb.approved_at === '', 'approved_at must be empty initially');

  // Verify in database: ActivityLog sheet
  const logInDb = Sheets.findOne('ActivityLog', l => l.entity_id === createdAdId && l.action === 'AD_CREATE');
  assert(logInDb !== null, 'ActivityLog must record AD_CREATE event');
});

// Test 18: Create ad with optional empty image URL
runTest('Test Create Ad Optional Image: Successfully creates ad without an image URL', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'create-ad',
        token: token,
        title: 'Local Math Tutoring Lessons',
        category: 'Services',
        description: 'Experienced certified high school mathematics tutor available for private lessons.',
        location: 'Boston, MA',
        contact_preference: 'PHONE',
        image_url: '' // Empty optional
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, `Ad creation without image should succeed: ${data.error?.message}`);
  assert(data.data.ad.status === 'PENDING', 'Status must be PENDING');
  assert(data.data.ad.image_url === '', 'Image URL should be empty string');
});

// Test 19: Dashboard summary counts reflect pending ads
runTest('Test Dashboard Summary: Correctly calculates user pending ad counts', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'dashboard-summary',
        token: token
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Dashboard summary query should succeed');
  assert(data.data.counts.total >= 2, `Expected at least 2 total ads, got ${data.data.counts.total}`);
  assert(data.data.counts.pending >= 2, `Expected at least 2 pending ads, got ${data.data.counts.pending}`);
  assert(data.data.counts.approved === 0, 'No approved ads yet');
});

// Test 20: User isolation in my-ads
runTest('Test My Ads User Isolation: Shows only advertisements belonging to the authenticated user', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  // Create a second user
  const otherEmail = `other_user_${Date.now()}@example.com`;
  const resReg = AuthService.register({
    name: 'Other User',
    email: otherEmail,
    phone: '+15559876543',
    password: 'Password123!'
  });
  const otherDebugToken = JSON.parse(resReg.getContent()).data.debugToken;
  AuthService.verifyEmail(otherDebugToken);
  const otherLogin = AuthService.login({ email: otherEmail, password: 'Password123!' });
  const otherToken = JSON.parse(otherLogin.getContent()).data.token;

  // Other user creates an ad
  const createOtherReq = {
    postData: {
      contents: JSON.stringify({
        action: 'create-ad',
        token: otherToken,
        title: 'Other User Car for Sale',
        category: 'Vehicles',
        description: '2020 Honda Civic in immaculate condition with low mileage.',
        location: 'Chicago, IL',
        contact_preference: 'EMAIL'
      })
    }
  };
  Router.handle(createOtherReq, 'POST');

  // Query primary user's my-ads
  const myAdsReq = {
    postData: {
      contents: JSON.stringify({
        action: 'my-ads',
        token: token
      })
    }
  };
  const res = Router.handle(myAdsReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'my-ads query should succeed');
  assert(Array.isArray(data.data.ads), 'data.ads should be an array');
  // All returned ads must belong to primary user
  const nonOwned = data.data.ads.filter(a => a.title.includes('Other User'));
  assert(nonOwned.length === 0, 'my-ads should never return another user\'s ads');
});

// Test 21: Server-side authorization prevents editing another user's ad
runTest('Test Prevent Edit Other User Ad: Rejects with 403 Forbidden server-side', () => {
  // Find other user's ad
  const otherAd = memorySheets['Ads'].find(a => a.title.includes('Other User'));
  assert(otherAd, 'Other user ad must exist in sheet');

  // Primary user tries to update other user's ad
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const updateReq = {
    postData: {
      contents: JSON.stringify({
        action: 'update-ad',
        token: token,
        ad_id: otherAd.ad_id,
        title: 'Hacked Title By Attacker',
        category: 'Vehicles',
        description: 'Unauthorized update attempt should be blocked completely.',
        location: 'Nowhere',
        contact_preference: 'EMAIL'
      })
    }
  };
  const res = Router.handle(updateReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(!data.success, 'Editing another user\'s ad must fail');
  assert(data.statusCode === 403 || data.error?.code === 'FORBIDDEN', 'Must return 403 FORBIDDEN');
});

// Test 22: Anti-Self-Approval & Anti-Self-Sponsoring
runTest('Test Anti-Self-Approval: User cannot approve own ad or force status to APPROVED', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const ownAd = memorySheets['Ads'].find(a => a.title.includes('Local Math Tutoring'));
  assert(ownAd, 'Own ad must exist');

  // User maliciously sends status: 'APPROVED' and is_sponsored: true
  const updateReq = {
    postData: {
      contents: JSON.stringify({
        action: 'update-ad',
        token: token,
        ad_id: ownAd.ad_id,
        title: 'Updated Math Tutoring Lessons',
        category: 'Services',
        description: 'Updated description for certified mathematics tutoring lessons.',
        location: 'Boston, MA',
        contact_preference: 'BOTH',
        status: 'APPROVED', // Malicious attempt to self-approve
        is_sponsored: true  // Malicious attempt to self-sponsor
      })
    }
  };
  const res = Router.handle(updateReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Update should succeed');
  assert(data.data.ad.status === 'PENDING', `Status must be forced to PENDING, got ${data.data.ad.status}`);
  // Check in sheet as well
  const sheetAd = memorySheets['Ads'].find(a => a.ad_id === ownAd.ad_id);
  assert(sheetAd.status === 'PENDING', 'Database record status must be PENDING');
});

// Test 23: Successful ad update resets status to PENDING and clears rejection reason
runTest('Test Successful Ad Edit: Updates fields and logs AD_UPDATE in activity log', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const ownAd = memorySheets['Ads'].find(a => a.title.includes('Updated Math Tutoring'));
  ownAd.rejection_reason = 'Previous issues in description';

  const updateReq = {
    postData: {
      contents: JSON.stringify({
        action: 'update-ad',
        token: token,
        ad_id: ownAd.ad_id,
        title: 'Refined Math Tutoring Lessons',
        category: 'Services',
        description: 'Fully revised and detailed mathematics tutoring curriculum.',
        location: 'Cambridge, MA',
        contact_preference: 'EMAIL'
      })
    }
  };
  const res = Router.handle(updateReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Update must succeed');
  assert(data.data.ad.title === 'Refined Math Tutoring Lessons');
  assert(data.data.ad.status === 'PENDING');
  assert(data.data.ad.rejection_reason === '', 'Rejection reason must be cleared');

  // Verify activity log
  const log = memorySheets['ActivityLog'].find(l => l.action === 'AD_UPDATE' && l.entity_id === ownAd.ad_id);
  assert(log, 'AD_UPDATE activity log entry must be created');
});

// Test 24: Hide approved ad
runTest('Test Hide Approved Ad: Transitions APPROVED ad to HIDDEN', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  // Set an ad to APPROVED manually (simulating admin approval)
  const ownAd = memorySheets['Ads'].find(a => a.title.includes('Refined Math Tutoring'));
  ownAd.status = 'APPROVED';

  const hideReq = {
    postData: {
      contents: JSON.stringify({
        action: 'hide-ad',
        token: token,
        ad_id: ownAd.ad_id
      })
    }
  };
  const res = Router.handle(hideReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Hiding approved ad should succeed');
  assert(data.data.ad.status === 'HIDDEN', 'Status must transition to HIDDEN');
  assert(ownAd.status === 'HIDDEN', 'Database record must be HIDDEN');
});

// Test 25: Reject hiding non-approved ad
runTest('Test Reject Hiding Non-Approved Ad: Returns 400 INVALID_STATE', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  // Own ad is currently HIDDEN (not APPROVED)
  const ownAd = memorySheets['Ads'].find(a => a.status === 'HIDDEN');

  const hideReq = {
    postData: {
      contents: JSON.stringify({
        action: 'hide-ad',
        token: token,
        ad_id: ownAd.ad_id
      })
    }
  };
  const res = Router.handle(hideReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(!data.success, 'Hiding non-approved ad must fail');
  assert(data.error?.code === 'INVALID_STATE', 'Error code must be INVALID_STATE');
});

// Test 26: Resubmit rejected ad
runTest('Test Resubmit Rejected Ad: Transitions REJECTED ad back to PENDING', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  // Set ad to REJECTED
  const ownAd = memorySheets['Ads'].find(a => a.title.includes('Refined Math Tutoring'));
  ownAd.status = 'REJECTED';
  ownAd.rejection_reason = 'Needs additional verification';

  const resubmitReq = {
    postData: {
      contents: JSON.stringify({
        action: 'resubmit-ad',
        token: token,
        ad_id: ownAd.ad_id
      })
    }
  };
  const res = Router.handle(resubmitReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Resubmitting rejected ad should succeed');
  assert(data.data.ad.status === 'PENDING', 'Status must become PENDING');
  assert(data.data.ad.rejection_reason === '', 'Rejection reason must be cleared');
});

// Test 27: Delete own ad
runTest('Test Delete Ad: Transitions status to DELETED and logs AD_DELETE', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const ownAd = memorySheets['Ads'].find(a => a.title.includes('Refined Math Tutoring'));

  const deleteReq = {
    postData: {
      contents: JSON.stringify({
        action: 'delete-ad',
        token: token,
        ad_id: ownAd.ad_id
      })
    }
  };
  const res = Router.handle(deleteReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Deleting own ad should succeed');
  assert(data.data.status === 'DELETED');
  assert(ownAd.status === 'DELETED', 'Database status must be DELETED');

  // Verify activity log
  const log = memorySheets['ActivityLog'].find(l => l.action === 'AD_DELETE' && l.entity_id === ownAd.ad_id);
  assert(log, 'AD_DELETE activity log entry must be created');
});

// Test 28: Prevent deleting another user's ad
runTest('Test Prevent Delete Other User Ad: Rejects with 403 Forbidden', () => {
  const otherAd = memorySheets['Ads'].find(a => a.title.includes('Other User'));
  assert(otherAd, 'Other user ad must exist');

  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const deleteReq = {
    postData: {
      contents: JSON.stringify({
        action: 'delete-ad',
        token: token,
        ad_id: otherAd.ad_id
      })
    }
  };
  const res = Router.handle(deleteReq, 'POST');
  const data = JSON.parse(res.getContent());

  assert(!data.success, 'Deleting another user\'s ad must fail');
  assert(data.statusCode === 403 || data.error?.code === 'FORBIDDEN', 'Must return 403 FORBIDDEN');
});

// Test 29: Admin Verification via Admins Sheet
runTest('Test Admin Authorization: Rejects authenticated user not listed in Admins sheet with 403', () => {
  // Primary user is verified but NOT in Admins sheet
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/overview',
        token: token
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(!data.success, 'Non-admin must not access admin/overview');
  assert(data.statusCode === 403 || data.error?.code === 'FORBIDDEN', 'Must return 403 FORBIDDEN');
});

// Test 30: Inactive Admin Blocked
runTest('Test Inactive Admin Blocked: Rejects admin whose status is INACTIVE with 403', () => {
  const inactiveAdminEmail = `inactive_admin_${Date.now()}@example.com`;
  const resReg = AuthService.register({
    name: 'Inactive Admin',
    email: inactiveAdminEmail,
    phone: '+15551112233',
    password: 'Password123!'
  });
  const debugToken = JSON.parse(resReg.getContent()).data.debugToken;
  AuthService.verifyEmail(debugToken);

  // Add to Admins sheet as INACTIVE
  memorySheets['Admins'].push({
    admin_id: 'admin_inact_1',
    email: inactiveAdminEmail,
    role: 'ADMIN',
    status: 'INACTIVE',
    created_at: new Date().toISOString()
  });

  const resLogin = AuthService.login({ email: inactiveAdminEmail, password: 'Password123!' });
  const token = JSON.parse(resLogin.getContent()).data.token;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/overview',
        token: token
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(!data.success, 'Inactive admin must be blocked');
  assert(data.statusCode === 403 || data.error?.code === 'FORBIDDEN', 'Must return 403 FORBIDDEN');
});

// Test 31: Active Admin Authorized
let activeAdminToken = null;
const activeAdminEmail = `super_admin_${Date.now()}@example.com`;

runTest('Test Active Admin Authorized: User in Admins sheet with status=ACTIVE accesses admin/overview', () => {
  const resReg = AuthService.register({
    name: 'Chief Admin',
    email: activeAdminEmail,
    phone: '+15557778899',
    password: 'Password123!'
  });
  const debugToken = JSON.parse(resReg.getContent()).data.debugToken;
  AuthService.verifyEmail(debugToken);

  // Add to Admins sheet as ACTIVE
  memorySheets['Admins'].push({
    admin_id: 'admin_act_1',
    email: activeAdminEmail,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  });

  const resLogin = AuthService.login({ email: activeAdminEmail, password: 'Password123!' });
  activeAdminToken = JSON.parse(resLogin.getContent()).data.token;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/overview',
        token: activeAdminToken
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, `Active admin should access overview: ${data.error?.message}`);
  assert(data.data.stats, 'Overview must include platform statistics');
  assert(data.data.admin.email === activeAdminEmail, 'Must confirm active admin email');
});

// Test 32: 8 Dashboard Statistics
runTest('Test 8 Dashboard Statistics: Returns exact platform counts', () => {
  // Ensure we have some membership records
  memorySheets['Memberships'].push({
    membership_id: 'mem_1',
    user_id: 'user_1',
    plan: 'GOLD',
    start_date: new Date().toISOString(),
    expiry_date: new Date().toISOString(),
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  });

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/overview',
        token: activeAdminToken
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Overview query must succeed');
  const s = data.data.stats;

  assert(typeof s.total_users === 'number' && s.total_users > 0, 'total_users must be > 0');
  assert(typeof s.verified_users === 'number' && s.verified_users > 0, 'verified_users must be > 0');
  assert(typeof s.active_users === 'number' && s.active_users > 0, 'active_users must be > 0');
  assert(typeof s.pending_ads === 'number', 'pending_ads must be a number');
  assert(typeof s.approved_ads === 'number', 'approved_ads must be a number');
  assert(typeof s.rejected_ads === 'number', 'rejected_ads must be a number');
  assert(typeof s.sponsored_ads === 'number', 'sponsored_ads must be a number');
  assert(typeof s.active_memberships === 'number' && s.active_memberships >= 1, 'active_memberships must be >= 1');
});

// Test 33: Admin Approve Ad
runTest('Test Admin Approve Ad: Approves ad and logs ADMIN_APPROVE_AD', () => {
  // Find a pending ad
  const pendingAd = memorySheets['Ads'].find(a => a.status === 'PENDING');
  assert(pendingAd, 'A pending ad must exist to test approval');

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/approve-ad',
        token: activeAdminToken,
        ad_id: pendingAd.ad_id
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, `Ad approval should succeed: ${data.error?.message}`);
  assert(data.data.ad.status === 'APPROVED', 'Status must be APPROVED');
  assert(data.data.ad.approved_at, 'approved_at timestamp must be set');

  const sheetAd = memorySheets['Ads'].find(a => a.ad_id === pendingAd.ad_id);
  assert(sheetAd.status === 'APPROVED', 'Status in sheet must be APPROVED');

  // Verify activity log
  const log = memorySheets['ActivityLog'].find(l => l.action === 'ADMIN_APPROVE_AD' && l.entity_id === pendingAd.ad_id);
  assert(log, 'ADMIN_APPROVE_AD log entry must exist');
});

// Test 34: Admin Reject Ad
runTest('Test Admin Reject Ad: Enforces rejection reason and logs ADMIN_REJECT_AD', () => {
  // Find another pending ad or create one
  const targetAd = memorySheets['Ads'].find(a => a.status === 'APPROVED');
  assert(targetAd, 'Ad must exist');

  // 1. Missing reason fails
  const reqNoReason = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/reject-ad',
        token: activeAdminToken,
        ad_id: targetAd.ad_id,
        rejection_reason: ''
      })
    }
  };
  const resNoReason = Router.handle(reqNoReason, 'POST');
  const dataNoReason = JSON.parse(resNoReason.getContent());
  assert(!dataNoReason.success, 'Rejection without reason must fail');

  // 2. Valid rejection succeeds
  const reqValid = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/reject-ad',
        token: activeAdminToken,
        ad_id: targetAd.ad_id,
        rejection_reason: 'Image URL is non-functional and requires correction.'
      })
    }
  };
  const resValid = Router.handle(reqValid, 'POST');
  const dataValid = JSON.parse(resValid.getContent());

  assert(dataValid.success, `Ad rejection should succeed: ${dataValid.error?.message}`);
  assert(dataValid.data.ad.status === 'REJECTED', 'Status must be REJECTED');
  assert(dataValid.data.ad.rejection_reason.includes('non-functional'), 'Rejection reason must be stored');

  // Verify activity log
  const log = memorySheets['ActivityLog'].find(l => l.action === 'ADMIN_REJECT_AD' && l.entity_id === targetAd.ad_id);
  assert(log, 'ADMIN_REJECT_AD log entry must exist');
});

// Test 35: Admin Settings Management
runTest('Test Admin Settings Management: Updates setting in sheet and logs ADMIN_UPDATE_SETTING', () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/update-setting',
        token: activeAdminToken,
        setting: 'site_name',
        value: 'FreeAds Post Official'
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, `Setting update should succeed: ${data.error?.message}`);

  const settingInSheet = memorySheets['Settings'].find(s => s.setting === 'site_name');
  assert(settingInSheet && settingInSheet.value === 'FreeAds Post Official', 'Setting in sheet must be updated');

  const log = memorySheets['ActivityLog'].find(l => l.action === 'ADMIN_UPDATE_SETTING' && l.entity_id === 'site_name');
  assert(log, 'ADMIN_UPDATE_SETTING log entry must exist');
});

// Test 36: Strict Public Feed Isolation - Only APPROVED & non-expired ads appear
runTest('Test Public Feed Isolation: Pending, rejected, hidden, and deleted ads never appear in public feed', () => {
  // Clear any existing ads and seed known status set
  makeSellerLoggedIn('u2', 'u2@example.com', 'Approved Seller U2');
  const publicTestAds = [
    { ad_id: 'pub_pend_1', user_id: 'u1', title: 'Pending Ad', category: 'Services', description: 'desc', location: 'NYC', contact_preference: 'EMAIL', status: 'PENDING', is_sponsored: false, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
    { ad_id: 'pub_appr_1', user_id: 'u2', title: 'Approved Ad Live', category: 'Services', description: 'desc', location: 'NYC', contact_preference: 'EMAIL', status: 'APPROVED', is_sponsored: false, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
    { ad_id: 'pub_rej_1', user_id: 'u3', title: 'Rejected Ad Violation', category: 'Services', description: 'desc', location: 'NYC', contact_preference: 'EMAIL', status: 'REJECTED', rejection_reason: 'Prohibited item', is_sponsored: false, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
    { ad_id: 'pub_hid_1', user_id: 'u4', title: 'Hidden Ad Draft', category: 'Services', description: 'desc', location: 'NYC', contact_preference: 'EMAIL', status: 'HIDDEN', is_sponsored: false, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
    { ad_id: 'pub_del_1', user_id: 'u5', title: 'Deleted Ad Trashed', category: 'Services', description: 'desc', location: 'NYC', contact_preference: 'EMAIL', status: 'DELETED', is_sponsored: false, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
    { ad_id: 'pub_exp_1', user_id: 'u6', title: 'Expired Ad Past', category: 'Services', description: 'desc', location: 'NYC', contact_preference: 'EMAIL', status: 'APPROVED', is_sponsored: false, created_at: new Date(Date.now() - 100000000).toISOString(), expires_at: new Date(Date.now() - 10000).toISOString() }
  ];
  memorySheets['Ads'].push(...publicTestAds);

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: activeAdminToken
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Public feed query must succeed');
  const returnedAds = data.data.ads;
  const returnedIds = returnedAds.map(a => a.ad_id);

  assert(returnedIds.includes('pub_appr_1'), 'Approved live ad must appear in public feed');
  assert(!returnedIds.includes('pub_pend_1'), 'Pending ad must NEVER appear in public feed');
  assert(!returnedIds.includes('pub_rej_1'), 'Rejected ad must NEVER appear in public feed');
  assert(!returnedIds.includes('pub_hid_1'), 'Hidden ad must NEVER appear in public feed');
  assert(!returnedIds.includes('pub_del_1'), 'Deleted ad must NEVER appear in public feed');
  assert(!returnedIds.includes('pub_exp_1'), 'Expired ad must NEVER appear in public feed');

  // Single public ad lookup checks
  const reqPendingSingle = { postData: { contents: JSON.stringify({ action: 'ad', ad_id: 'pub_pend_1', token: activeAdminToken }) } };
  const resPendingSingle = Router.handle(reqPendingSingle, 'POST');
  // Admin can see it, but regular unauthenticated cannot
  assert(JSON.parse(resPendingSingle.getContent()).success, 'Admin can view pending ad via direct ad endpoint');
});

// Test 37: Complete Moderation Workflow - Approve Pending Ad
runTest('Test Moderation Workflow Approve: PENDING -> APPROVED, approved_at set, visible in public feed, logged in ActivityLog', () => {
  // Create a brand new pending ad
  const modPendingAdId = 'mod_ad_test_approve';
  makeSellerLoggedIn('usr_mod_author', 'author@example.com', 'Mod Author');
  memorySheets['Ads'].push({
    ad_id: modPendingAdId,
    user_id: 'usr_mod_author',
    title: 'Ad Awaiting Moderation Approval',
    category: 'Jobs',
    description: 'Looking for a senior developer.',
    image_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c',
    location: 'Remote',
    contact_preference: 'EMAIL',
    status: 'PENDING',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });

  // Verify not in public feed before approval
  const reqCheckPre = { postData: { contents: JSON.stringify({ action: 'ads', token: activeAdminToken }) } };
  const dataCheckPre = JSON.parse(Router.handle(reqCheckPre, 'POST').getContent());
  assert(!dataCheckPre.data.ads.some(a => a.ad_id === modPendingAdId), 'Pending ad must not be public before approval');

  // Admin approves ad
  const reqApprove = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/approve-ad',
        token: activeAdminToken,
        ad_id: modPendingAdId
      })
    }
  };
  const resApprove = Router.handle(reqApprove, 'POST');
  const dataApprove = JSON.parse(resApprove.getContent());

  assert(dataApprove.success, `Ad approval failed: ${dataApprove.error?.message}`);
  assert(dataApprove.data.ad.status === 'APPROVED', 'Ad status must transition to APPROVED');
  assert(dataApprove.data.ad.approved_at, 'approved_at timestamp must be set');

  // Verify now visible in public feed
  const reqCheckPost = { postData: { contents: JSON.stringify({ action: 'ads', token: activeAdminToken }) } };
  const dataCheckPost = JSON.parse(Router.handle(reqCheckPost, 'POST').getContent());
  assert(dataCheckPost.data.ads.some(a => a.ad_id === modPendingAdId), 'Approved ad must now appear in public feed');

  // Verify activity log entry
  const log = memorySheets['ActivityLog'].find(l => l.action === 'ADMIN_APPROVE_AD' && l.entity_id === modPendingAdId);
  assert(log, 'ADMIN_APPROVE_AD must be logged in ActivityLog');
  assert(log.metadata.includes('APPROVED'), 'Log metadata must confirm approval');
});

// Test 38: Admin Edit Ad
runTest('Test Admin Edit Ad: Modifies ad content, validates URL, logs ADMIN_EDIT_AD', () => {
  const adToEditId = 'mod_ad_test_approve'; // reuse approved ad
  const reqEdit = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/edit-ad',
        token: activeAdminToken,
        ad_id: adToEditId,
        title: 'Senior Full Stack Lead (Admin Revised)',
        category: 'Jobs',
        description: 'Updated comprehensive job description by admin.',
        image_url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
        location: 'San Francisco, CA',
        contact_preference: 'BOTH'
      })
    }
  };
  const resEdit = Router.handle(reqEdit, 'POST');
  const dataEdit = JSON.parse(resEdit.getContent());

  assert(dataEdit.success, `Admin edit should succeed: ${dataEdit.error?.message}`);
  assert(dataEdit.data.ad.title === 'Senior Full Stack Lead (Admin Revised)', 'Title must be updated');
  assert(dataEdit.data.ad.location === 'San Francisco, CA', 'Location must be updated');

  // Verify log
  const log = memorySheets['ActivityLog'].find(l => l.action === 'ADMIN_EDIT_AD' && l.entity_id === adToEditId);
  assert(log, 'ADMIN_EDIT_AD must be logged in ActivityLog');
});

// Test 39: Complete Moderation Workflow - Reject Ad with Mandatory Reason
runTest('Test Moderation Workflow Reject: PENDING/APPROVED -> REJECTED, reason mandatory, removed from public feed, logged', () => {
  const adToRejectId = 'mod_ad_test_approve';

  // 1. Missing reason must fail
  const reqFail = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/reject-ad',
        token: activeAdminToken,
        ad_id: adToRejectId,
        rejection_reason: '   '
      })
    }
  };
  const resFail = Router.handle(reqFail, 'POST');
  const dataFail = JSON.parse(resFail.getContent());
  assert(!dataFail.success, 'Rejection without reason must fail');
  assert(dataFail.error.code === 'VALIDATION_ERROR', 'Expected VALIDATION_ERROR');

  // 2. Reject with valid reason
  const reasonText = 'Violates terms of service regarding external links.';
  const reqReject = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/reject-ad',
        token: activeAdminToken,
        ad_id: adToRejectId,
        rejection_reason: reasonText
      })
    }
  };
  const resReject = Router.handle(reqReject, 'POST');
  const dataReject = JSON.parse(resReject.getContent());

  assert(dataReject.success, `Rejection should succeed: ${dataReject.error?.message}`);
  assert(dataReject.data.ad.status === 'REJECTED', 'Ad status must transition to REJECTED');
  assert(dataReject.data.ad.rejection_reason === reasonText, 'Rejection reason must match');

  // Verify ad is now completely absent from public feed
  const reqCheckPub = { postData: { contents: JSON.stringify({ action: 'ads', token: activeAdminToken }) } };
  const dataCheckPub = JSON.parse(Router.handle(reqCheckPub, 'POST').getContent());
  assert(!dataCheckPub.data.ads.some(a => a.ad_id === adToRejectId), 'Rejected ad must NEVER appear in public feed');

  // Verify activity log
  const log = memorySheets['ActivityLog'].find(l => l.action === 'ADMIN_REJECT_AD' && l.entity_id === adToRejectId);
  assert(log, 'ADMIN_REJECT_AD must be logged in ActivityLog');
});

// Test 40: Admin Delete Ad
runTest('Test Admin Delete Ad: Status -> DELETED, absent from public feed, logged in ActivityLog', () => {
  const adToDeleteId = 'mod_ad_test_approve';

  const reqDelete = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/delete-ad',
        token: activeAdminToken,
        ad_id: adToDeleteId
      })
    }
  };
  const resDelete = Router.handle(reqDelete, 'POST');
  const dataDelete = JSON.parse(resDelete.getContent());

  assert(dataDelete.success, `Admin delete should succeed: ${dataDelete.error?.message}`);
  assert(dataDelete.data.status === 'DELETED', 'Status must be DELETED');

  // Verify deleted ad is never in public feed
  const reqCheckPub = { postData: { contents: JSON.stringify({ action: 'ads', token: activeAdminToken }) } };
  const dataCheckPub = JSON.parse(Router.handle(reqCheckPub, 'POST').getContent());
  assert(!dataCheckPub.data.ads.some(a => a.ad_id === adToDeleteId), 'Deleted ad must NEVER appear in public feed');

  // Verify activity log
  const log = memorySheets['ActivityLog'].find(l => l.action === 'ADMIN_DELETE_AD' && l.entity_id === adToDeleteId);
  assert(log, 'ADMIN_DELETE_AD must be logged in ActivityLog');
});

// Test 41: Anti-Tampering & Security - User cannot self-approve, non-admin blocked from admin endpoints
runTest('Test Anti-Tampering: Regular user cannot self-approve ad or invoke admin moderation APIs', () => {
  // Regular user login
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;
  const user = Sheets.findOne('Users', u => u.email === uniqueEmail);

  // User creates an ad
  const userAdId = 'usr_tamper_ad_1';
  memorySheets['Ads'].push({
    ad_id: userAdId,
    user_id: user.user_id,
    title: 'User Ad For Tamper Test',
    category: 'Electronics',
    description: 'Smartphone for sale',
    location: 'Austin',
    contact_preference: 'PHONE',
    status: 'PENDING',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });

  // 1. Regular user attempts to call admin/approve-ad
  const reqApproveTamper = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/approve-ad',
        token: userToken,
        ad_id: userAdId
      })
    }
  };
  const resApproveTamper = Router.handle(reqApproveTamper, 'POST');
  const dataApproveTamper = JSON.parse(resApproveTamper.getContent());
  assert(!dataApproveTamper.success, 'Regular user must not be able to call admin/approve-ad');
  assert(dataApproveTamper.statusCode === 403, 'Expected HTTP 403 FORBIDDEN');

  // 2. Regular user attempts to pass status: 'APPROVED' in update-ad payload
  const reqSelfApprove = {
    postData: {
      contents: JSON.stringify({
        action: 'update-ad',
        token: userToken,
        ad_id: userAdId,
        title: 'Tampered Title',
        category: 'Electronics',
        description: 'Attempting self-approval in update payload',
        location: 'Austin',
        contact_preference: 'PHONE',
        status: 'APPROVED' // Client attempt to self-approve
      })
    }
  };
  const resSelfApprove = Router.handle(reqSelfApprove, 'POST');
  const dataSelfApprove = JSON.parse(resSelfApprove.getContent());
  assert(dataSelfApprove.success, 'Update should succeed but reset to PENDING');
  assert(dataSelfApprove.data.ad.status === 'PENDING', 'Ad status MUST be forced to PENDING on user edit');

  const adInSheet = memorySheets['Ads'].find(a => a.ad_id === userAdId);
  assert(adInSheet.status === 'PENDING', 'Ad status in sheet must remain PENDING');
});

// Test 42: Advertisement Visibility (Prompt 12) - Unauthenticated Visitors Can Browse Approved Ads with Shielded Contact
runTest('Test Visibility Rule: Unauthenticated API request to ads succeeds with approved ads, strictly withholding seller contact info', () => {
  const reqUnauth = {
    postData: {
      contents: JSON.stringify({
        action: 'ads'
        // No token provided (visitor)
      })
    }
  };
  const resUnauth = Router.handle(reqUnauth, 'POST');
  const dataUnauth = JSON.parse(resUnauth.getContent());

  assert(dataUnauth.success, 'Unauthenticated public request to /ads must succeed');
  assert(dataUnauth.statusCode === 200, `Expected HTTP 200, got ${dataUnauth.statusCode}`);
  assert(Array.isArray(dataUnauth.data.ads), 'Must return an array of advertisements');
  assert(dataUnauth.data.ads.length > 0, 'Must return approved ads');

  // Strict contact shielding validation: phone, email, whatsapp must NEVER be returned to visitors
  for (const ad of dataUnauth.data.ads) {
    assert(ad.status === 'APPROVED', 'Only APPROVED ads should be returned');
    assert(!ad.seller?.phone, 'Seller phone must NEVER be exposed to unauthenticated visitors');
    assert(!ad.seller?.email, 'Seller email must NEVER be exposed to unauthenticated visitors');
    assert(!ad.phone, 'Direct phone property must not exist');
    assert(!ad.email, 'Direct email property must not exist');
    assert(!ad.contact, 'contact object must be excluded for unauthenticated visitors');
    assert(ad.seller?.name, 'Basic seller name must be present');
    assert(ad.contact_available !== undefined, 'contact_available indicator must be present');
  }
});

// Test 43: Advertisement Visibility (Prompt 12) - Unauthenticated Visitor Can Retrieve Approved Ad Details with Protected Contact
runTest('Test Visibility Rule: Unauthenticated request to approved ad succeeds with shielded contact; pending/expired return 404', () => {
  // 1. Approved ad request by visitor
  const reqApproved = {
    postData: {
      contents: JSON.stringify({
        action: 'ad',
        ad_id: 'pub_appr_1'
        // No token provided
      })
    }
  };
  const resApproved = Router.handle(reqApproved, 'POST');
  const dataApproved = JSON.parse(resApproved.getContent());

  assert(dataApproved.success, 'Unauthenticated request for approved ad must succeed');
  assert(dataApproved.statusCode === 200, `Expected HTTP 200, got ${dataApproved.statusCode}`);
  assert(dataApproved.data.ad, 'Advertisement details must be returned');
  assert(dataApproved.data.ad.title, 'Ad title must be present');
  assert(dataApproved.data.ad.description, 'Ad description must be present');
  assert(!dataApproved.data.ad.seller?.phone, 'Phone must be shielded from visitor');
  assert(!dataApproved.data.ad.seller?.email, 'Email must be shielded from visitor');
  assert(!dataApproved.data.ad.contact, 'Contact object must not be exposed to visitor');
  assert(dataApproved.data.ad.seller?.name, 'Seller name must be visible');

  // 2. Pending ad request by visitor must return 404
  const reqPending = {
    postData: {
      contents: JSON.stringify({
        action: 'ad',
        ad_id: 'pub_pend_1'
        // No token provided
      })
    }
  };
  const resPending = Router.handle(reqPending, 'POST');
  const dataPending = JSON.parse(resPending.getContent());

  assert(!dataPending.success, 'Visitor cannot access pending ad');
  assert(dataPending.statusCode === 404, `Expected 404 NOT_FOUND, got ${dataPending.statusCode}`);
  assert(dataPending.error.code === 'NOT_FOUND', `Expected NOT_FOUND, got ${dataPending.error.code}`);
});

// Test 44: Advertisement Visibility - Authenticated Normal User Receives ONLY Approved Ads
runTest('Test Visibility Rule: Authenticated normal user retrieves approved advertisements with search/filter', () => {
  // Log in regular user
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;

  // 1. Fetch all ads
  const reqAll = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken
      })
    }
  };
  const resAll = Router.handle(reqAll, 'POST');
  const dataAll = JSON.parse(resAll.getContent());

  assert(dataAll.success, `Authenticated query must succeed: ${dataAll.error?.message}`);
  assert(Array.isArray(dataAll.data.ads), 'Must return an array of ads');

  // Verify all returned ads have status = 'APPROVED'
  for (const ad of dataAll.data.ads) {
    assert(ad.status === 'APPROVED', `Returned ad ${ad.ad_id} has forbidden status: ${ad.status}`);
  }

  // 2. Filter by Category
  const reqCat = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        category: 'Services'
      })
    }
  };
  const resCat = Router.handle(reqCat, 'POST');
  const dataCat = JSON.parse(resCat.getContent());
  assert(dataCat.success, 'Category filter query must succeed');
  for (const ad of dataCat.data.ads) {
    assert(ad.category.toLowerCase() === 'services', 'Must only return Services ads');
  }

  // 3. Search filter
  const reqSearch = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        search: 'Live'
      })
    }
  };
  const resSearch = Router.handle(reqSearch, 'POST');
  const dataSearch = JSON.parse(resSearch.getContent());
  assert(dataSearch.success, 'Search query must succeed');
  assert(dataSearch.data.ads.some(a => a.title.includes('Live')), 'Search query finds matching ad');
});

// Test 45: Advertisement Visibility - Authenticated User Cannot View Other User Unapproved Ads
runTest('Test Visibility Rule: Authenticated normal user cannot view pending or rejected ads of other users', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;

  // Single ad request for pending ad owned by someone else
  const reqOtherPending = {
    postData: {
      contents: JSON.stringify({
        action: 'ad',
        ad_id: 'pub_pend_1',
        token: userToken
      })
    }
  };
  const resOtherPending = Router.handle(reqOtherPending, 'POST');
  const dataOtherPending = JSON.parse(resOtherPending.getContent());

  assert(!dataOtherPending.success, 'Normal user must not view other users pending ad');
  assert(dataOtherPending.statusCode === 404, `Expected HTTP 404, got ${dataOtherPending.statusCode}`);

  // Single ad request for approved ad succeeds
  const reqApproved = {
    postData: {
      contents: JSON.stringify({
        action: 'ad',
        ad_id: 'pub_appr_1',
        token: userToken
      })
    }
  };
  const resApproved = Router.handle(reqApproved, 'POST');
  const dataApproved = JSON.parse(resApproved.getContent());

  assert(dataApproved.success, 'Normal user can view approved ad details');
  assert(dataApproved.data.ad.ad_id === 'pub_appr_1', 'Returns requested approved ad');
});

// Test 46: Server-side Pagination
runTest('Test Discovery Pagination: Server-side slicing returns only requested page and limit with metadata', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;

  makeSellerLoggedIn('usr_page', 'page@example.com', 'Page Seller');
  // Ensure we have at least 6 approved ads
  for (let i = 1; i <= 6; i++) {
    memorySheets['Ads'].push({
      ad_id: `page_ad_${i}`,
      user_id: 'usr_page',
      title: `Paginated Product ${i}`,
      category: 'Electronics',
      description: `Description for product item number ${i}`,
      location: 'Denver, CO',
      contact_preference: 'EMAIL',
      status: 'APPROVED',
      is_sponsored: false,
      created_at: new Date(Date.now() - (10 - i) * 10000).toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString()
    });
  }

  // Request page 1 with limit 2
  const reqP1 = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        category: 'Electronics',
        page: 1,
        limit: 2
      })
    }
  };
  const resP1 = Router.handle(reqP1, 'POST');
  const dataP1 = JSON.parse(resP1.getContent());

  assert(dataP1.success, `Pagination query page 1 should succeed: ${dataP1.error?.message}`);
  assert(dataP1.data.ads.length === 2, `Expected exactly 2 ads, got ${dataP1.data.ads.length}`);
  assert(dataP1.data.page === 1, 'Page number must be 1');
  assert(dataP1.data.limit === 2, 'Limit must be 2');
  assert(dataP1.data.total >= 6, `Expected total >= 6, got ${dataP1.data.total}`);
  assert(dataP1.data.total_pages >= 3, `Expected total_pages >= 3, got ${dataP1.data.total_pages}`);
  assert(dataP1.data.has_more === true, 'has_more must be true when next page exists');

  // Request page 2 with limit 2
  const reqP2 = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        category: 'Electronics',
        page: 2,
        limit: 2
      })
    }
  };
  const resP2 = Router.handle(reqP2, 'POST');
  const dataP2 = JSON.parse(resP2.getContent());

  assert(dataP2.success, 'Pagination query page 2 should succeed');
  assert(dataP2.data.ads.length === 2, `Expected 2 ads on page 2, got ${dataP2.data.ads.length}`);
  assert(dataP2.data.page === 2, 'Page number must be 2');

  // Page 1 and Page 2 must not have overlapping ad IDs
  const p1Ids = dataP1.data.ads.map(a => a.ad_id);
  const p2Ids = dataP2.data.ads.map(a => a.ad_id);
  const overlap = p1Ids.filter(id => p2Ids.includes(id));
  assert(overlap.length === 0, `Page 1 and Page 2 must have distinct ads, found overlap: ${overlap.join(',')}`);
});

// Test 47: Location Filter
runTest('Test Discovery Location Filter: Returns only approved advertisements matching target location', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;

  makeSellerLoggedIn('usr_loc', 'loc@example.com', 'Location Seller');
  memorySheets['Ads'].push({
    ad_id: 'loc_miami_ad',
    user_id: 'usr_loc',
    title: 'Miami Beachfront Condo Rental',
    category: 'Real Estate',
    description: 'Beautiful 2BR condo overlooking ocean in Miami Beach.',
    location: 'Miami, FL',
    contact_preference: 'PHONE',
    status: 'APPROVED',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });

  memorySheets['Ads'].push({
    ad_id: 'loc_seattle_ad',
    user_id: 'usr_loc',
    title: 'Seattle Tech Workspace Lease',
    category: 'Real Estate',
    description: 'Modern office space in downtown Seattle.',
    location: 'Seattle, WA',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        location: 'Miami'
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'Location filter query should succeed');
  assert(data.data.ads.length > 0, 'Should find at least 1 ad matching Miami');
  for (const ad of data.data.ads) {
    assert(ad.location.toLowerCase().includes('miami'), `Expected location to match Miami, got: ${ad.location}`);
  }
  assert(!data.data.ads.some(a => a.ad_id === 'loc_seattle_ad'), 'Seattle ad must not be returned');
});

// Test 48: Safe Search Handling & Title / Description Search
runTest('Test Discovery Safe Search: Sanitizes formula injection and searches title and description', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;

  makeSellerLoggedIn('usr_safe', 'safe@example.com', 'Safe Seller');
  memorySheets['Ads'].push({
    ad_id: 'safe_search_ad_1',
    user_id: 'usr_safe',
    title: 'Specialty Vintage Acoustic Guitar',
    category: 'Services',
    description: 'Custom handcrafted instruments and professional setup.',
    location: 'Nashville, TN',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });

  // 1. Search by title
  const reqTitle = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        title: 'Vintage Acoustic'
      })
    }
  };
  const dataTitle = JSON.parse(Router.handle(reqTitle, 'POST').getContent());
  assert(dataTitle.success, 'Title search must succeed');
  assert(dataTitle.data.ads.some(a => a.ad_id === 'safe_search_ad_1'), 'Should match title search');

  // 2. Search by description
  const reqDesc = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        description: 'handcrafted instruments'
      })
    }
  };
  const dataDesc = JSON.parse(Router.handle(reqDesc, 'POST').getContent());
  assert(dataDesc.success, 'Description search must succeed');
  assert(dataDesc.data.ads.some(a => a.ad_id === 'safe_search_ad_1'), 'Should match description search');

  // 3. Prevent Formula Injection: Search query starting with '='
  const reqFormula = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        search: '=SUM(A1:B10)'
      })
    }
  };
  const dataFormula = JSON.parse(Router.handle(reqFormula, 'POST').getContent());
  assert(dataFormula.success, 'Formula injection search query must be handled gracefully without throwing');

  // 4. Strip XSS / script tags in search
  const reqXss = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        search: '<script>alert("xss")</script>Acoustic'
      })
    }
  };
  const dataXss = JSON.parse(Router.handle(reqXss, 'POST').getContent());
  assert(dataXss.success, 'XSS search query must be sanitized and executed safely');
  assert(dataXss.data.ads.some(a => a.ad_id === 'safe_search_ad_1'), 'Sanitized query successfully finds Acoustic');
});

// Test 49: Date and Sponsored Sorting
runTest('Test Discovery Sorting: sponsored_first places sponsored ads on top, newest and oldest sort by date', () => {
  const resLogin = AuthService.login({ email: uniqueEmail, password: 'Password123!' });
  const userToken = JSON.parse(resLogin.getContent()).data.token;

  makeSellerLoggedIn('usr_sort', 'sort@example.com', 'Sort Seller');
  const now = Date.now();
  memorySheets['Ads'].push({
    ad_id: 'sort_std_new',
    user_id: 'usr_sort',
    title: 'Standard Ad Brand New',
    category: 'Jobs',
    description: 'Standard ad created 1 minute ago',
    location: 'Austin, TX',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: false,
    created_at: new Date(now - 60000).toISOString(),
    expires_at: new Date(now + 86400000).toISOString()
  });

  memorySheets['Ads'].push({
    ad_id: 'sort_spons_old',
    user_id: 'usr_sort',
    title: 'Sponsored Ad Older Date',
    category: 'Jobs',
    description: 'Sponsored ad created 2 days ago',
    location: 'Austin, TX',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: true,
    created_at: new Date(now - 172800000).toISOString(),
    expires_at: new Date(now + 86400000).toISOString()
  });

  // 1. sponsored_first sort: Sponsored ad must appear before standard ad
  const reqSpons = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        category: 'Jobs',
        sort: 'sponsored_first'
      })
    }
  };
  const dataSpons = JSON.parse(Router.handle(reqSpons, 'POST').getContent());
  assert(dataSpons.success, 'Sponsored sort query should succeed');
  const sponsIndex = dataSpons.data.ads.findIndex(a => a.ad_id === 'sort_spons_old');
  const stdIndex = dataSpons.data.ads.findIndex(a => a.ad_id === 'sort_std_new');
  assert(sponsIndex !== -1 && stdIndex !== -1, 'Both test ads should be present in results');
  assert(sponsIndex < stdIndex, `Sponsored ad (idx ${sponsIndex}) must rank higher than standard ad (idx ${stdIndex})`);

  // 2. newest sort: Standard ad (1 min ago) must appear before older sponsored ad (2 days ago)
  const reqNewest = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        category: 'Jobs',
        sort: 'newest'
      })
    }
  };
  const dataNewest = JSON.parse(Router.handle(reqNewest, 'POST').getContent());
  const newestStdIdx = dataNewest.data.ads.findIndex(a => a.ad_id === 'sort_std_new');
  const newestSponsIdx = dataNewest.data.ads.findIndex(a => a.ad_id === 'sort_spons_old');
  assert(newestStdIdx < newestSponsIdx, 'Newer ad must appear before older ad when sort=newest');

  // 3. oldest sort: Older ad must appear before newer ad
  const reqOldest = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: userToken,
        category: 'Jobs',
        sort: 'oldest'
      })
    }
  };
  const dataOldest = JSON.parse(Router.handle(reqOldest, 'POST').getContent());
  const oldestStdIdx = dataOldest.data.ads.findIndex(a => a.ad_id === 'sort_std_new');
  const oldestSponsIdx = dataOldest.data.ads.findIndex(a => a.ad_id === 'sort_spons_old');
  assert(oldestSponsIdx < oldestStdIdx, 'Older ad must appear before newer ad when sort=oldest');
});

// Test 50: Membership Creation & Status Assignment
let memTargetUserEmail = `mem_user_${Date.now()}@example.com`;
let memTargetUserId = null;
let memTargetUserToken = null;

runTest('Test Membership Creation & Status: Admin assigns membership with plan, dates, and status ACTIVE', () => {
  // Register member
  const resReg = AuthService.register({
    name: 'Membership VIP User',
    email: memTargetUserEmail,
    phone: '+15552223344',
    password: 'Password123!'
  });
  const debugToken = JSON.parse(resReg.getContent()).data.debugToken;
  AuthService.verifyEmail(debugToken);
  const resLogin = AuthService.login({ email: memTargetUserEmail, password: 'Password123!' });
  const loginData = JSON.parse(resLogin.getContent()).data;
  memTargetUserToken = loginData.token;
  memTargetUserId = loginData.user.user_id;

  // Admin assigns membership
  const reqAssign = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/membership/assign',
        token: activeAdminToken,
        user_id: memTargetUserId,
        plan: 'GOLD',
        duration_days: 30
      })
    }
  };
  const resAssign = Router.handle(reqAssign, 'POST');
  const dataAssign = JSON.parse(resAssign.getContent());

  assert(dataAssign.success, `Assign membership should succeed: ${dataAssign.error?.message}`);
  assert(dataAssign.data.membership.status === 'ACTIVE', 'Status must be ACTIVE');
  assert(dataAssign.data.membership.plan === 'GOLD', 'Plan must be GOLD');
  assert(dataAssign.data.membership.start_date, 'start_date must be set');
  assert(dataAssign.data.membership.expiry_date, 'expiry_date must be set');

  // Verify in Memberships sheet
  const memInSheet = Sheets.findByKey('Memberships', 'membership_id', dataAssign.data.membership.membership_id);
  assert(memInSheet, 'Membership record must be in Memberships sheet');
  assert(memInSheet.status === 'ACTIVE', 'Sheet status must be ACTIVE');

  // Verify Users sheet membership_status updated
  const userInSheet = Sheets.findByKey('Users', 'user_id', memTargetUserId);
  assert(userInSheet.membership_status === 'GOLD', `User membership_status must be GOLD, got: ${userInSheet.membership_status}`);

  // Verify ActivityLog entry
  const log = Sheets.findOne('ActivityLog', l => l.action === 'MEMBERSHIP_ASSIGN' && l.entity_id === dataAssign.data.membership.membership_id);
  assert(log, 'MEMBERSHIP_ASSIGN activity log must exist');
});

// Test 51: Automatic Membership Expiry (ACTIVE -> EXPIRED)
runTest('Test Automatic Membership Expiry: ACTIVE membership past expiry_date transitions to EXPIRED', () => {
  const expiredEmail = `exp_mem_${Date.now()}@example.com`;
  const resReg = AuthService.register({
    name: 'Expired Mem User',
    email: expiredEmail,
    phone: '+15553334455',
    password: 'Password123!'
  });
  const debugToken = JSON.parse(resReg.getContent()).data.debugToken;
  AuthService.verifyEmail(debugToken);
  const loginData = JSON.parse(AuthService.login({ email: expiredEmail, password: 'Password123!' }).getContent()).data;
  const expiredUserId = loginData.user.user_id;

  // Manually insert an expired membership record
  const expiredMemId = `mem_exp_${Date.now()}`;
  memorySheets['Memberships'].push({
    membership_id: expiredMemId,
    user_id: expiredUserId,
    plan: 'SILVER',
    start_date: new Date(Date.now() - 40 * 86400000).toISOString(),
    expiry_date: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
    status: 'ACTIVE', // Should become EXPIRED
    created_at: new Date(Date.now() - 40 * 86400000).toISOString()
  });

  // User queries membership
  const reqMem = {
    postData: {
      contents: JSON.stringify({
        action: 'membership',
        token: loginData.token
      })
    }
  };
  const resMem = Router.handle(reqMem, 'POST');
  const dataMem = JSON.parse(resMem.getContent());

  assert(dataMem.success, 'Membership query should succeed');
  assert(dataMem.data.status === 'EXPIRED', `Expected status EXPIRED, got ${dataMem.data.status}`);
  assert(dataMem.data.is_eligible_for_sponsorship === false, 'Expired member must not be eligible for sponsorship');

  // Verify record updated in Memberships sheet
  const memInSheet = Sheets.findByKey('Memberships', 'membership_id', expiredMemId);
  assert(memInSheet.status === 'EXPIRED', 'Database status must be EXPIRED');

  // Verify ActivityLog entry
  const log = Sheets.findOne('ActivityLog', l => l.action === 'MEMBERSHIP_EXPIRED' && l.entity_id === expiredMemId);
  assert(log, 'MEMBERSHIP_EXPIRED activity log entry must be created');
});

// Test 52: Membership Cancellation
runTest('Test Membership Cancellation: User cancels active membership; status transitions to CANCELLED', () => {
  const reqMem = { postData: { contents: JSON.stringify({ action: 'membership', token: memTargetUserToken }) } };
  const memData = JSON.parse(Router.handle(reqMem, 'POST').getContent()).data;
  const memId = memData.membership.membership_id;

  const reqCancel = {
    postData: {
      contents: JSON.stringify({
        action: 'membership/cancel',
        token: memTargetUserToken,
        membership_id: memId
      })
    }
  };
  const resCancel = Router.handle(reqCancel, 'POST');
  const dataCancel = JSON.parse(resCancel.getContent());

  assert(dataCancel.success, `Membership cancel should succeed: ${dataCancel.error?.message}`);
  assert(dataCancel.data.membership.status === 'CANCELLED', 'Status must transition to CANCELLED');

  const memInSheet = Sheets.findByKey('Memberships', 'membership_id', memId);
  assert(memInSheet.status === 'CANCELLED', 'Database record must be CANCELLED');

  // Re-activate membership for memTargetUserId for subsequent tests
  Sheets.update('Memberships', 'membership_id', memId, {
    status: 'ACTIVE',
    expiry_date: new Date(Date.now() + 30 * 86400000).toISOString()
  });
});

// Test 53: Anti-Tampering (Ad Creation & Update)
runTest('Test Anti-Tampering: Client cannot force is_sponsored=true on create-ad or update-ad', () => {
  // 1. Client tries is_sponsored on create-ad
  const reqCreate = {
    postData: {
      contents: JSON.stringify({
        action: 'create-ad',
        token: memTargetUserToken,
        title: 'Tamper Attempt Sponsored Ad',
        category: 'Electronics',
        description: 'Attempting to inject is_sponsored true during ad creation',
        location: 'Seattle, WA',
        contact_preference: 'EMAIL',
        is_sponsored: true, // Malicious
        sponsored_until: new Date(Date.now() + 30 * 86400000).toISOString()
      })
    }
  };
  const dataCreate = JSON.parse(Router.handle(reqCreate, 'POST').getContent());
  assert(dataCreate.success, 'Ad creation should succeed');
  assert(dataCreate.data.ad.is_sponsored === false, 'is_sponsored MUST be forced to false on create');
  assert(!dataCreate.data.ad.sponsored_until, 'sponsored_until MUST be empty string on create');

  const createdAdId = dataCreate.data.ad.ad_id;

  // 2. Client tries is_sponsored on update-ad
  const reqUpdate = {
    postData: {
      contents: JSON.stringify({
        action: 'update-ad',
        token: memTargetUserToken,
        ad_id: createdAdId,
        title: 'Tamper Attempt Updated Ad',
        category: 'Electronics',
        description: 'Attempting to inject is_sponsored true during ad update',
        location: 'Seattle, WA',
        contact_preference: 'EMAIL',
        is_sponsored: true, // Malicious
        sponsored_until: new Date(Date.now() + 30 * 86400000).toISOString()
      })
    }
  };
  const dataUpdate = JSON.parse(Router.handle(reqUpdate, 'POST').getContent());
  assert(dataUpdate.success, 'Ad update should succeed');
  assert(dataUpdate.data.ad.is_sponsored === false, 'is_sponsored MUST remain false on update');
  assert(!dataUpdate.data.ad.sponsored_until, 'sponsored_until MUST remain empty on update');
});

// Test 54: Sponsorship Eligibility Enforcement
runTest('Test Sponsorship Eligibility: Admin cannot sponsor an ad owned by an ineligible or free user', () => {
  // Ineligible user with FREE plan
  const freeEmail = `free_user_${Date.now()}@example.com`;
  const resReg = AuthService.register({
    name: 'Free Member',
    email: freeEmail,
    phone: '+15559998877',
    password: 'Password123!'
  });
  AuthService.verifyEmail(JSON.parse(resReg.getContent()).data.debugToken);
  const freeLogin = JSON.parse(AuthService.login({ email: freeEmail, password: 'Password123!' }).getContent()).data;

  // Free user creates ad and admin approves it
  const reqAd = {
    postData: {
      contents: JSON.stringify({
        action: 'create-ad',
        token: freeLogin.token,
        title: 'Free Member Lawn Mowing Service',
        category: 'Services',
        description: 'Professional neighborhood lawn care and mowing services.',
        location: 'Dallas, TX',
        contact_preference: 'PHONE'
      })
    }
  };
  const adData = JSON.parse(Router.handle(reqAd, 'POST').getContent()).data.ad;
  Sheets.update('Ads', 'ad_id', adData.ad_id, { status: 'APPROVED', approved_at: new Date().toISOString() });

  // Admin attempts to sponsor free user's ad
  const reqSponsor = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/sponsor-ad',
        token: activeAdminToken,
        ad_id: adData.ad_id,
        duration_days: 7
      })
    }
  };
  const resSponsor = Router.handle(reqSponsor, 'POST');
  const dataSponsor = JSON.parse(resSponsor.getContent());

  assert(!dataSponsor.success, 'Sponsorship of free member ad MUST fail');
  assert(dataSponsor.error?.code === 'INELIGIBLE_FOR_SPONSORSHIP', `Expected INELIGIBLE_FOR_SPONSORSHIP, got: ${dataSponsor.error?.code}`);
});

// Test 55: Authorized Sponsorship Assignment
let eligibleSponsoredAdId = null;
runTest('Test Authorized Sponsorship: Admin grants sponsorship to approved ad owned by active GOLD member', () => {
  // memTargetUserId is active GOLD member
  // Create an approved ad for memTargetUserId
  const adId = `ad_spon_test_${Date.now()}`;
  memorySheets['Ads'].push({
    ad_id: adId,
    user_id: memTargetUserId,
    title: 'Executive Consulting Services Live',
    category: 'Services',
    description: 'Expert strategic and financial enterprise consulting.',
    location: 'Chicago, IL',
    contact_preference: 'BOTH',
    status: 'APPROVED',
    is_sponsored: false,
    sponsored_until: '',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });

  const reqSponsor = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/sponsor-ad',
        token: activeAdminToken,
        ad_id: adId,
        duration_days: 7
      })
    }
  };
  const resSponsor = Router.handle(reqSponsor, 'POST');
  const dataSponsor = JSON.parse(resSponsor.getContent());

  assert(dataSponsor.success, `Sponsorship should succeed: ${dataSponsor.error?.message}`);
  assert(dataSponsor.data.ad.is_sponsored === true, 'is_sponsored must become true');
  assert(dataSponsor.data.ad.sponsored_until, 'sponsored_until must be set');

  const adInSheet = Sheets.findByKey('Ads', 'ad_id', adId);
  assert(adInSheet.is_sponsored === true, 'Database record must have is_sponsored = true');

  const log = Sheets.findOne('ActivityLog', l => l.action === 'ADMIN_SPONSOR_AD' && l.entity_id === adId);
  assert(log, 'ADMIN_SPONSOR_AD activity log entry must be created');

  eligibleSponsoredAdId = adId;
});

// Test 56: Automatic Sponsorship Deactivation
runTest('Test Automatic Sponsorship Deactivation: Ad whose sponsored_until has passed is treated as inactive', () => {
  const expiredSponAdId = `ad_spon_exp_${Date.now()}`;
  memorySheets['Ads'].push({
    ad_id: expiredSponAdId,
    user_id: memTargetUserId,
    title: 'Expired Sponsorship Vintage Watch',
    category: 'Services',
    description: 'Classic chronometer with expired sponsorship.',
    location: 'Miami, FL',
    contact_preference: 'PHONE',
    status: 'APPROVED',
    is_sponsored: true,
    sponsored_until: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });

  // Query ad details
  const reqAd = {
    postData: {
      contents: JSON.stringify({
        action: 'ad',
        token: memTargetUserToken,
        ad_id: expiredSponAdId
      })
    }
  };
  const dataAd = JSON.parse(Router.handle(reqAd, 'POST').getContent());
  assert(dataAd.success, 'Ad lookup must succeed');
  assert(dataAd.data.ad.is_sponsored === false, 'Ad with past sponsored_until MUST evaluate is_sponsored as false');
});

// Test 57: Priority Ranking (Active Sponsored First, then Normal Approved, each Newest First)
runTest('Test Priority Ranking: Active sponsored ads rank first (newest first), followed by normal approved ads (newest first)', () => {
  const now = Date.now();

  // Create 4 distinct ads in category 'Vehicles' to test ranking deterministically
  const sponOlder = {
    ad_id: 'rank_spon_older',
    user_id: memTargetUserId,
    title: 'Rank Test Sponsored Older Car',
    category: 'Vehicles',
    description: 'Sponsored vehicle created 2 hours ago',
    location: 'Orlando, FL',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: true,
    sponsored_until: new Date(now + 86400000).toISOString(),
    created_at: new Date(now - 7200000).toISOString(), // 2 hours ago
    expires_at: new Date(now + 86400000).toISOString()
  };

  const sponNewer = {
    ad_id: 'rank_spon_newer',
    user_id: memTargetUserId,
    title: 'Rank Test Sponsored Newer Car',
    category: 'Vehicles',
    description: 'Sponsored vehicle created 1 hour ago',
    location: 'Orlando, FL',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: true,
    sponsored_until: new Date(now + 86400000).toISOString(),
    created_at: new Date(now - 3600000).toISOString(), // 1 hour ago
    expires_at: new Date(now + 86400000).toISOString()
  };

  const normOlder = {
    ad_id: 'rank_norm_older',
    user_id: memTargetUserId,
    title: 'Rank Test Normal Older Car',
    category: 'Vehicles',
    description: 'Normal vehicle created 2 hours ago',
    location: 'Orlando, FL',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: false,
    sponsored_until: '',
    created_at: new Date(now - 7200000).toISOString(), // 2 hours ago
    expires_at: new Date(now + 86400000).toISOString()
  };

  const normNewer = {
    ad_id: 'rank_norm_newer',
    user_id: memTargetUserId,
    title: 'Rank Test Normal Newer Car',
    category: 'Vehicles',
    description: 'Normal vehicle created 1 hour ago',
    location: 'Orlando, FL',
    contact_preference: 'EMAIL',
    status: 'APPROVED',
    is_sponsored: false,
    sponsored_until: '',
    created_at: new Date(now - 3600000).toISOString(), // 1 hour ago
    expires_at: new Date(now + 86400000).toISOString()
  };

  memorySheets['Ads'].push(sponOlder, sponNewer, normOlder, normNewer);

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'ads',
        token: memTargetUserToken,
        category: 'Vehicles',
        location: 'Orlando'
      })
    }
  };
  const data = JSON.parse(Router.handle(req, 'POST').getContent());
  assert(data.success, 'Query ads should succeed');

  const adIds = data.data.ads.map(a => a.ad_id);
  const idxSponNewer = adIds.indexOf('rank_spon_newer');
  const idxSponOlder = adIds.indexOf('rank_spon_older');
  const idxNormNewer = adIds.indexOf('rank_norm_newer');
  const idxNormOlder = adIds.indexOf('rank_norm_older');

  assert(idxSponNewer !== -1 && idxSponOlder !== -1 && idxNormNewer !== -1 && idxNormOlder !== -1, 'All 4 ads must be returned');

  // Group 1 (Active sponsored ads) must appear BEFORE Group 2 (Normal approved ads)
  assert(idxSponNewer < idxNormNewer, 'Newer sponsored ad must appear before newer normal ad');
  assert(idxSponOlder < idxNormNewer, 'Older sponsored ad must appear before newer normal ad');
  assert(idxSponOlder < idxNormOlder, 'Older sponsored ad must appear before older normal ad');

  // Within Group 1: newest first
  assert(idxSponNewer < idxSponOlder, 'Within sponsored group, newer ad must appear before older ad');

  // Within Group 2: newest first
  assert(idxNormNewer < idxNormOlder, 'Within normal group, newer ad must appear before older ad');
});

// Test 58: Membership Plans Configuration from Settings
runTest('Test 58: Membership Plans Configuration: Returns FREE, PREMIUM_MONTHLY, and PREMIUM_YEARLY from Settings/Defaults', () => {
  // Populate Settings with default membership plans JSON
  const samplePlans = [
    {
      plan_id: 'FREE',
      name: 'Free Membership',
      price: 0,
      currency: 'USD',
      interval: 'lifetime',
      duration_days: 0,
      is_sponsored_eligible: false,
      description: 'Standard free membership for all registered users.',
      features: ['Submit classified ads', 'Browse listings']
    },
    {
      plan_id: 'PREMIUM_MONTHLY',
      name: 'Premium Monthly',
      price: 19.99,
      currency: 'USD',
      interval: 'month',
      duration_days: 30,
      is_sponsored_eligible: true,
      description: 'Monthly premium tier unlocking priority sponsored ad placements.',
      features: ['Priority placement', 'SPONSORED badge']
    },
    {
      plan_id: 'PREMIUM_YEARLY',
      name: 'Premium Yearly',
      price: 199.99,
      currency: 'USD',
      interval: 'year',
      duration_days: 365,
      is_sponsored_eligible: true,
      description: 'Full-year premium status with maximum exposure.',
      features: ['Full year coverage', 'Priority support']
    }
  ];

  memorySheets['Settings'].push({
    setting: 'membership_plans',
    value: JSON.stringify(samplePlans),
    description: 'System membership plans'
  });

  const res = MembershipService.getMembershipPlans();
  const data = JSON.parse(res.getContent());

  assert(data.success, 'getMembershipPlans should succeed');
  assert(Array.isArray(data.data.plans), 'Plans must be an array');
  assert(data.data.plans.length === 3, 'Must return 3 plans');

  const planIds = data.data.plans.map(p => p.plan_id);
  assert(planIds.includes('FREE'), 'Must include FREE');
  assert(planIds.includes('PREMIUM_MONTHLY'), 'Must include PREMIUM_MONTHLY');
  assert(planIds.includes('PREMIUM_YEARLY'), 'Must include PREMIUM_YEARLY');
});

// Test 59: Payment-Ready Fields in assignMembership with Empty payment_id
runTest('Test 59: Payment-Ready Architecture: assignMembership stores amount, currency, and empty payment_id for now', () => {
  const targetUser = `payuser_${Date.now()}@example.com`;
  const regRes = AuthService.register({
    name: 'Payment Readiness Tester',
    email: targetUser,
    phone: '+15551239999',
    password: 'Password123!'
  });
  const uId = JSON.parse(regRes.getContent()).data.user.user_id;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/membership/assign',
        token: activeAdminToken,
        user_id: uId,
        plan: 'PREMIUM_MONTHLY',
        amount: 19.99,
        currency: 'USD',
        payment_id: '',
        payment_provider: ''
      })
    }
  };
  const assignRes = Router.handle(req, 'POST');
  const assignData = JSON.parse(assignRes.getContent());
  assert(assignData.success, `assignMembership should succeed: ${assignData.error?.message}`);

  const mem = assignData.data.membership;
  assert(mem.plan === 'PREMIUM_MONTHLY', 'Plan must be PREMIUM_MONTHLY');
  assert(mem.amount === 19.99, 'Amount must be recorded as 19.99');
  assert(mem.currency === 'USD', 'Currency must be USD');
  assert(mem.payment_id === '', 'payment_id must remain empty string in pre-gateway phase');
  assert(mem.status === 'ACTIVE', 'Membership status must be ACTIVE');

  // Verify in memory database
  const storedRow = memorySheets['Memberships'].find(m => m.membership_id === mem.membership_id);
  assert(storedRow, 'Membership row must be persisted in database');
  assert(storedRow.amount === 19.99, 'Persisted row amount must match');
  assert(storedRow.payment_id === '', 'Persisted payment_id must be empty');
});

// Test 60: Yearly Plan Duration Calculation and Sponsorship Eligibility
runTest('Test 60: Yearly Plan Duration & Eligibility: Automatically calculates 365-day expiry and eligibility', () => {
  const targetUser2 = `yearly_${Date.now()}@example.com`;
  const regRes = AuthService.register({
    name: 'Yearly Plan Tester',
    email: targetUser2,
    phone: '+15551238888',
    password: 'Password123!'
  });
  const debugToken = JSON.parse(regRes.getContent()).data.debugToken;
  AuthService.verifyEmail(debugToken);
  const uId = JSON.parse(regRes.getContent()).data.user.user_id;

  // Assign yearly plan without passing duration_days (should auto-detect 365 days from plan definition)
  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/membership/assign',
        token: activeAdminToken,
        user_id: uId,
        plan: 'PREMIUM_YEARLY',
        amount: 199.99,
        currency: 'USD'
      })
    }
  };
  const assignRes = Router.handle(req, 'POST');
  const assignData = JSON.parse(assignRes.getContent());
  assert(assignData.success, `Yearly assignMembership should succeed: ${assignData.error?.message}`);

  const mem = assignData.data.membership;
  const startDate = new Date(mem.start_date).getTime();
  const expiryDate = new Date(mem.expiry_date).getTime();
  const diffDays = Math.round((expiryDate - startDate) / (86400000));
  assert(diffDays >= 364 && diffDays <= 366, `Yearly plan expiry must span ~365 days, got ${diffDays}`);

  // Check user membership status endpoint
  const userMemRes = MembershipService.getUserMembership({ user_id: uId });
  const userMemData = JSON.parse(userMemRes.getContent());
  assert(userMemData.success, 'getUserMembership should succeed');
  assert(userMemData.data.plan === 'PREMIUM_YEARLY', 'User membership plan must be PREMIUM_YEARLY');
  assert(userMemData.data.status === 'ACTIVE', 'Status must be ACTIVE');
  assert(userMemData.data.is_eligible_for_sponsorship === true, 'PREMIUM_YEARLY must be eligible for sponsorship');
});

// Test 61: Public Access to /membership/plans without Authentication
runTest('Test 61: Public Endpoint: Visitors can retrieve membership plans without token', () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: 'membership/plans'
      })
    }
  };
  const res = Router.handle(req, 'POST');
  const data = JSON.parse(res.getContent());

  assert(data.success, 'membership/plans must be accessible publicly without token');
  assert(Array.isArray(data.data.plans) && data.data.plans.length > 0, 'Must return plans list');
});

// Test 62: Extensibility with Future Payment Provider Data
runTest('Test 62: Extensibility Architecture: Successfully records provider details when payment is integrated', () => {
  const targetUser3 = `ext_${Date.now()}@example.com`;
  const regRes = AuthService.register({
    name: 'Extensibility Tester',
    email: targetUser3,
    phone: '+15551237777',
    password: 'Password123!'
  });
  const uId = JSON.parse(regRes.getContent()).data.user.user_id;

  // Simulate future payment webhook integration calling assignMembership with provider details
  const assignRes = MembershipService.assignMembership({
    role: 'SYSTEM_WEBHOOK',
    is_system_webhook: true
  }, {
    user_id: uId,
    plan: 'PREMIUM_MONTHLY',
    amount: 19.99,
    currency: 'USD',
    payment_id: 'ch_stripe_mock_test_12345',
    payment_provider: 'STRIPE_CHECKOUT'
  });

  const assignData = JSON.parse(assignRes.getContent());
  assert(assignData.success, `Extensible payment assignment should succeed: ${assignData.error?.message}`);

  const mem = assignData.data.membership;
  assert(mem.payment_id === 'ch_stripe_mock_test_12345', 'Must store future payment provider payment_id');
  assert(mem.payment_provider === 'STRIPE_CHECKOUT', 'Must store payment_provider');

  const storedRow = memorySheets['Memberships'].find(m => m.membership_id === mem.membership_id);
  assert(storedRow.payment_provider === 'STRIPE_CHECKOUT', 'Stored row must preserve payment_provider');
});

// Test 63: Configurable Inactivity Settings (Dynamic, No Hard-coding)
runTest('Test 63: Configurable Inactivity Settings: Dynamically retrieves warning and hide thresholds from Settings sheet', () => {
  // Check defaults when no custom setting is saved
  const defaultSettings = UserActivityService.getInactivitySettings();
  assert(defaultSettings.warningDays === 60, `Default warning days should be 60, got ${defaultSettings.warningDays}`);
  assert(defaultSettings.hideDays === 90, `Default hide days should be 90, got ${defaultSettings.hideDays}`);

  // Now seed custom settings into Settings sheet
  memorySheets['Settings'] = memorySheets['Settings'] || [];
  memorySheets['Settings'].push({ setting: 'inactivity_warning_days', value: '45', description: 'Custom warning' });
  memorySheets['Settings'].push({ setting: 'inactivity_hide_ad_days', value: '75', description: 'Custom hide' });
  Sheets.clearCache('Settings');

  const customSettings = UserActivityService.getInactivitySettings();
  assert(customSettings.warningDays === 45, `Warning days should dynamically update to 45, got ${customSettings.warningDays}`);
  assert(customSettings.hideDays === 75, `Hide days should dynamically update to 75, got ${customSettings.hideDays}`);

  // Clean up custom settings back to 60/90
  memorySheets['Settings'] = memorySheets['Settings'].filter(s => s.setting !== 'inactivity_warning_days' && s.setting !== 'inactivity_hide_ad_days');
  memorySheets['Settings'].push({ setting: 'inactivity_warning_days', value: '60', description: 'Default warning' });
  memorySheets['Settings'].push({ setting: 'inactivity_hide_ad_days', value: '90', description: 'Default hide' });
  Sheets.clearCache('Settings');
});

// Test 64: Automated Ad Pausing on User Inactivity
runTest('Test 64: Automated Ad Pausing: User inactive >= 90 days has APPROVED ads transitioned to HIDDEN and logged', () => {
  const inactiveUserEmail = `inactive_${Date.now()}@example.com`;
  const regRes = AuthService.register({
    name: 'Inactive John',
    email: inactiveUserEmail,
    phone: '+15551239090',
    password: 'Password123!'
  });
  const uId = JSON.parse(regRes.getContent()).data.user.user_id;

  // Set user last_login to 95 days ago
  const ninetyFiveDaysAgo = new Date(Date.now() - (95 * 86400000)).toISOString();
  Sheets.update('Users', 'user_id', uId, {
    last_login: ninetyFiveDaysAgo,
    email_verified: true,
    account_status: 'ACTIVE'
  });

  // Create an approved ad for this user
  const ad1 = Sheets.insert('Ads', {
    ad_id: Utilities.getUuid(),
    user_id: uId,
    title: 'Vintage Bicycle',
    category: 'Vehicles',
    description: 'Bicycle in great shape',
    status: 'APPROVED',
    created_at: ninetyFiveDaysAgo,
    updated_at: ninetyFiveDaysAgo
  });

  const mailCountBefore = (global.MailApp.sentEmails || []).length;
  // Run inactivity process job as admin/cron
  const jobRes = UserActivityService.processInactivity({ role: 'ADMIN', user_id: 'admin_sys' });
  const jobData = JSON.parse(jobRes.getContent());
  assert(jobData.success, 'processInactivity should succeed');
  assert(jobData.data.ads_hidden >= 1, 'Must report at least 1 ad hidden');

  // Verify ad status transitioned to HIDDEN
  const updatedAd = Sheets.findByKey('Ads', 'ad_id', ad1.ad_id);
  assert(updatedAd.status === 'HIDDEN', `Expected ad status to be HIDDEN, got '${updatedAd.status}'`);

  // Verify ActivityLog entry AD_AUTO_HIDE_INACTIVITY
  const logEntry = Sheets.findOne('ActivityLog', l => l.action === 'AD_AUTO_HIDE_INACTIVITY' && l.entity_id === ad1.ad_id);
  assert(logEntry, 'Must log AD_AUTO_HIDE_INACTIVITY in ActivityLog');
  const meta = JSON.parse(logEntry.metadata);
  assert(meta.user_id === uId, 'Log metadata must record user_id');
  assert(meta.previous_status === 'APPROVED', 'Log metadata must record previous status');

  // Verify notification email sent
  const mailCountAfter = (global.MailApp.sentEmails || []).length;
  assert(mailCountAfter > mailCountBefore, 'Notification email must be sent to user informing that ad is hidden');
});

// Test 65: Inactivity Advance Warning Notification
runTest('Test 65: Advance Warning Notification: User inactive >= 60 days receives warning email without hiding ads', () => {
  const warningUserEmail = `warning_${Date.now()}@example.com`;
  const regRes = AuthService.register({
    name: 'Warning User',
    email: warningUserEmail,
    phone: '+15551236060',
    password: 'Password123!'
  });
  const uId = JSON.parse(regRes.getContent()).data.user.user_id;

  // Set user last_login to 65 days ago (between 60 and 90)
  const sixtyFiveDaysAgo = new Date(Date.now() - (65 * 86400000)).toISOString();
  Sheets.update('Users', 'user_id', uId, {
    last_login: sixtyFiveDaysAgo,
    email_verified: true,
    account_status: 'ACTIVE'
  });

  // Create an approved ad for this user
  const ad = Sheets.insert('Ads', {
    ad_id: Utilities.getUuid(),
    user_id: uId,
    title: 'Guitar for Sale',
    category: 'Electronics',
    description: 'Acoustic guitar',
    status: 'APPROVED',
    created_at: sixtyFiveDaysAgo,
    updated_at: sixtyFiveDaysAgo
  });

  const mailCountBefore = (global.MailApp.sentEmails || []).length;
  const jobRes = UserActivityService.processInactivity();
  const jobData = JSON.parse(jobRes.getContent());
  assert(jobData.success, 'processInactivity should succeed');

  // Ad must REMAIN APPROVED (not hidden yet)
  const checkedAd = Sheets.findByKey('Ads', 'ad_id', ad.ad_id);
  assert(checkedAd.status === 'APPROVED', `Ad should remain APPROVED during warning phase, got '${checkedAd.status}'`);

  // ActivityLog entry for USER_INACTIVITY_WARNING
  const warnLog = Sheets.findOne('ActivityLog', l => l.action === 'USER_INACTIVITY_WARNING' && l.entity_id === uId);
  assert(warnLog, 'Must record USER_INACTIVITY_WARNING in ActivityLog');

  // Verify warning email sent
  const mailCountAfter = (global.MailApp.sentEmails || []).length;
  assert(mailCountAfter > mailCountBefore, 'Must send advance warning email before ads are hidden');

  // Verify deduplication: immediate re-run does not send duplicate warning
  UserActivityService.processInactivity();
  const mailCountAfter2 = (global.MailApp.sentEmails || []).length;
  assert(mailCountAfter2 === mailCountAfter, 'Must not spam duplicate warning emails within 30 days');
});

// Test 66: Safe Reactivation Workflow (Login does NOT automatically republish)
runTest('Test 66: Safe Reactivation: Login does NOT unhide ads; /ad/reactivate transitions HIDDEN -> PENDING', () => {
  const reactUserEmail = `react_${Date.now()}@example.com`;
  const password = 'Password123!';
  const regRes = AuthService.register({
    name: 'Reactivating User',
    email: reactUserEmail,
    phone: '+15551234444',
    password: password
  });
  const uId = JSON.parse(regRes.getContent()).data.user.user_id;

  // Mark verified and create a HIDDEN ad
  Sheets.update('Users', 'user_id', uId, {
    email_verified: true,
    account_status: 'ACTIVE',
    last_login: new Date(Date.now() - (95 * 86400000)).toISOString()
  });

  const ad = Sheets.insert('Ads', {
    ad_id: Utilities.getUuid(),
    user_id: uId,
    title: 'Antique Table',
    category: 'Furniture',
    description: 'Oak table',
    status: 'HIDDEN'
  });

  // 1. User logs in again
  const loginRes = AuthService.login({ email: reactUserEmail, password: password });
  const loginData = JSON.parse(loginRes.getContent());
  assert(loginData.success, 'Login should succeed');
  const token = loginData.data.token;

  // Verify business rule: Ads must NOT automatically become APPROVED upon login
  const adAfterLogin = Sheets.findByKey('Ads', 'ad_id', ad.ad_id);
  assert(adAfterLogin.status === 'HIDDEN', 'Login must NOT automatically unhide or publish ads');

  // 2. User invokes reactivation endpoint via Router
  const reactReq = {
    postData: {
      contents: JSON.stringify({
        action: 'ad/reactivate',
        token: token,
        ad_id: ad.ad_id
      })
    }
  };
  const reactRes = Router.handle(reactReq, 'POST');
  const reactData = JSON.parse(reactRes.getContent());
  assert(reactData.success, `Reactivate should succeed: ${reactData.error?.message}`);

  // Status transitions to PENDING (requires admin moderation review)
  const adAfterReq = Sheets.findByKey('Ads', 'ad_id', ad.ad_id);
  assert(adAfterReq.status === 'PENDING', `Ad must transition to PENDING for admin review, got '${adAfterReq.status}'`);

  // ActivityLog records AD_REACTIVATE_REQUEST
  const log = Sheets.findOne('ActivityLog', l => l.action === 'AD_REACTIVATE_REQUEST' && l.entity_id === ad.ad_id);
  assert(log, 'Must record AD_REACTIVATE_REQUEST in ActivityLog');

  // 3. Another user cannot reactivate someone else's ad
  const otherEmail = `other_${Date.now()}@example.com`;
  const otherUserRes = AuthService.register({
    name: 'Other Hacker',
    email: otherEmail,
    phone: '+15551239999',
    password: password
  });
  const otherUserObj = JSON.parse(otherUserRes.getContent()).data.user;
  Sheets.update('Users', 'user_id', otherUserObj.user_id, { email_verified: true, account_status: 'ACTIVE' });
  const otherLoginRes = AuthService.login({ email: otherEmail, password: password });
  const otherToken = JSON.parse(otherLoginRes.getContent()).data.token;

  // Try to reactivate first user's ad
  const illegalReq = {
    postData: {
      contents: JSON.stringify({
        action: 'ad/reactivate',
        token: otherToken,
        ad_id: ad.ad_id
      })
    }
  };
  const illegalRes = Router.handle(illegalReq, 'POST');
  const illegalData = JSON.parse(illegalRes.getContent());
  assert(!illegalData.success, 'Other user must NOT be allowed to reactivate someone else ad');
  assert(illegalData.error.code === 'FORBIDDEN' || illegalData.error.code === 'INVALID_STATE', 'Must be rejected with 403 or invalid state');
});

// Test 67: Admin Inactive Users Discovery
runTest('Test 67: Admin Inactive Users Discovery: Admin can inspect inactive users and inactivity metrics', () => {
  const adminEmail = `admin_disc_${Date.now()}@example.com`;
  const regAdmin = AuthService.register({
    name: 'Discovery Admin',
    email: adminEmail,
    phone: '+15551230000',
    password: 'Password123!'
  });
  const adminId = JSON.parse(regAdmin.getContent()).data.user.user_id;
  Sheets.update('Users', 'user_id', adminId, { email_verified: true });
  Sheets.insert('Admins', {
    admin_id: Utilities.getUuid(),
    email: adminEmail,
    role: 'ADMIN',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  });

  const adminLoginRes = AuthService.login({ email: adminEmail, password: 'Password123!' });
  const adminToken = JSON.parse(adminLoginRes.getContent()).data.token;

  // Query inactive users via Router
  const reqInactive = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/inactive-users',
        token: adminToken
      })
    }
  };
  const resInactive = Router.handle(reqInactive, 'POST');
  const dataInactive = JSON.parse(resInactive.getContent());
  assert(dataInactive.success, `admin/inactive-users must succeed: ${dataInactive.error?.message}`);
  assert(Array.isArray(dataInactive.data.users), 'Must return users array');

  // Verify all returned users have status INACTIVE and enriched inactivity properties
  if (dataInactive.data.users.length > 0) {
    const sample = dataInactive.data.users[0];
    assert(sample.inactivity_status === 'INACTIVE', 'Sample must have inactivity_status INACTIVE');
    assert(typeof sample.days_inactive === 'number', 'Sample must include numeric days_inactive');
    assert(sample.days_inactive >= 90, 'Sample days_inactive must be >= 90');
  }

  // Filter users by WARNING via admin/users
  const reqWarning = {
    postData: {
      contents: JSON.stringify({
        action: 'admin/users',
        token: adminToken,
        filter: 'WARNING'
      })
    }
  };
  const resWarning = Router.handle(reqWarning, 'POST');
  const dataWarning = JSON.parse(resWarning.getContent());
  assert(dataWarning.success, 'admin/users?filter=WARNING must succeed');
  assert(Array.isArray(dataWarning.data.users), 'Must return users array');
  dataWarning.data.users.forEach(u => {
    assert(u.inactivity_status === 'WARNING', `Filtered user must have WARNING status, got ${u.inactivity_status}`);
    assert(u.days_inactive >= 60 && u.days_inactive < 90, 'WARNING users must have days_inactive between 60 and 90');
  });
});

// Test 68: Non-Destructive Invariant
runTest('Test 68: Non-Destructive Safety Invariant: Automatic inactivity jobs never delete users or ads', () => {
  const usersBefore = memorySheets['Users'].length;
  const adsBefore = memorySheets['Ads'].length;
  const memsBefore = memorySheets['Memberships'].length;

  // Run processInactivity multiple times
  UserActivityService.processInactivity();
  UserActivityService.processInactivity({ role: 'ADMIN', user_id: 'safety_check' });

  const usersAfter = memorySheets['Users'].length;
  const adsAfter = memorySheets['Ads'].length;
  const memsAfter = memorySheets['Memberships'].length;

  assert(usersAfter === usersBefore, `User rows must never be deleted (before: ${usersBefore}, after: ${usersAfter})`);
  assert(adsAfter === adsBefore, `Ad rows must never be deleted (before: ${adsBefore}, after: ${adsAfter})`);
  assert(memsAfter === memsBefore, `Membership rows must never be deleted (before: ${memsBefore}, after: ${memsAfter})`);
});

console.log('\n------------------------------------------------------');
console.log(`  Results: ${passedTests} of ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('------------------------------------------------------\n');

if (passedTests === totalTests) {
  console.log('\x1b[32mAll acceptance test cases PASSED successfully.\x1b[0m\n');
  process.exit(0);
} else {
  console.error('\x1b[31mSome test cases failed.\x1b[0m\n');
  process.exit(1);
}
