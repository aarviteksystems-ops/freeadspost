import { getPublicAds, getPublicAd } from '../../app/services/api';

async function runVerification() {
  console.log('=============================================================');
  console.log('  FreeAdsPost - Public vs Logged-In Browsing Verification');
  console.log('=============================================================\n');

  // -------------------------------------------------------------
  // 1. Logged-Out Visitor Browsing
  // -------------------------------------------------------------
  console.log('--- TEST 1: Browse /ads while Logged Out ---');
  const loggedOutAdsRes = await getPublicAds({}, '');
  if (!loggedOutAdsRes.success || !loggedOutAdsRes.data) {
    throw new Error('FAILED: Logged-out visitor could not fetch ads');
  }
  const ads = loggedOutAdsRes.data.ads;
  console.log(`✔ SUCCESS: Retrieved ${ads.length} active advertisements as a logged-out visitor.`);
  console.log(`✔ Total available: ${loggedOutAdsRes.data.total}, Total pages: ${loggedOutAdsRes.data.total_pages}`);
  console.log(`✔ Available locations: ${loggedOutAdsRes.data.locations?.join(', ') || 'N/A'}`);

  // -------------------------------------------------------------
  // 2. Search, Filters, and Sorting while Logged Out
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Search, Filters & Sort while Logged Out ---');
  
  // Search
  const searchRes = await getPublicAds({ search: 'Tesla' }, '');
  const searchMatched = searchRes.data?.ads.every(a => 
    a.title.toLowerCase().includes('tesla') || a.description.toLowerCase().includes('tesla')
  );
  if (!searchMatched || searchRes.data?.ads.length === 0) {
    throw new Error('FAILED: Search filter failed for logged-out visitor');
  }
  console.log(`✔ SUCCESS: Search "Tesla" returned ${searchRes.data?.ads.length} matching ad(s).`);

  // Category filter
  const catRes = await getPublicAds({ category: 'Vehicles' }, '');
  const catMatched = catRes.data?.ads.every(a => a.category.toLowerCase() === 'vehicles');
  if (!catMatched || catRes.data?.ads.length === 0) {
    throw new Error('FAILED: Category filter failed for logged-out visitor');
  }
  console.log(`✔ SUCCESS: Category "Vehicles" filter returned ${catRes.data?.ads.length} ad(s).`);

  // Location filter
  const locRes = await getPublicAds({ location: 'Delhi' }, '');
  const locMatched = locRes.data?.ads.every(a => a.location.toLowerCase().includes('delhi'));
  if (!locMatched || locRes.data?.ads.length === 0) {
    throw new Error('FAILED: Location filter failed for logged-out visitor');
  }
  console.log(`✔ SUCCESS: Location "Delhi" filter returned ${locRes.data?.ads.length} ad(s).`);

  // Sorting (oldest vs newest)
  const newestRes = await getPublicAds({ sort_by: 'newest' }, '');
  const oldestRes = await getPublicAds({ sort_by: 'oldest' }, '');
  if (newestRes.data?.ads[0].ad_id === oldestRes.data?.ads[0].ad_id && (newestRes.data?.ads.length || 0) > 1) {
    throw new Error('FAILED: Sorting failed');
  }
  console.log(`✔ SUCCESS: Sorting (newest vs oldest) works properly.`);

  // -------------------------------------------------------------
  // 3. Open Single Advertisement while Logged Out
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Open Advertisement while Logged Out ---');
  const targetAdId = ads[0].ad_id;
  const singleAdRes = await getPublicAd(targetAdId, '');
  if (!singleAdRes.success || !singleAdRes.data?.ad) {
    throw new Error(`FAILED: Could not open ad ${targetAdId} as logged-out visitor`);
  }
  const singleAd = singleAdRes.data.ad;
  console.log(`✔ SUCCESS: Opened ad "${singleAd.title}" (ID: ${singleAd.ad_id}).`);

  // -------------------------------------------------------------
  // 4. Confirm Private Seller Data is NOT Exposed in Public API
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Privacy Audit on Public Payloads ---');
  for (const ad of ads) {
    if (ad.contact_locked !== true) {
      throw new Error(`FAILED: contact_locked must be true for ad ${ad.ad_id}`);
    }
    if (ad.seller?.phone) {
      throw new Error(`LEAK: seller.phone exposed on ad ${ad.ad_id}: ${ad.seller.phone}`);
    }
    if (ad.seller?.email) {
      throw new Error(`LEAK: seller.email exposed on ad ${ad.ad_id}: ${ad.seller.email}`);
    }
    if (ad.contact) {
      throw new Error(`LEAK: contact object exposed on ad ${ad.ad_id}`);
    }
    if ((ad as any).user_email) {
      throw new Error(`LEAK: user_email exposed on ad ${ad.ad_id}`);
    }
    if ((ad as any).user_phone) {
      throw new Error(`LEAK: user_phone exposed on ad ${ad.ad_id}`);
    }
  }

  // Check single ad response
  if (singleAd.contact_locked !== true) {
    throw new Error('FAILED: Single ad contact_locked must be true for visitor');
  }
  if (singleAd.seller?.phone || singleAd.seller?.email || singleAd.contact) {
    throw new Error('LEAK: Single ad exposed contact info to visitor');
  }
  console.log('✔ CONFIRMED: No phone numbers exposed in public listings or single ad detail.');
  console.log('✔ CONFIRMED: No email addresses exposed in public listings or single ad detail.');
  console.log('✔ CONFIRMED: No contact objects exposed in public listings or single ad detail.');
  console.log('✔ CONFIRMED: contact_locked is set to true on all public responses.');

  // -------------------------------------------------------------
  // 5. Test /ads and Open Ad while Logged In
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Browse & Open Advertisement while Logged In ---');
  const loggedInAdsRes = await getPublicAds({}, 'mock_valid_session_token');
  if (!loggedInAdsRes.success || !loggedInAdsRes.data) {
    throw new Error('FAILED: Logged-in user could not fetch ads');
  }
  console.log(`✔ SUCCESS: Logged-in user retrieved ${loggedInAdsRes.data.ads.length} advertisements.`);

  const loggedInSingleAdRes = await getPublicAd(targetAdId, 'mock_valid_session_token');
  if (!loggedInSingleAdRes.success || !loggedInSingleAdRes.data?.ad) {
    throw new Error('FAILED: Logged-in user could not open ad detail');
  }
  const authAd = loggedInSingleAdRes.data.ad;
  if (authAd.contact_locked !== false) {
    throw new Error('FAILED: contact_locked should be false for logged-in user');
  }
  if (!authAd.contact && !authAd.seller?.phone && !authAd.seller?.email) {
    throw new Error('FAILED: Contact details should be accessible for logged-in user');
  }
  console.log(`✔ SUCCESS: Contact details unlocked for authenticated user (contact_locked=false).`);
  console.log(`✔ Contact preference: ${authAd.contact?.preference || authAd.contact_preference}`);

  console.log('\n=============================================================');
  console.log('  ALL 5 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!');
  console.log('=============================================================');
}

runVerification().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
