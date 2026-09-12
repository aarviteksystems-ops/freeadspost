import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Technical SEO & Performance Audit Suite", () => {
  const adDetailFile = path.join(rootDir, "app/routes/ad-detail.tsx");
  const categoryFile = path.join(rootDir, "app/routes/category.tsx");
  const locationFile = path.join(rootDir, "app/routes/location.tsx");
  const adCardFile = path.join(rootDir, "app/components/AdCard.tsx");
  const adsFile = path.join(rootDir, "app/routes/ads.tsx");

  it("1. 404 Status Codes: Returns authentic HTTP 404 status on invalid ad, category, or location", () => {
    const adDetailContent = fs.readFileSync(adDetailFile, "utf8");
    const categoryContent = fs.readFileSync(categoryFile, "utf8");
    const locationContent = fs.readFileSync(locationFile, "utf8");

    assert.ok(
      adDetailContent.includes('status: 404'),
      "ad-detail loader must return status: 404 for missing ads to prevent soft 404"
    );

    assert.ok(
      categoryContent.includes('status: 404'),
      "category loader must return status: 404 for unsupported categories"
    );

    assert.ok(
      locationContent.includes('status: 404'),
      "location loader must return status: 404 for unknown locations"
    );
  });

  it("2. Canonical 301 Redirect: Redirects raw ad_id to canonical SEO slug", () => {
    const content = fs.readFileSync(adDetailFile, "utf8");

    assert.ok(
      content.includes("redirect(`/ad/${ad.slug}`, 301)"),
      "ad-detail loader must 301 redirect to canonical slug when ad is accessed via raw ID"
    );
  });

  it("3. LCP & Image Optimization: Ad detail hero image uses eager loading and high priority", () => {
    const detailContent = fs.readFileSync(adDetailFile, "utf8");
    const cardContent = fs.readFileSync(adCardFile, "utf8");

    // Main listing image must be prioritized for LCP
    assert.ok(
      detailContent.includes('loading="eager"'),
      "Main ad hero image must have loading='eager' for optimal LCP"
    );
    assert.ok(
      detailContent.includes('fetchPriority="high"'),
      "Main ad hero image must have fetchPriority='high'"
    );
    assert.ok(
      detailContent.includes('decoding="async"'),
      "Main ad hero image must have decoding='async'"
    );

    // Listing cards in feeds must be lazy loaded
    assert.ok(
      cardContent.includes('loading="lazy"'),
      "AdCard images must be lazy-loaded"
    );
    assert.ok(
      cardContent.includes('decoding="async"'),
      "AdCard images must use async decoding"
    );
  });

  it("4. Layout Shift (CLS) Safeguards: Fixed dimensions/aspect containers wrap all images", () => {
    const cardContent = fs.readFileSync(adCardFile, "utf8");
    const detailContent = fs.readFileSync(adDetailFile, "utf8");

    assert.ok(
      cardContent.includes("h-44") || cardContent.includes("aspect-"),
      "AdCard must specify container height/aspect ratio to prevent CLS"
    );
    assert.ok(
      detailContent.includes("h-64") || detailContent.includes("aspect-"),
      "Ad detail image container must specify height to prevent CLS"
    );
  });

  it("5. Accessibility Basics: Inputs and select controls include descriptive aria-labels", () => {
    const adsContent = fs.readFileSync(adsFile, "utf8");
    const catContent = fs.readFileSync(categoryFile, "utf8");
    const locContent = fs.readFileSync(locationFile, "utf8");

    assert.ok(adsContent.includes('aria-label="Search advertisements'), "ads.tsx search input must have aria-label");
    assert.ok(adsContent.includes('aria-label="Filter by category"'), "ads.tsx category select must have aria-label");
    assert.ok(adsContent.includes('aria-label="Sort advertisements"'), "ads.tsx sort select must have aria-label");

    assert.ok(catContent.includes('aria-label='), "category.tsx must include aria-labels on controls");
    assert.ok(locContent.includes('aria-label='), "location.tsx must include aria-labels on controls");
  });

  it("6. Technical Crawlability: robots.txt and sitemap.xml endpoints are configured and valid", () => {
    const sitemapFile = path.join(rootDir, "app/routes/sitemap.ts");
    const robotsFile = path.join(rootDir, "app/routes/robots.ts");

    assert.ok(fs.existsSync(sitemapFile), "sitemap.xml route must exist");
    assert.ok(fs.existsSync(robotsFile), "robots.txt route must exist");

    const robotsContent = fs.readFileSync(robotsFile, "utf8");
    assert.ok(robotsContent.includes("Sitemap:"), "robots.txt must declare sitemap location");
    assert.ok(robotsContent.includes("Disallow: /admin"), "robots.txt must exclude admin area");
  });
});
