import { loader as sitemapLoader } from "../../app/routes/sitemap";
import { loader as robotsLoader } from "../../app/routes/robots";
import { SUPPORTED_CATEGORIES } from "../../app/utils/categories";
import { KNOWN_LOCATIONS } from "../../app/utils/locations";
import * as fs from "fs";
import * as path from "path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log("\n=== 1. TESTING DYNAMIC SITEMAP.XML RESOURCE ROUTE ===");

  const fakeRequest = new Request("https://freeadspost.vercel.app/sitemap.xml");
  const sitemapResponse = await sitemapLoader({
    request: fakeRequest,
    params: {},
    context: {},
  } as any);

  assert(sitemapResponse instanceof Response, "Sitemap loader returns a Response object");
  assert(sitemapResponse.status === 200, "Sitemap returns HTTP 200 OK status");

  const contentType = sitemapResponse.headers.get("Content-Type") || "";
  assert(
    contentType.includes("application/xml"),
    `Content-Type header is application/xml (got: ${contentType})`
  );

  const cacheControl = sitemapResponse.headers.get("Cache-Control") || "";
  assert(
    cacheControl.includes("public"),
    `Cache-Control header specifies public caching (got: ${cacheControl})`
  );

  const xmlText = await sitemapResponse.text();
  assert(
    xmlText.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
    "XML starts with valid standard XML declaration"
  );
  assert(
    xmlText.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
    "XML root element is urlset with sitemaps.org namespace"
  );
  assert(xmlText.endsWith("</urlset>"), "XML terminates properly with </urlset>");

  // Extract all <loc> URLs
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  const urls: string[] = [];
  let match;
  while ((match = locRegex.exec(xmlText)) !== null) {
    urls.push(match[1]);
  }

  console.log(`\n  Total URLs found in sitemap: ${urls.length}`);

  // Test Deduplication
  const uniqueUrls = new Set(urls);
  assert(
    uniqueUrls.size === urls.length,
    `Zero duplicate URLs present in sitemap (${uniqueUrls.size} unique / ${urls.length} total)`
  );

  // Test Homepage
  assert(
    urls.includes("https://freeadspost.vercel.app/"),
    "Sitemap includes Homepage (https://freeadspost.vercel.app/)"
  );

  // Test Core Static Public Pages
  assert(
    urls.includes("https://freeadspost.vercel.app/ads"),
    "Sitemap includes Core Ads Browsing page (/ads)"
  );
  assert(
    urls.includes("https://freeadspost.vercel.app/membership"),
    "Sitemap includes Membership Pricing page (/membership)"
  );

  // Test All 8 Supported Categories
  for (const cat of SUPPORTED_CATEGORIES) {
    const catUrl = `https://freeadspost.vercel.app/category/${cat.slug}`;
    assert(
      urls.includes(catUrl),
      `Sitemap includes public category page: /category/${cat.slug}`
    );
  }

  // Test Valid Location Pages (Must have active inventory)
  const expectedActiveLocations = [
    "mumbai",
    "delhi",
    "bengaluru",
    "hyderabad",
    "pune",
    "chennai",
    "kolkata",
  ];

  for (const locSlug of expectedActiveLocations) {
    const locUrl = `https://freeadspost.vercel.app/location/${locSlug}`;
    assert(
      urls.includes(locUrl),
      `Sitemap includes active location hub: /location/${locSlug}`
    );
  }

  // Test That Empty/Zero-Inventory Locations are NOT in Sitemap (Anti-doorway / Anti-thin)
  const emptyLocations = ["noida", "gurgaon", "ahmedabad", "jaipur", "chandigarh"];
  for (const locSlug of emptyLocations) {
    const locUrl = `https://freeadspost.vercel.app/location/${locSlug}`;
    assert(
      !urls.includes(locUrl),
      `Sitemap strictly EXCLUDES empty location page (anti-thin safeguard): /location/${locSlug}`
    );
  }

  // Test Active Advertisement Pages
  const adUrls = urls.filter((u) => u.includes("/ad/"));
  assert(adUrls.length > 0, `Sitemap contains ${adUrls.length} active advertisement URLs`);

  // Verify each ad URL format
  for (const adUrl of adUrls) {
    assert(
      adUrl.startsWith("https://freeadspost.vercel.app/ad/"),
      `Ad URL is well-formed: ${adUrl}`
    );
    assert(
      !adUrl.includes("undefined") && !adUrl.includes("null"),
      `Ad URL has valid slug without undefined/null: ${adUrl}`
    );
  }

  // Test Strict Exclusions
  const disallowedPatterns = [
    "/login",
    "/register",
    "/verify-email",
    "/dashboard",
    "/post-ad",
    "/my-ads",
    "/admin",
  ];

  for (const pattern of disallowedPatterns) {
    const leaked = urls.some((u) => u.includes(pattern));
    assert(!leaked, `Sitemap strictly EXCLUDES private/auth/admin route: ${pattern}`);
  }

  // Test that no query parameters / filter combinations are present
  const hasQueryParams = urls.some((u) => u.includes("?") || u.includes("&"));
  assert(!hasQueryParams, "Sitemap strictly EXCLUDES URLs with query parameters / filter combinations");

  // Test XML Tag Structure on Entries
  assert(xmlText.includes("<changefreq>"), "Sitemap entries include <changefreq> directive");
  assert(xmlText.includes("<priority>"), "Sitemap entries include <priority> directive");
  assert(xmlText.includes("<lastmod>"), "Sitemap entries include <lastmod> date stamp");

  console.log("\n=== 2. TESTING ROBOTS.TXT (STATIC & RESOURCE ROUTE) ===");

  // Check public/robots.txt file
  const robotsFilePath = path.resolve(process.cwd(), "public/robots.txt");
  assert(fs.existsSync(robotsFilePath), "public/robots.txt file exists on filesystem");

  const staticRobotsContent = fs.readFileSync(robotsFilePath, "utf-8");

  // Check robots route module
  const robotsResponse = robotsLoader({
    request: new Request("https://freeadspost.vercel.app/robots.txt"),
    params: {},
    context: {},
  } as any);

  assert(robotsResponse instanceof Response, "Robots loader returns Response object");
  const routeRobotsContent = await robotsResponse.text();

  // Validate directives in both static file and route
  for (const [sourceName, content] of [
    ["public/robots.txt", staticRobotsContent],
    ["app/routes/robots.ts", routeRobotsContent],
  ]) {
    console.log(`\n  Checking ${sourceName}:`);
    assert(content.includes("User-agent: *"), `${sourceName} specifies User-agent: *`);
    assert(content.includes("Allow: /"), `${sourceName} allows root homepage`);
    assert(content.includes("Allow: /ads"), `${sourceName} allows /ads`);
    assert(content.includes("Allow: /category/"), `${sourceName} allows /category/`);
    assert(content.includes("Allow: /location/"), `${sourceName} allows /location/`);
    assert(content.includes("Allow: /ad/"), `${sourceName} allows /ad/ (public advertisements)`);
    assert(content.includes("Allow: /membership"), `${sourceName} allows /membership`);

    // Verify Disallows
    assert(content.includes("Disallow: /admin"), `${sourceName} disallows /admin`);
    assert(content.includes("Disallow: /dashboard"), `${sourceName} disallows /dashboard`);
    assert(content.includes("Disallow: /my-ads"), `${sourceName} disallows /my-ads`);
    assert(content.includes("Disallow: /post-ad"), `${sourceName} disallows /post-ad`);
    assert(content.includes("Disallow: /login"), `${sourceName} disallows /login`);
    assert(content.includes("Disallow: /register"), `${sourceName} disallows /register`);
    assert(content.includes("Disallow: /verify-email"), `${sourceName} disallows /verify-email`);

    // Verify filter parameters disallow
    assert(content.includes("Disallow: /*?*search="), `${sourceName} prevents crawl-budget waste on search queries`);

    // Verify sitemap link
    assert(
      content.includes("Sitemap: https://freeadspost.vercel.app/sitemap.xml"),
      `${sourceName} correctly references https://freeadspost.vercel.app/sitemap.xml`
    );

    // Verify Googlebot is not blocked from public ads
    assert(
      !content.includes("Disallow: /ad/") && !content.includes("Disallow: /ad\n") && !content.includes("Disallow: /ads"),
      `${sourceName} does NOT block crawlers from public ads (/ad/ or /ads)`
    );
  }

  console.log("\n=== 3. TESTING DYNAMIC SITEMAP REVALIDATION (ADD/REMOVE ADS) ===");
  // Test dynamic revalidation by inspecting response generation with modified mock ad set
  const { getStoredMockAds } = await import("../../app/services/api");
  const initialAds = getStoredMockAds();
  console.log(`  Initial mock ads count: ${initialAds.length}`);

  // Simulate an ad created and approved in Gurgaon
  const testGurgaonAd = {
    ad_id: "ad_test_gurgaon_dynamic",
    user_id: "usr_mock_1",
    title: "Luxury Penthouse in DLF Phase 5",
    description: "Exclusive penthouse with terrace garden in DLF Phase 5 Gurgaon.",
    category: "Real Estate",
    price: 45000000,
    location: "Gurgaon, Haryana",
    image_url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    phone: "+91 98765 43210",
    email: "seller@example.com",
    whatsapp: "+91 98765 43210",
    contact_preference: "BOTH" as const,
    is_sponsored: false,
    status: "APPROVED" as const,
    views: 12,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    slug: "luxury-penthouse-in-dlf-phase-5-gurgaon-haryana",
  };

  initialAds.push(testGurgaonAd);

  // Re-request sitemap
  const updatedResponse = await sitemapLoader({
    request: fakeRequest,
    params: {},
    context: {},
  } as any);

  const updatedXml = await updatedResponse.text();
  assert(
    updatedXml.includes("https://freeadspost.vercel.app/ad/luxury-penthouse-in-dlf-phase-5-gurgaon-haryana"),
    "Sitemap dynamically includes newly approved advertisement in real time"
  );
  assert(
    updatedXml.includes("https://freeadspost.vercel.app/location/gurgaon"),
    "Sitemap dynamically unlocks /location/gurgaon once real inventory is present"
  );

  // Now simulate removing/rejecting that ad
  const idx = initialAds.findIndex((a: any) => a.ad_id === "ad_test_gurgaon_dynamic");
  if (idx !== -1) initialAds.splice(idx, 1);

  // Re-request sitemap after removal
  const revertedResponse = await sitemapLoader({
    request: fakeRequest,
    params: {},
    context: {},
  } as any);

  const revertedXml = await revertedResponse.text();
  assert(
    !revertedXml.includes("https://freeadspost.vercel.app/ad/luxury-penthouse-in-dlf-phase-5-gurgaon-haryana"),
    "Sitemap dynamically excludes removed/deleted advertisement"
  );
  assert(
    !revertedXml.includes("https://freeadspost.vercel.app/location/gurgaon"),
    "Sitemap dynamically removes /location/gurgaon when active inventory returns to 0"
  );

  console.log("\n==========================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
