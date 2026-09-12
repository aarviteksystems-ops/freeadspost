import {
  SUPPORTED_CATEGORIES,
  getCategoryBySlug,
  getCategoryByName,
  toCategorySlug,
  buildCategoryCanonicalUrl,
  buildCategoryMetaDescriptors
} from '../../app/utils/categories';
import { getPublicAds } from '../../app/services/api';

async function runCategoryTests() {
  console.log('=== VERIFYING SEO-FRIENDLY CATEGORY PAGES FOUNDATION ===\n');

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

  // 1. Supported Categories Count and Slugs
  console.log('--- 1. Supported Categories Structure ---');
  assert(SUPPORTED_CATEGORIES.length === 8, `Exactly 8 categories supported (${SUPPORTED_CATEGORIES.length}/8)`);

  const expectedSlugs = [
    'vehicles',
    'real-estate',
    'jobs',
    'electronics',
    'services',
    'buy-sell',
    'community',
    'other'
  ];

  for (const slug of expectedSlugs) {
    const cat = getCategoryBySlug(slug);
    assert(!!cat, `Category slug "${slug}" is registered and resolvable`);
    assert(!!cat?.h1, `Category "${slug}" has unique H1 heading: "${cat?.h1}"`);
    assert(!!cat?.metaTitle, `Category "${slug}" has unique meta title: "${cat?.metaTitle}"`);
    assert(!!cat?.metaDescription, `Category "${slug}" has useful meta description`);
    assert(cat?.metaDescription.length! <= 160, `Category "${slug}" description length (${cat?.metaDescription.length}) is <= 160 chars`);
  }

  // 2. Slug & Name Resolution Mapping
  console.log('\n--- 2. Slug and Name Mapping Resolution ---');
  assert(getCategoryByName('Real Estate')?.slug === 'real-estate', 'Resolves "Real Estate" to slug "real-estate"');
  assert(getCategoryByName('Buy & Sell')?.slug === 'buy-sell', 'Resolves "Buy & Sell" to slug "buy-sell"');
  assert(getCategoryByName('Buy / Sell')?.slug === 'buy-sell', 'Resolves "Buy / Sell" to slug "buy-sell"');
  assert(toCategorySlug('Vehicles') === 'vehicles', 'Converts "Vehicles" to "vehicles"');
  assert(toCategorySlug('Real Estate') === 'real-estate', 'Converts "Real Estate" to "real-estate"');
  assert(getCategoryBySlug('INVALID_CAT_123') === undefined, 'Non-existent category returns undefined (no fake pages)');

  // 3. Uniqueness of Category Metadata
  console.log('\n--- 3. Metadata and H1 Uniqueness Across Categories ---');
  const h1Set = new Set(SUPPORTED_CATEGORIES.map((c) => c.h1));
  const titleSet = new Set(SUPPORTED_CATEGORIES.map((c) => c.metaTitle));
  const descSet = new Set(SUPPORTED_CATEGORIES.map((c) => c.metaDescription));
  const slugSet = new Set(SUPPORTED_CATEGORIES.map((c) => c.slug));

  assert(h1Set.size === 8, `All 8 categories have strictly unique H1 headings (${h1Set.size}/8)`);
  assert(titleSet.size === 8, `All 8 categories have strictly unique meta titles (${titleSet.size}/8)`);
  assert(descSet.size === 8, `All 8 categories have strictly unique meta descriptions (${descSet.size}/8)`);
  assert(slugSet.size === 8, `All 8 categories have strictly unique slugs (${slugSet.size}/8)`);

  // 4. Meta Descriptors Output Verification
  console.log('\n--- 4. React Router Meta Descriptors Generation ---');
  for (const cat of SUPPORTED_CATEGORIES) {
    const metaList = buildCategoryMetaDescriptors(cat);
    const titleTag = metaList.find((m: any) => 'title' in m) as any;
    const descTag = metaList.find((m: any) => m.name === 'description') as any;
    const canonicalTag = metaList.find((m: any) => m.tagName === 'link' && m.rel === 'canonical') as any;
    const ogTitle = metaList.find((m: any) => m.property === 'og:title') as any;
    const ogDesc = metaList.find((m: any) => m.property === 'og:description') as any;
    const ogUrl = metaList.find((m: any) => m.property === 'og:url') as any;
    const ogType = metaList.find((m: any) => m.property === 'og:type') as any;

    assert(titleTag?.title === cat.metaTitle, `[${cat.slug}] title tag matches metaTitle`);
    assert(descTag?.content === cat.metaDescription, `[${cat.slug}] description tag matches metaDescription`);
    assert(canonicalTag?.href.includes(`/category/${cat.slug}`), `[${cat.slug}] canonical link points to /category/${cat.slug}`);
    assert(ogTitle?.content === cat.metaTitle, `[${cat.slug}] og:title matches`);
    assert(ogDesc?.content === cat.metaDescription, `[${cat.slug}] og:description matches`);
    assert(ogUrl?.content === canonicalTag?.href, `[${cat.slug}] og:url matches canonical URL`);
    assert(ogType?.content === 'website', `[${cat.slug}] og:type is "website"`);
  }

  // 5. Querying Real Active Advertisements by Category
  console.log('\n--- 5. Real Advertisements by Category & Crawlable Links ---');
  const testCategories = ['Vehicles', 'Real Estate', 'Jobs', 'Electronics', 'Services', 'Buy & Sell'];

  for (const catName of testCategories) {
    const res = await getPublicAds({ category: catName });
    assert(res.success, `API query for category "${catName}" succeeded`);
    const ads = res.data?.ads || [];
    assert(ads.length > 0, `Category "${catName}" returned real active ads (${ads.length} ads)`);

    for (const ad of ads) {
      assert(
        ad.status === 'APPROVED',
        `Ad [${ad.title.slice(0, 18)}...] in category "${catName}" is strictly APPROVED`
      );
      assert(
        !!ad.slug,
        `Ad [${ad.title.slice(0, 18)}...] has crawlable slug: /ad/${ad.slug}`
      );
    }
  }

  // 6. Search and Filter within Category
  console.log('\n--- 6. Search and Filter Functionality within Category ---');
  const searchWithinCatRes = await getPublicAds({ category: 'Vehicles', search: 'Tesla' });
  assert(
    searchWithinCatRes.success && (searchWithinCatRes.data?.ads?.length || 0) > 0,
    'Search for "Tesla" within "Vehicles" returned matching ad'
  );
  assert(
    Boolean(searchWithinCatRes.data?.ads.every((a) => a.category.toLowerCase() === 'vehicles')),
    'All returned search results strictly remain in category "Vehicles"'
  );

  const locWithinCatRes = await getPublicAds({ category: 'Services', location: 'Mumbai' });
  assert(
    locWithinCatRes.success && (locWithinCatRes.data?.ads?.length || 0) > 0,
    'Location filter "Mumbai" within "Services" returned matching ads'
  );
  assert(
    Boolean(locWithinCatRes.data?.ads.every((a) => a.location.toLowerCase().includes('mumbai'))),
    'All returned location results strictly match "Mumbai"'
  );

  // 7. Negative / Unsupported Category 404 Metadata
  console.log('\n--- 7. Unsupported Category 404 Metadata Fallback ---');
  const missingCatMeta = buildCategoryMetaDescriptors(null);
  const notFoundTitle = missingCatMeta.find((m: any) => 'title' in m) as any;
  const notFoundRobots = missingCatMeta.find((m: any) => m.name === 'robots') as any;
  assert(notFoundTitle?.title?.includes('Not Found'), 'Returns "Category Not Found" title for invalid category');
  assert(notFoundRobots?.content === 'noindex, nofollow', 'Sets "noindex, nofollow" for non-existent category');

  console.log(`\n========================================`);
  console.log(`TOTAL CATEGORY TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCategoryTests().catch((err) => {
  console.error('Fatal category test error:', err);
  process.exit(1);
});
