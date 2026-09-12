import { getPublicAds, getPublicAd } from '../../app/services/api';
import {
  getCityFromLocation,
  buildSeoTitle,
  buildSeoDescription,
  buildCanonicalUrl,
  buildAdMetaDescriptors,
  sanitizeForSeoText
} from '../../app/utils/seo';

async function runSeoTests() {
  console.log('=== VERIFYING DYNAMIC SEO METADATA FOR PUBLIC ADS ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
      failed++;
    }
  }

  // 1. Test City extraction
  console.log('--- 1. Location & City Parsing ---');
  assert(getCityFromLocation('Mumbai, Maharashtra') === 'Mumbai', 'Extracts city from "Mumbai, Maharashtra"');
  assert(getCityFromLocation('Bengaluru, Karnataka') === 'Bengaluru', 'Extracts city from "Bengaluru, Karnataka"');
  assert(getCityFromLocation('Delhi NCR') === 'Delhi NCR', 'Extracts city from "Delhi NCR"');
  assert(getCityFromLocation('') === '', 'Handles empty location string gracefully');
  assert(getCityFromLocation(null) === '', 'Handles null location gracefully');

  // 2. Test Title Pattern: {Advertisement Title} in {City} | FreeAdsPost
  console.log('\n--- 2. SEO Title Pattern ---');
  const title1 = buildSeoTitle({
    title: 'Vintage 1974 Fender Stratocaster Sunburst',
    location: 'Mumbai, Maharashtra'
  });
  assert(
    title1 === 'Vintage 1974 Fender Stratocaster Sunburst in Mumbai | FreeAdsPost',
    'Generates "{Title} in {City} | FreeAdsPost" for Mumbai ad',
    title1
  );

  const title2 = buildSeoTitle({
    title: '2022 Tesla Model 3 Long Range AWD',
    location: 'Delhi NCR'
  });
  assert(
    title2 === '2022 Tesla Model 3 Long Range AWD in Delhi NCR | FreeAdsPost',
    'Generates "{Title} in {City} | FreeAdsPost" for Delhi NCR ad',
    title2
  );

  const titleDuplicateCity = buildSeoTitle({
    title: 'Used Honda City 2019 for Sale in Delhi',
    location: 'Delhi, India'
  });
  assert(
    titleDuplicateCity === 'Used Honda City 2019 for Sale in Delhi | FreeAdsPost',
    'Avoids duplicate city if already in title (no "in Delhi in Delhi")',
    titleDuplicateCity
  );

  const titleNoLocation = buildSeoTitle({
    title: 'Professional Graphic Design Services'
  });
  assert(
    titleNoLocation === 'Professional Graphic Design Services | FreeAdsPost',
    'Handles ad without location gracefully',
    titleNoLocation
  );

  // 3. Test Privacy & Contact Stripping in Description
  console.log('\n--- 3. Seller Privacy & Description Sanitization ---');
  const sanitized = sanitizeForSeoText('Call me at +91 9876543210 or email secret@seller.com for details.');
  assert(!sanitized.includes('9876543210'), 'Phone number stripped from SEO text');
  assert(!sanitized.includes('secret@seller.com'), 'Email address stripped from SEO text');
  assert(sanitized.includes('for details.'), 'Legitimate non-contact text preserved');

  // 4. Test Canonical URL Generation
  console.log('\n--- 4. Canonical URL Formatting ---');
  const canonical1 = buildCanonicalUrl('used-honda-city-2019-delhi');
  assert(
    canonical1 === 'https://freeadspost.vercel.app/ad/used-honda-city-2019-delhi',
    'Canonical URL defaults to single preferred public URL'
  );

  const canonicalWithQuery = buildCanonicalUrl('vintage-fender-guitar', 'https://freeadspost.vercel.app/ad/vintage-fender-guitar?ref=social&ad_id=123');
  assert(
    canonicalWithQuery === 'https://freeadspost.vercel.app/ad/vintage-fender-guitar',
    'Canonical URL strips tracking query parameters'
  );

  // 5. Test Live Mock/API Public Ads
  console.log('\n--- 5. Dynamic Metadata on Actual Public Ads ---');
  const adsRes = await getPublicAds({}, '');
  assert(adsRes.success && (adsRes.data?.ads?.length ?? 0) > 0, 'Loaded public advertisements');
  const ads = adsRes.data?.ads || [];

  const generatedTitles = new Set<string>();
  const generatedDescriptions = new Set<string>();
  const generatedCanonicals = new Set<string>();

  for (const ad of ads) {
    const metaList = buildAdMetaDescriptors(ad);

    // Extract tags
    const titleTag = metaList.find((m: any) => 'title' in m) as any;
    const descTag = metaList.find((m: any) => m.name === 'description') as any;
    const canonicalTag = metaList.find((m: any) => m.tagName === 'link' && m.rel === 'canonical') as any;
    const ogTitleTag = metaList.find((m: any) => m.property === 'og:title') as any;
    const ogDescTag = metaList.find((m: any) => m.property === 'og:description') as any;
    const ogUrlTag = metaList.find((m: any) => m.property === 'og:url') as any;
    const ogTypeTag = metaList.find((m: any) => m.property === 'og:type') as any;
    const ogImageTag = metaList.find((m: any) => m.property === 'og:image') as any;

    // Check presence
    assert(!!titleTag?.title, `Ad [${ad.title.slice(0, 20)}...] has title tag`);
    assert(!!descTag?.content, `Ad [${ad.title.slice(0, 20)}...] has description tag`);
    assert(descTag.content.length <= 160, `Ad [${ad.title.slice(0, 20)}...] description length (${descTag.content.length}) is <= 160 chars`);
    assert(!!canonicalTag?.href, `Ad [${ad.title.slice(0, 20)}...] has canonical link`);
    assert(canonicalTag.href.includes(`/ad/${ad.slug}`), `Canonical link points to /ad/${ad.slug}`);
    assert(!!ogTitleTag?.content, `Ad [${ad.title.slice(0, 20)}...] has og:title`);
    assert(!!ogDescTag?.content, `Ad [${ad.title.slice(0, 20)}...] has og:description`);
    assert(!!ogUrlTag?.content, `Ad [${ad.title.slice(0, 20)}...] has og:url`);
    assert(ogTypeTag?.content === 'article', `Ad [${ad.title.slice(0, 20)}...] has og:type "article"`);

    if (ad.image_url) {
      assert(ogImageTag?.content === ad.image_url, `Ad with image has matching og:image`);
    }

    // Check seller privacy
    const serialized = JSON.stringify(metaList);
    assert(!serialized.includes('+91'), `Metadata does not leak phone number`);
    assert(!serialized.includes('@example.com'), `Metadata does not leak email address`);

    generatedTitles.add(titleTag.title);
    generatedDescriptions.add(descTag.content);
    generatedCanonicals.add(canonicalTag.href);
  }

  // 6. Test Uniqueness (Do NOT use the same metadata for every advertisement)
  console.log('\n--- 6. Metadata Uniqueness Across Ads ---');
  assert(
    generatedTitles.size === ads.length,
    `Titles are unique across all advertisements (${generatedTitles.size}/${ads.length})`
  );
  assert(
    generatedDescriptions.size === ads.length,
    `Descriptions are unique across all advertisements (${generatedDescriptions.size}/${ads.length})`
  );
  assert(
    generatedCanonicals.size === ads.length,
    `Canonical URLs are unique across all advertisements (${generatedCanonicals.size}/${ads.length})`
  );

  // 7. Test 404 Fallback
  console.log('\n--- 7. Fallback Metadata for Missing / 404 Ads ---');
  const notFoundMeta = buildAdMetaDescriptors(null);
  const notFoundTitle = notFoundMeta.find((m: any) => 'title' in m) as any;
  const notFoundRobots = notFoundMeta.find((m: any) => m.name === 'robots') as any;
  assert(notFoundTitle?.title?.includes('Not Found'), 'Returns Not Found title for null ad');
  assert(notFoundRobots?.content === 'noindex, nofollow', 'Sets noindex, nofollow for missing ad');

  console.log(`\n========================================`);
  console.log(`TOTAL SEO TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSeoTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
