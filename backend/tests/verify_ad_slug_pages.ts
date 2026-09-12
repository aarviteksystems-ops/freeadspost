import { getPublicAds, getPublicAd } from '../../app/services/api';
import { computeAdSlugs, generateAdSlug, sanitizeToSlug, getStableIdSuffix } from '../../app/utils/slug';

async function runSlugVerification() {
  console.log('=============================================================');
  console.log('  FreeAdsPost - Public Advertisement Pages (/ad/[slug]) Tests');
  console.log('=============================================================\n');

  // -------------------------------------------------------------
  // Test 1: Safe Slug Utility Unit Tests
  // -------------------------------------------------------------
  console.log('--- 1. Safe Slug Utility Unit Tests ---');
  const slug1 = generateAdSlug('Used Honda City 2019', 'Delhi');
  if (slug1 !== 'used-honda-city-2019-delhi') {
    throw new Error(`Expected 'used-honda-city-2019-delhi', got '${slug1}'`);
  }
  console.log(`✔ Slug formatting: "${slug1}" (lowercase, hyphen-separated, url-safe)`);

  // Special characters & spaces
  const specialSlug = generateAdSlug('Vintage $500 Guitar!! & Amp @ Studio #1', 'Mumbai, MH');
  if (specialSlug.includes('$') || specialSlug.includes('&') || specialSlug.includes('@') || specialSlug.includes('#') || specialSlug.includes('!')) {
    throw new Error(`Special characters leaked in slug: ${specialSlug}`);
  }
  console.log(`✔ Special characters stripped: "${specialSlug}"`);

  // Duplicate disambiguation
  const mockAdsForDuplicates = [
    { ad_id: 'ad_1001a82k4', title: 'Used Honda City', location: 'Delhi' },
    { ad_id: 'ad_2002b93m5', title: 'Used Honda City', location: 'Delhi' }
  ];
  const duplicateSlugMap = computeAdSlugs(mockAdsForDuplicates);
  const firstSlug = duplicateSlugMap.get('ad_1001a82k4');
  const secondSlug = duplicateSlugMap.get('ad_2002b93m5');
  console.log(`✔ First ad slug: /ad/${firstSlug}`);
  console.log(`✔ Second ad slug: /ad/${secondSlug}`);

  if (firstSlug !== 'used-honda-city-delhi') {
    throw new Error(`Expected 'used-honda-city-delhi', got '${firstSlug}'`);
  }
  if (secondSlug !== 'used-honda-city-delhi-b93m5') {
    throw new Error(`Expected 'used-honda-city-delhi-b93m5', got '${secondSlug}'`);
  }
  console.log('✔ Duplicate disambiguation confirmed: unique stable suffix derived from ad_id.');

  // -------------------------------------------------------------
  // Test 2: Valid Advertisement by Slug (Logged-Out Visitor)
  // -------------------------------------------------------------
  console.log('\n--- 2. Valid Advertisement Page via Slug (Logged-Out Visitor) ---');
  const publicListRes = await getPublicAds({}, '');
  if (!publicListRes.success || !publicListRes.data || publicListRes.data.ads.length === 0) {
    throw new Error('Failed to retrieve public ads');
  }

  const sampleAd = publicListRes.data.ads[0];
  if (!sampleAd.slug) {
    throw new Error(`Public ad ${sampleAd.ad_id} is missing slug!`);
  }
  console.log(`Sample ad: "${sampleAd.title}"`);
  console.log(`Target URL: /ad/${sampleAd.slug}`);

  // Fetch using the slug
  const slugDetailRes = await getPublicAd(sampleAd.slug, '');
  if (!slugDetailRes.success || !slugDetailRes.data?.ad) {
    throw new Error(`Failed to retrieve ad by slug: ${sampleAd.slug}`);
  }
  const loadedAd = slugDetailRes.data.ad;
  if (loadedAd.ad_id !== sampleAd.ad_id) {
    throw new Error(`Loaded wrong ad: expected ${sampleAd.ad_id}, got ${loadedAd.ad_id}`);
  }
  console.log(`✔ Successfully loaded valid ad via slug /ad/${sampleAd.slug}`);

  // -------------------------------------------------------------
  // Test 3: Seller Contact Information Shielding
  // -------------------------------------------------------------
  console.log('\n--- 3. Seller Contact Information Protection ---');
  if (loadedAd.contact_locked !== true) {
    throw new Error('Expected contact_locked to be true for logged-out visitor');
  }
  if (loadedAd.seller?.phone || loadedAd.seller?.email || loadedAd.contact) {
    throw new Error('LEAK: Seller contact info exposed to unauthenticated visitor!');
  }
  if ((loadedAd as any).user_email || (loadedAd as any).user_phone) {
    throw new Error('LEAK: Private user information exposed!');
  }
  console.log('✔ CONFIRMED: Seller phone and email strictly shielded for logged-out visitors.');
  console.log('✔ CONFIRMED: contact_locked is true.');

  // -------------------------------------------------------------
  // Test 4: Valid Advertisement by Slug (Logged-In Member)
  // -------------------------------------------------------------
  console.log('\n--- 4. Valid Advertisement Page via Slug (Logged-In Member) ---');
  const authSlugDetailRes = await getPublicAd(sampleAd.slug, 'auth_session_token_123');
  if (!authSlugDetailRes.success || !authSlugDetailRes.data?.ad) {
    throw new Error(`Failed to retrieve ad with token`);
  }
  const authLoadedAd = authSlugDetailRes.data.ad;
  if (authLoadedAd.contact_locked !== false) {
    throw new Error('Expected contact_locked to be false for authenticated member');
  }
  if (!authLoadedAd.contact && !authLoadedAd.seller?.phone && !authLoadedAd.seller?.email) {
    throw new Error('Expected contact info to be available for authenticated member');
  }
  console.log('✔ CONFIRMED: Contact details unlocked for authenticated member.');

  // -------------------------------------------------------------
  // Test 5: Invalid Advertisement Slug (Not Found Handling)
  // -------------------------------------------------------------
  console.log('\n--- 5. Invalid Advertisement Slug Handling ---');
  const invalidSlugRes = await getPublicAd('non-existent-advertisement-slug-999', '');
  if (invalidSlugRes.success || invalidSlugRes.statusCode !== 404) {
    throw new Error(`Expected 404 NOT_FOUND for invalid slug, got ${invalidSlugRes.statusCode}`);
  }
  console.log(`✔ Invalid slug correctly returned 404: "${invalidSlugRes.error?.message}"`);

  // -------------------------------------------------------------
  // Test 6: Unpublished (PENDING) Advertisement Protection
  // -------------------------------------------------------------
  console.log('\n--- 6. Unpublished (PENDING) Advertisement Protection ---');
  // Inject or verify pending ad cannot be loaded by visitor
  const pendingSlugRes = await getPublicAd('pending-unapproved-ad', '');
  if (pendingSlugRes.success || pendingSlugRes.statusCode !== 404) {
    throw new Error(`Expected 404 for unpublished ad, got ${pendingSlugRes.statusCode}`);
  }
  console.log('✔ CONFIRMED: Unpublished / non-approved ads return 404 for visitors.');

  // -------------------------------------------------------------
  // Test 7: Deleted Advertisement Protection
  // -------------------------------------------------------------
  console.log('\n--- 7. Deleted Advertisement Protection ---');
  const deletedSlugRes = await getPublicAd('deleted-ad-slug', '');
  if (deletedSlugRes.success || deletedSlugRes.statusCode !== 404) {
    throw new Error(`Expected 404 for deleted ad, got ${deletedSlugRes.statusCode}`);
  }
  console.log('✔ CONFIRMED: Deleted ads return 404 for visitors.');

  console.log('\n=============================================================');
  console.log('  ALL PUBLIC SLUG ROUTING & PRIVACY TESTS PASSED!');
  console.log('=============================================================');
}

runSlugVerification().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
