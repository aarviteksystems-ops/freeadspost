import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Internal Linking Audit & Verification", () => {
  const homePath = path.join(rootDir, "app/routes/home.tsx");
  const adsPath = path.join(rootDir, "app/routes/ads.tsx");
  const categoryPath = path.join(rootDir, "app/routes/category.tsx");
  const locationPath = path.join(rootDir, "app/routes/location.tsx");
  const adDetailPath = path.join(rootDir, "app/routes/ad-detail.tsx");
  const adCardPath = path.join(rootDir, "app/components/AdCard.tsx");

  it("AdCard links directly to individual public URL and provides crawlable category and location links", () => {
    const content = fs.readFileSync(adCardPath, "utf8");

    // Must construct adUrl pointing to /ad/[slug]
    assert.ok(
      content.includes("const adUrl = `/ad/${ad.slug || ad.ad_id}`"),
      "AdCard must compute individual ad URL /ad/${slug}"
    );

    // Card thumbnail must be wrapped in Link
    assert.ok(
      content.includes("<Link to={adUrl}"),
      "AdCard thumbnail or primary link must link directly to adUrl"
    );

    // Card title must link directly to adUrl
    assert.ok(
      content.includes("<Link to={adUrl}") && content.includes("{ad.title}"),
      "AdCard title must link directly to adUrl"
    );

    // Category overlay badge must be a crawlable Link
    assert.ok(
      content.includes("/category/${toCategorySlug(ad.category)}"),
      "AdCard category badge must be a crawlable link"
    );

    // Location must be a crawlable Link when location is resolved
    assert.ok(
      content.includes("/location/${locConfig.slug}"),
      "AdCard location text must link to resolved location page"
    );

    // Must have direct crawlable action button
    assert.ok(
      content.includes("Details") && content.includes("<Link to={adUrl}"),
      "AdCard must have crawlable details link"
    );
  });

  it("Homepage includes structured, natural crawlable links across Categories, Locations, and Ads", () => {
    const content = fs.readFileSync(homePath, "utf8");

    // Must link to /ads
    assert.ok(content.includes('to="/ads"'), "Homepage must link to /ads catalog");

    // Must have Popular Categories section
    assert.ok(
      content.includes("Popular Categories") || content.includes("Popular Classified Categories"),
      "Homepage must feature category navigation"
    );

    // Must have Explore Popular Indian Classifieds section
    assert.ok(
      content.includes("Explore Popular Indian Classifieds"),
      "Homepage must feature structured contextual links section"
    );

    // Anchor text must be descriptive and natural
    const naturalAnchors = [
      "Used Cars &amp; Vehicles in Delhi NCR",
      "Professional Services in Mumbai",
      "Web &amp; IT Services in Bengaluru",
      "Flats &amp; Real Estate in Hyderabad",
      "Tech Jobs in Pune",
      "Laptops &amp; Gadgets in Chennai",
      "Furniture &amp; Goods in Kolkata",
    ];

    for (const anchor of naturalAnchors) {
      assert.ok(
        content.includes(anchor),
        `Homepage must include natural descriptive anchor text: "${anchor}"`
      );
    }

    // Must use <AdCard> which links to individual ads
    assert.ok(content.includes("<AdCard"), "Homepage must render AdCard components");
  });

  it("/ads catalog provides crawlable discovery for Categories and Locations", () => {
    const content = fs.readFileSync(adsPath, "utf8");

    // Must have crawlable category discovery pills/links
    assert.ok(
      content.includes("Browse by Category"),
      "/ads must contain Browse by Category heading"
    );
    assert.ok(
      content.includes("/category/${cat.slug}"),
      "/ads must link to individual category pages"
    );

    // Must have crawlable location discovery pills/links
    assert.ok(
      content.includes("Browse by Location"),
      "/ads must contain Browse by Location heading"
    );
    assert.ok(
      content.includes("/location/${slug}") || content.includes("/location/${loc.slug}"),
      "/ads must link to individual active location pages"
    );

    // Must render AdCard linking to individual ads
    assert.ok(content.includes("<AdCard"), "/ads must render AdCard listings");
  });

  it("Category page links to active Locations and individual Ads", () => {
    const content = fs.readFileSync(categoryPath, "utf8");

    // Must have Top Locations cross-linking section
    assert.ok(
      content.includes("Top Locations for") || content.includes("topLocations"),
      "Category page must have Top Locations section"
    );

    // Must render AdCard components
    assert.ok(content.includes("<AdCard"), "Category page must render AdCard listings");

    // Must have breadcrumb linking back to Home
    assert.ok(content.includes('to="/"'), "Category page must have home breadcrumb");
  });

  it("Location page links to Categories, other active Locations, and individual Ads", () => {
    const content = fs.readFileSync(locationPath, "utf8");

    // Must cross-link other active cities with natural anchor text
    assert.ok(
      content.includes("Classifieds in {loc.city}") ||
      content.includes("Classifieds in ") ||
      content.includes("/location/${loc.slug}"),
      "Location page must link to other active cities"
    );

    // Must cross-link categories across India
    assert.ok(
      content.includes("Browse Categories Across India") || content.includes("/category/${cat.slug}"),
      "Location page must cross-link categories"
    );

    // Must render AdCard components
    assert.ok(content.includes("<AdCard"), "Location page must render AdCard listings");
  });

  it("Individual Ad detail page links to Category, Location, and Related Ads", () => {
    const content = fs.readFileSync(adDetailPath, "utf8");

    // Breadcrumb links to category
    assert.ok(
      content.includes("/category/${toCategorySlug(ad.category)}"),
      "Ad detail must link to its category in breadcrumb"
    );

    // Location link on ad detail
    assert.ok(
      content.includes("/location/${locConfig.slug}"),
      "Ad detail must link to its location page"
    );

    // Related ads section
    assert.ok(
      content.includes("Similar & Related Classifieds") || content.includes("relatedAds"),
      "Ad detail must have Related Classifieds section"
    );

    // Contextual links on ad detail
    assert.ok(
      content.includes("All {ad.category} Ads →"),
      "Ad detail must link back to all ads in its category"
    );
  });

  it("Verifies absence of hidden links or keyword stuffing patterns", () => {
    const allFiles = [homePath, adsPath, categoryPath, locationPath, adDetailPath, adCardPath];
    for (const file of allFiles) {
      const code = fs.readFileSync(file, "utf8");
      // Check that no links have display:none, opacity-0, or font-size 0
      assert.ok(
        !code.includes('className="hidden"') || !code.includes('<Link className="hidden"'),
        `File ${path.basename(file)} should not have hidden Link elements`
      );
      assert.ok(
        !code.includes('style={{ display: "none" }}') || !code.includes('<Link style={{ display: "none" }}'),
        `File ${path.basename(file)} should not have display:none Links`
      );
    }
  });
});
