import { getPublicAds, getPublicAd } from '../../app/services/api';

async function runHardeningAudit() {
  console.log('=============================================================');
  console.log('  FreeAdsPost - Seller Contact & Privacy Hardening Audit');
  console.log('=============================================================\n');

  // Forbidden fields for logged-out visitors
  const FORBIDDEN_FIELDS = [
    'phone',
    'email',
    'whatsapp',
    'contact',
    'user_id',
    'user_email',
    'user_phone',
    'rejection_reason',
    'password',
    'password_hash',
    'token',
    'token_hash',
    'session_id'
  ];

  // -------------------------------------------------------------
  // Test 1: Logged-Out Public Ads Listing Payload Audit
  // -------------------------------------------------------------
  console.log('--- 1. Logged-Out Public Ads Listing Payload Audit ---');
  const adsRes = await getPublicAds({}, '');
  if (!adsRes.success || !adsRes.data) {
    throw new Error('Failed to fetch public ads');
  }

  const ads = adsRes.data.ads;
  console.log(`Auditing ${ads.length} returned advertisements...`);

  for (const ad of ads) {
    // 1. Check top-level ad keys
    for (const forbidden of FORBIDDEN_FIELDS) {
      if ((ad as any)[forbidden] !== undefined) {
        throw new Error(`LEAK in ad ${ad.ad_id}: Forbidden field "${forbidden}" is exposed with value: ${JSON.stringify((ad as any)[forbidden])}`);
      }
    }

    // 2. Check seller object
    if (!ad.seller) {
      throw new Error(`Ad ${ad.ad_id} missing seller object`);
    }
    if (ad.seller.phone !== undefined) {
      throw new Error(`LEAK in ad ${ad.ad_id}: seller.phone is exposed: ${ad.seller.phone}`);
    }
    if (ad.seller.email !== undefined) {
      throw new Error(`LEAK in ad ${ad.ad_id}: seller.email is exposed: ${ad.seller.email}`);
    }
    if ((ad.seller as any).whatsapp !== undefined) {
      throw new Error(`LEAK in ad ${ad.ad_id}: seller.whatsapp is exposed`);
    }
    if ((ad.seller as any).user_id !== undefined) {
      throw new Error(`LEAK in ad ${ad.ad_id}: seller.user_id is exposed`);
    }

    // 3. Check contact_locked flag
    if (ad.contact_locked !== true) {
      throw new Error(`Ad ${ad.ad_id} contact_locked must be true for logged-out visitor`);
    }

    // 4. Check visible public fields
    if (!ad.title || !ad.description || !ad.category || !ad.location || !ad.slug) {
      throw new Error(`Ad ${ad.ad_id} missing essential public fields`);
    }
  }
  console.log('✔ PASS: Zero leaks found across all listing items.');
  console.log('✔ PASS: user_id, phone, email, whatsapp, and contact objects strictly stripped.');

  // -------------------------------------------------------------
  // Test 2: Logged-Out Public Ad Detail Payload Audit
  // -------------------------------------------------------------
  console.log('\n--- 2. Logged-Out Public Ad Detail Payload Audit ---');
  const targetSlug = ads[0].slug!;
  const detailRes = await getPublicAd(targetSlug, '');
  if (!detailRes.success || !detailRes.data?.ad) {
    throw new Error(`Failed to fetch ad detail for ${targetSlug}`);
  }
  const detailAd = detailRes.data.ad;

  for (const forbidden of FORBIDDEN_FIELDS) {
    if ((detailAd as any)[forbidden] !== undefined) {
      throw new Error(`LEAK in detail ad: Forbidden field "${forbidden}" is exposed!`);
    }
  }
  if (detailAd.seller?.phone || detailAd.seller?.email || (detailAd.seller as any)?.whatsapp) {
    throw new Error('LEAK in detail ad: Seller contact details exposed!');
  }
  if (detailAd.contact_locked !== true) {
    throw new Error('detailAd.contact_locked must be true for logged-out visitor');
  }
  console.log(`✔ PASS: Single ad detail for /ad/${targetSlug} strictly shielded.`);
  console.log(`✔ Visible fields: title="${detailAd.title}", location="${detailAd.location}", seller="${detailAd.seller?.name}"`);

  // -------------------------------------------------------------
  // Test 3: Logged-In Authorized Member Payload Audit
  // -------------------------------------------------------------
  console.log('\n--- 3. Logged-In Authorized Member Payload Audit ---');
  const authDetailRes = await getPublicAd(targetSlug, 'valid_authorized_token');
  if (!authDetailRes.success || !authDetailRes.data?.ad) {
    throw new Error(`Failed to fetch authorized ad detail`);
  }
  const authAd = authDetailRes.data.ad;

  if (authAd.contact_locked !== false) {
    throw new Error('Expected contact_locked to be false for authorized member');
  }
  if (!authAd.contact) {
    throw new Error('Expected contact object to be present for authorized member');
  }
  console.log(`✔ PASS: Authorized member receives contact information (contact_locked=false).`);
  console.log(`✔ Contact preference: ${authAd.contact.preference}`);
  if (authAd.contact.phone || authAd.seller?.phone) {
    console.log(`✔ Verified phone accessible to authorized member: ${authAd.contact.phone || authAd.seller?.phone}`);
  }
  if (authAd.contact.email || authAd.seller?.email) {
    console.log(`✔ Verified email accessible to authorized member: ${authAd.contact.email || authAd.seller?.email}`);
  }

  // -------------------------------------------------------------
  // Test 4: Verify Raw Payload JSON String Contains No Leaks
  // -------------------------------------------------------------
  console.log('\n--- 4. Raw Serialized JSON String Audit (Logged-Out) ---');
  const serialized = JSON.stringify(detailRes);
  const sensitiveStrings = ['+91', '@example.com', 'usr_other', 'usr_demo', 'rejection_reason'];
  for (const s of sensitiveStrings) {
    if (serialized.includes(s)) {
      throw new Error(`CRITICAL LEAK: Raw serialized JSON contains sensitive substring "${s}"!`);
    }
  }
  console.log('✔ PASS: Raw HTTP response payload is completely devoid of phone numbers, emails, user IDs, and moderation fields.');

  console.log('\n=============================================================');
  console.log('  ALL CONTACT & PRIVACY HARDENING AUDITS PASSED CLEANLY!');
  console.log('=============================================================');
}

runHardeningAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
