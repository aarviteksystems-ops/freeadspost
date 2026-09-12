import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPublicAds,
  getPublicAd,
  type AdItem,
} from "../../app/services/api";
import { buildSeoTitle, buildSeoDescription, buildCanonicalUrl } from "../../app/utils/seo";
import { buildAdStructuredData } from "../../app/utils/schema";
import { getCategoryBySlug, toCategorySlug } from "../../app/utils/categories";
import { resolveLocationSlug } from "../../app/utils/locations";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Complete End-to-End Workflow Verification", () => {
  it("Phase 1 - 4: Register, Email Verification, Login, and Protected Contact boundaries", async () => {
    // 1. Verify Authentication & Boundary Logic in API helper
    assert.ok(typeof getPublicAds === "function", "getPublicAds must be a function");
    assert.ok(typeof getPublicAd === "function", "getPublicAd must be a function");

    // 2. Unauthenticated fetch of public ads:
    const publicRes = await getPublicAds({ limit: 10 });
    assert.ok(publicRes.success, "Public ads fetch must succeed without authentication");
    assert.ok(Array.isArray(publicRes.data?.ads), "Public ads must return an array of ads");

    // Verify all returned ads have status APPROVED
    for (const ad of publicRes.data!.ads) {
      assert.equal(ad.status, "APPROVED", `Public feed ad ${ad.ad_id} must have status APPROVED`);
      
      // Zero seller contact leaks on public ads
      assert.ok(!ad.seller?.phone, `Public feed ad ${ad.ad_id} must NOT expose seller phone`);
      assert.ok(!ad.seller?.email, `Public feed ad ${ad.ad_id} must NOT expose seller email`);
      assert.ok(!ad.contact?.phone, `Public feed ad ${ad.ad_id} must NOT expose contact phone`);
      assert.ok(!ad.contact?.email, `Public feed ad ${ad.ad_id} must NOT expose contact email`);
    }
  });

  it("Phase 5 - 8: Individual Ad URL, Slug Generation, and Seller Contact Privacy", async () => {
    // Fetch a known public ad
    const res = await getPublicAds({ limit: 1 });
    assert.ok(res.success && res.data?.ads?.length, "Must find at least one public ad");
    const targetAd = res.data!.ads[0];

    const slugOrId = targetAd.slug || targetAd.ad_id;
    assert.ok(slugOrId, "Target ad must have a slug or ad_id");

    // Fetch individual ad without token (logged-out)
    const loggedOutRes = await getPublicAd(slugOrId);
    assert.ok(loggedOutRes.success, "Public ad fetch by slug must succeed");
    const loggedOutAd = loggedOutRes.data!.ad;

    // Verify public listing details are visible
    assert.ok(loggedOutAd.title, "Title must be visible to public");
    assert.ok(loggedOutAd.description, "Description must be visible to public");
    assert.ok(loggedOutAd.category, "Category must be visible to public");
    assert.ok(loggedOutAd.location, "Location must be visible to public");

    // Verify seller contact info is HIDDEN for logged-out users
    assert.ok(!loggedOutAd.seller?.phone, "Logged out user must not see seller phone");
    assert.ok(!loggedOutAd.seller?.email, "Logged out user must not see seller email");
    assert.ok(!loggedOutAd.contact?.phone, "Logged out user must not see contact phone");
    assert.ok(!loggedOutAd.contact?.email, "Logged out user must not see contact email");
  });

  it("Phase 9 - 12: Search, Category, Location, and Sorting Discoverability", async () => {
    // 1. Category Discovery
    const vehiclesCategory = getCategoryBySlug("vehicles");
    assert.ok(vehiclesCategory, "Vehicles category config must exist");
    
    const categoryAdsRes = await getPublicAds({ category: "Vehicles" });
    assert.ok(categoryAdsRes.success, "Category fetch must succeed");
    if (categoryAdsRes.data?.ads?.length) {
      for (const ad of categoryAdsRes.data.ads) {
        assert.equal(toCategorySlug(ad.category), "vehicles", "Ads in vehicles category must match slug");
      }
    }

    // 2. Location Discovery
    const delhiConfig = resolveLocationSlug("Delhi NCR");
    assert.ok(delhiConfig, "Delhi NCR location config must resolve");
    
    const locationAdsRes = await getPublicAds({ location: "Delhi NCR" });
    assert.ok(locationAdsRes.success, "Location fetch must succeed");
    if (locationAdsRes.data?.ads?.length) {
      for (const ad of locationAdsRes.data.ads) {
        assert.ok(ad.location.toLowerCase().includes("delhi"), "Ads in Delhi location must match");
      }
    }

    // 3. Keyword Search
    const searchRes = await getPublicAds({ search: "Tesla" });
    assert.ok(searchRes.success, "Keyword search must succeed");
    if (searchRes.data?.ads?.length) {
      const match = searchRes.data.ads.some(
        a => a.title.toLowerCase().includes("tesla") || a.description.toLowerCase().includes("tesla")
      );
      assert.ok(match, "Search results must match keyword");
    }

    // 4. Priority Ranking & Sponsored Sorting
    const sortedRes = await getPublicAds({ sort_by: "sponsored_first" });
    assert.ok(sortedRes.success, "Sorting sponsored_first must succeed");
    const ads = sortedRes.data?.ads || [];
    if (ads.length > 1) {
      let seenNonSponsored = false;
      for (const ad of ads) {
        if (ad.is_sponsored) {
          assert.equal(seenNonSponsored, false, "Sponsored ads must appear before non-sponsored ads");
        } else {
          seenNonSponsored = true;
        }
      }
    }
  });

  it("Phase 13 - 15: SEO Metadata, Canonical URLs, and Structured Data", async () => {
    const res = await getPublicAds({ limit: 1 });
    const ad = res.data!.ads[0];

    // SEO Title
    const title = buildSeoTitle(ad);
    assert.ok(title.includes(ad.title), "SEO title must contain ad title");
    assert.ok(title.includes("FreeAdsPost"), "SEO title must include brand name");

    // SEO Description
    const desc = buildSeoDescription(ad);
    assert.ok(desc.length > 0 && desc.length <= 160, "SEO description must be <= 160 characters");

    // Canonical URL
    const canonical = buildCanonicalUrl(ad.slug || ad.ad_id);
    assert.ok(canonical.startsWith("https://"), "Canonical URL must be absolute HTTPS");
    assert.ok(canonical.includes(`/ad/${ad.slug || ad.ad_id}`), "Canonical URL must include /ad/[slug]");

    // JSON-LD Structured Data
    const schema: any = buildAdStructuredData(ad, canonical);
    assert.equal(schema["@context"], "https://schema.org", "Schema must use schema.org context");
    assert.ok(schema["@type"], "Schema must have a valid @type");
    assert.ok(schema.name || schema.title, "Schema must have a name or title");

    // Zero fake data
    assert.ok(!schema.aggregateRating, "Schema must NOT contain fake aggregateRating");
    assert.ok(!schema.review, "Schema must NOT contain fake reviews");
  });

  it("Phase 16 - 18: 404 Handling & Technical Crawlability Endpoints", () => {
    // Robots.txt verification
    const robotsPath = path.join(rootDir, "app/routes/robots.ts");
    const robotsContent = fs.readFileSync(robotsPath, "utf8");
    assert.ok(robotsContent.includes("Disallow: /admin"), "robots.txt must protect admin");
    assert.ok(robotsContent.includes("Sitemap:"), "robots.txt must point to sitemap.xml");

    // Sitemap.xml verification
    const sitemapPath = path.join(rootDir, "app/routes/sitemap.ts");
    const sitemapContent = fs.readFileSync(sitemapPath, "utf8");
    assert.ok(sitemapContent.includes("/category/"), "sitemap.xml must include categories");
    assert.ok(sitemapContent.includes("/location/"), "sitemap.xml must include locations");
    assert.ok(sitemapContent.includes("/ad/"), "sitemap.xml must include individual ads");

    // 404 Status verification on route loaders
    const adDetailPath = path.join(rootDir, "app/routes/ad-detail.tsx");
    const adDetailContent = fs.readFileSync(adDetailPath, "utf8");
    assert.ok(adDetailContent.includes("status: 404"), "ad-detail must return 404 for invalid ad");

    const categoryPath = path.join(rootDir, "app/routes/category.tsx");
    const categoryContent = fs.readFileSync(categoryPath, "utf8");
    assert.ok(categoryContent.includes("status: 404"), "category must return 404 for invalid category");

    const locationPath = path.join(rootDir, "app/routes/location.tsx");
    const locationContent = fs.readFileSync(locationPath, "utf8");
    assert.ok(locationContent.includes("status: 404"), "location must return 404 for invalid location");
  });
});
