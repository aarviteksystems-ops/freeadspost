/**
 * FreeAds Post - In-GAS Automated Test Suite
 * 
 * Can be executed directly in the Google Apps Script script editor
 * by selecting `runAuthTestSuite` and clicking Run.
 * 
 * Verifies all 7 core scenarios:
 * 1. Duplicate email rejection
 * 2. Invalid email format rejection
 * 3. Weak password rejection
 * 4. Successful registration
 * 5. Expired verification token rejection
 * 6. Reused verification token rejection
 * 7. Successful verification
 */

function runAuthTestSuite() {
  Logger.log('=== FreeAds Post Auth Test Suite Starting ===');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      Logger.log(`[PASS] ${message}`);
      passed++;
    } else {
      Logger.log(`[FAIL] ${message}`);
      failed++;
    }
  }

  const testEmail = `test_${Date.now()}@example.com`;
  let verificationRawToken = null;

  // Test 2: Invalid email rejection
  Logger.log('\n--- Running Test 2: Invalid Email ---');
  const resInvalidEmail = AuthService.register({
    name: 'Test User',
    email: 'not-an-email',
    phone: '+15551234567',
    password: 'Password123!'
  });
  const dataInvalidEmail = JSON.parse(resInvalidEmail.getContent());
  assert(!dataInvalidEmail.success && dataInvalidEmail.error.code === 'INVALID_EMAIL', 'Rejected invalid email format');

  // Test 3: Weak password rejection
  Logger.log('\n--- Running Test 3: Weak Password ---');
  const resWeakPass = AuthService.register({
    name: 'Test User',
    email: 'valid@example.com',
    phone: '+15551234567',
    password: 'short'
  });
  const dataWeakPass = JSON.parse(resWeakPass.getContent());
  assert(!dataWeakPass.success && dataWeakPass.error.code === 'WEAK_PASSWORD', 'Rejected password under 8 characters');

  // Test 4: Successful registration
  Logger.log('\n--- Running Test 4: Successful Registration ---');
  // Enable debug token for test inspection
  Config.set('EXPOSE_DEBUG_TOKENS', 'true');
  const resSuccessReg = AuthService.register({
    name: 'Alice Johnson',
    email: testEmail,
    phone: '+15551234567',
    company_name: 'Acme Test Corp',
    password: 'SecurePassword123'
  });
  const dataSuccessReg = JSON.parse(resSuccessReg.getContent());
  assert(dataSuccessReg.success && dataSuccessReg.statusCode === 201, 'Registration returns 201 success');
  assert(dataSuccessReg.data.user.email === testEmail, 'User record created with correct email');
  assert(dataSuccessReg.data.user.email_verified === false, 'User email_verified is false initially');
  assert(!dataSuccessReg.data.user.password_hash, 'Password hash is NOT exposed in response');

  verificationRawToken = dataSuccessReg.data.debugToken;

  // Verify token was stored hashed in EmailVerification sheet
  const tokenRecord = Sheets.findOne('EmailVerification', function(t) {
    return t.email === testEmail;
  });
  assert(tokenRecord !== null, 'Token record exists in EmailVerification sheet');
  assert(tokenRecord.token_hash === Auth.hashToken(verificationRawToken), 'Token is stored hashed');
  assert(tokenRecord.used === false || tokenRecord.used === 'FALSE', 'Token used flag is false initially');

  // Test 1: Duplicate email rejection
  Logger.log('\n--- Running Test 1: Duplicate Email ---');
  const resDupEmail = AuthService.register({
    name: 'Alice Duplicate',
    email: testEmail,
    phone: '+15559876543',
    password: 'AnotherPassword456'
  });
  const dataDupEmail = JSON.parse(resDupEmail.getContent());
  assert(!dataDupEmail.success && dataDupEmail.error.code === 'EMAIL_ALREADY_EXISTS', 'Rejected duplicate registration with 409');

  // Test 5: Expired verification token rejection
  Logger.log('\n--- Running Test 5: Expired Token ---');
  const expiredRawToken = 'expired_raw_token_' + Utilities.getUuid();
  const expiredHash = Auth.hashToken(expiredRawToken);
  const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
  Sheets.insert('EmailVerification', {
    token_id: Sheets.generateId('tok'),
    user_id: 'usr_mock_expired',
    email: 'mock_expired@example.com',
    token_hash: expiredHash,
    expires_at: pastDate,
    used: false,
    created_at: pastDate
  });
  const resExpired = AuthService.verifyEmail(expiredRawToken);
  const dataExpired = JSON.parse(resExpired.getContent());
  assert(!dataExpired.success && dataExpired.error.code === 'TOKEN_EXPIRED', 'Rejected expired token with TOKEN_EXPIRED');

  // Test 7: Successful email verification
  Logger.log('\n--- Running Test 7: Successful Verification ---');
  const resVerifySuccess = AuthService.verifyEmail(verificationRawToken);
  const dataVerifySuccess = JSON.parse(resVerifySuccess.getContent());
  assert(dataVerifySuccess.success, 'Verification returned success');
  assert(dataVerifySuccess.data.verified === true, 'Response verified flag is true');

  const verifiedUser = Sheets.findByKey('Users', 'email', testEmail);
  assert(verifiedUser && (verifiedUser.email_verified === true || verifiedUser.email_verified === 'TRUE'), 'User email_verified updated to true in Users sheet');

  // Test 6: Reused verification token rejection
  Logger.log('\n--- Running Test 6: Reused Token ---');
  const resReused = AuthService.verifyEmail(verificationRawToken);
  const dataReused = JSON.parse(resReused.getContent());
  assert(!dataReused.success && dataReused.error.code === 'TOKEN_ALREADY_USED', 'Rejected reused token with TOKEN_ALREADY_USED');

  // Test 8: Unverified login rejection
  Logger.log('\n--- Running Test 8: Unverified Login ---');
  const unverifiedEmail = `unverified_${Date.now()}@example.com`;
  AuthService.register({
    name: 'Unverified Test',
    email: unverifiedEmail,
    phone: '+15551234567',
    password: 'Password123!'
  });
  const resUnverifiedLogin = AuthService.login({
    email: unverifiedEmail,
    password: 'Password123!'
  });
  const dataUnverifiedLogin = JSON.parse(resUnverifiedLogin.getContent());
  assert(!dataUnverifiedLogin.success && dataUnverifiedLogin.error.code === 'EMAIL_NOT_VERIFIED', 'Rejected unverified account login');

  // Test 9: Wrong password & email enumeration protection
  Logger.log('\n--- Running Test 9: Wrong Password ---');
  const resWrongPass = AuthService.login({
    email: testEmail,
    password: 'WrongPassword999!'
  });
  const dataWrongPass = JSON.parse(resWrongPass.getContent());
  assert(!dataWrongPass.success && dataWrongPass.error.code === 'INVALID_CREDENTIALS', 'Rejected wrong password with INVALID_CREDENTIALS');

  const resGhostUser = AuthService.login({
    email: 'ghost_nonexistent@example.com',
    password: 'SomePassword123!'
  });
  const dataGhostUser = JSON.parse(resGhostUser.getContent());
  assert(!dataGhostUser.success && dataGhostUser.error.code === 'INVALID_CREDENTIALS', 'Non-existent email returns identical error code');
  assert(dataWrongPass.error.message === dataGhostUser.error.message, 'Generic error message prevents email enumeration');

  // Test 10: Valid login
  Logger.log('\n--- Running Test 10: Valid Login ---');
  const resValidLogin = AuthService.login({
    email: testEmail,
    password: 'SecurePassword123'
  });
  const dataValidLogin = JSON.parse(resValidLogin.getContent());
  assert(dataValidLogin.success && dataValidLogin.statusCode === 200, 'Login succeeded with 200');
  assert(dataValidLogin.data.token && dataValidLogin.data.token.length === 64, 'Issued 64-char session token');
  assert(!dataValidLogin.data.user.password_hash, 'Password hash is NOT exposed in response');

  const activeToken = dataValidLogin.data.token;
  const userAfterLogin = Sheets.findByKey('Users', 'email', testEmail);
  assert(userAfterLogin.last_login && userAfterLogin.last_login.length > 10, 'last_login timestamp was updated');

  // Test 11: Logout
  Logger.log('\n--- Running Test 11: Logout ---');
  const resLogout = AuthService.logout(activeToken, userAfterLogin.user_id);
  const dataLogout = JSON.parse(resLogout.getContent());
  assert(dataLogout.success, 'Logout returned success');

  const tokenHash = Auth.hashToken(activeToken);
  const sessionAfterLogout = Sheets.findOne('Sessions', function(s) {
    return s.token_hash === tokenHash;
  });
  assert(sessionAfterLogout === null, 'Session record invalidated in Sessions sheet');

  // Test 12: Expired session
  Logger.log('\n--- Running Test 12: Expired Session ---');
  const expiredSessionToken = 'expired_session_' + Utilities.getUuid();
  const expiredSessionHash = Auth.hashToken(expiredSessionToken);
  const pastSessionDate = new Date(Date.now() - 3600000).toISOString();
  Sheets.insert('Sessions', {
    session_id: Sheets.generateId('ses'),
    token_hash: expiredSessionHash,
    user_id: userAfterLogin.user_id,
    role: userAfterLogin.role,
    expires_at: pastSessionDate,
    created_at: pastSessionDate
  });
  const resExpiredSession = Router.handle({
    postData: { contents: JSON.stringify({ action: 'current-user', token: expiredSessionToken }) }
  }, 'POST');
  const dataExpiredSession = JSON.parse(resExpiredSession.getContent());
  assert(!dataExpiredSession.success && dataExpiredSession.error.code === 'SESSION_EXPIRED', 'Rejected expired session');

  // Test 13: Unauthorized API request
  Logger.log('\n--- Running Test 13: Unauthorized Request ---');
  const resNoAuth = Router.handle({
    postData: { contents: JSON.stringify({ action: 'current-user' }) }
  }, 'POST');
  const dataNoAuth = JSON.parse(resNoAuth.getContent());
  assert(!dataNoAuth.success && dataNoAuth.statusCode === 401, 'Rejected unauthenticated request with 401');

  // Test 14: Protected page access & Admin authorization
  Logger.log('\n--- Running Test 14: Protected & Admin Authorization ---');
  const resRelogin = AuthService.login({ email: testEmail, password: 'SecurePassword123' });
  const freshUserToken = JSON.parse(resRelogin.getContent()).data.token;

  const resAdminDenied = Router.handle({
    postData: { contents: JSON.stringify({ action: 'admin/approve-ad', token: freshUserToken, ad_id: 'ad_123' }) }
  }, 'POST');
  const dataAdminDenied = JSON.parse(resAdminDenied.getContent());
  assert(!dataAdminDenied.success && dataAdminDenied.statusCode === 403, 'Regular user rejected from admin endpoint with 403');

  Logger.log(`\n=== Test Suite Finished: ${passed} PASSED, ${failed} FAILED ===`);
  return { passed: passed, failed: failed };
}
