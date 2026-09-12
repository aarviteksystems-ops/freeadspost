import {
  KNOWN_LOCATIONS,
  getLocationBySlug,
  getLocationFromAdLocation,
  buildLocationCanonicalUrl,
  buildLocationMetaDescriptors
} from '../../app/utils/locations';
import { getPublicAds } from '../../app/services/api';

async function runLocationTests() {
  console.log('=== VERIFYING LOCATION-BASED SEO PAGES & INVENTORY ===\n');

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

  // 1. Structure of Location Definitions
  console.log('--- 1. Location Configuration & Routing ---');
  const slugs = ['mumbai', 'delhi', 'bengaluru', 'hyderabad', 'pune', 'chennai', 'kolkata', 'gurgaon', 'noida'];
  for (const slug of slugs) {
    const loc = getLocationBySlug(slug);
    assert(!!loc, `Location slug "${slug}" is registered`);
    assert(!!loc?.h1, `Location "${slug}" has unique H1 heading: "${loc?.h1}"`);
    assert(!!loc?.metaTitle, `Location "${slug}" has unique meta title: "${loc?.metaTitle}"`);
    assert(!!loc?.metaDescription, `Location "${slug}" has useful meta description`);
    assert(loc?.metaDescription.length! <= 160, `Location "${slug}" description length (${loc?.metaDescription.length}) is <= 160 chars`);
  }

  // 2. Location String Resolution from Actual Ad Records
  console.log('\n--- 2. Resolution from Real Ad Location Strings ---');
  assert(getLocationFromAdLocation('Mumbai, Maharashtra')?.slug === 'mumbai', 'Resolves "Mumbai, Maharashtra" -> mumbai');
  assert(getLocationFromAdLocation('Delhi NCR')?.slug === 'delhi', 'Resolves "Delhi NCR" -> delhi');
  assert(getLocationFromAdLocation('Bengaluru, Karnataka')?.slug === 'bengaluru', 'Resolves "Bengaluru, Karnataka" -> bengaluru');
  assert(getLocationFromAdLocation('Hyderabad, Telangana')?.slug === 'hyderabad', 'Resolves "Hyderabad, Telangana" -> hyderabad');
  assert(getLocationFromAdLocation('Pune, Maharashtra')?.slug === 'pune', 'Resolves "Pune, Maharashtra" -> pune');
  assert(getLocationFromAdLocation('Chennai, Tamil Nadu')?.slug === 'chennai', 'Resolves "Chennai, Tamil Nadu" -> chennai');
  assert(getLocationFromAdLocation('Kolkata, West Bengal')?.slug === 'kolkata', 'Resolves "Kolkata, West Bengal" -> kolkata');

  // 3. Uniqueness of Headings and Titles
  console.log('\n--- 3. Metadata and H1 Uniqueness Across Locations ---');
  const h1Set = new Set(KNOWN_LOCATIONS.map((l) => l.h1));
  const titleSet = new Set(KNOWN_LOCATIONS.map((l) => l.metaTitle));
  const descSet = new Set(KNOWN_LOCATIONS.map((l) => l.metaDescription));
  assert(h1Set.size === KNOWN_LOCATIONS.length, `All ${h1Set.size} locations have unique H1 headings`);
  assert(titleSet.size === KNOWN_LOCATIONS.length, `All ${titleSet.size} locations have unique meta titles`);
  assert(descSet.size === KNOWN_LOCATIONS.length, `All ${descSet.size} locations have unique meta descriptions`);

  // 4. Inventory Audit: Indexable Locations vs Anti-Doorway (Noindex) Locations
  console.log('\n--- 4. Inventory Audit & Indexability Protection ---');
  const indexableLocations: { slug: string; city: string; count: number }[] = [];
  const noindexLocations: { slug: string; city: string; count: number }[] = [];

  for (const loc of KNOWN_LOCATIONS) {
    const res = await getPublicAds({ location: loc.city });
    const count = res.data?.ads?.length || 0;
    const metaList = buildLocationMetaDescriptors(loc, count);
    const robotsTag = metaList.find((m: any) => m.name === 'robots') as any;

    if (count > 0) {
      assert(robotsTag?.content === 'index, follow', `[${loc.slug}] Has ${count} ads -> INDEXABLE (index, follow)`);
      indexableLocations.push({ slug: loc.slug, city: loc.city, count });
    } else {
      assert(robotsTag?.content === 'noindex, follow', `[${loc.slug}] Has 0 ads -> PROTECTED (noindex, follow) against thin doorway penalty`);
      noindexLocations.push({ slug: loc.slug, city: loc.city, count });
    }
  }

  console.log(`\n📊 Inventory Summary:`);
  console.log(`   - Safely Indexable Locations (${indexableLocations.length}):`, indexableLocations.map((l) => `${l.city} (${l.count})`).join(', '));
  console.log(`   - Protected Empty Locations (${noindexLocations.length}):`, noindexLocations.map((l) => l.city).join(', '));

  assert(indexableLocations.length >= 6, `At least 6 metropolitan hubs have active indexable inventory (${indexableLocations.length} active)`);

  // 5. Crawlable Links to Individual Ads on Location Pages
  console.log('\n--- 5. Crawlable Links to Individual Advertisements ---');
  for (const loc of indexableLocations) {
    const res = await getPublicAds({ location: loc.city });
    const ads = res.data?.ads || [];
    for (const ad of ads) {
      assert(!!ad.slug, `[${loc.city}] Ad "${ad.title.slice(0, 18)}..." has crawlable slug /ad/${ad.slug}`);
      assert(ad.status === 'APPROVED', `[${loc.city}] Ad is strictly APPROVED`);
    }
  }

  // 6. Search and Filter within Location
  console.log('\n--- 6. Search & Filter within Location ---');
  const mumbaiRes = await getPublicAds({ location: 'Mumbai', search: 'Photography' });
  assert(
    mumbaiRes.success && (mumbaiRes.data?.ads?.length || 0) > 0,
    'Search for "Photography" in Mumbai returned matching ad'
  );
  assert(
    Boolean(mumbaiRes.data?.ads?.every((a) => a.location.toLowerCase().includes('mumbai'))),
    'All returned search results strictly remain in Mumbai'
  );

  // 7. Non-Existent Location 404 Metadata
  console.log('\n--- 7. Non-Existent Location Fallback ---');
  const notFoundMeta = buildLocationMetaDescriptors(null, 0);
  const notFoundTitle = notFoundMeta.find((m: any) => 'title' in m) as any;
  const notFoundRobots = notFoundMeta.find((m: any) => m.name === 'robots') as any;
  assert(notFoundTitle?.title?.includes('Not Found'), 'Returns "Location Not Found" title for invalid location');
  assert(notFoundRobots?.content === 'noindex, nofollow', 'Sets "noindex, nofollow" for non-existent location');

  console.log(`\n========================================`);
  console.log(`TOTAL LOCATION TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runLocationTests().catch((err) => {
  console.error('Fatal location test error:', err);
  process.exit(1);
});
