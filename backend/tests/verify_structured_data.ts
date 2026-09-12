import {
  buildWebSiteSchema,
  buildOrganizationSchema,
  buildBreadcrumbSchema,
  buildCategoryCollectionSchema,
  buildLocationCollectionSchema,
  buildAdStructuredData,
} from "../../app/utils/schema";
import { SUPPORTED_CATEGORIES } from "../../app/utils/categories";
import { KNOWN_LOCATIONS } from "../../app/utils/locations";
import { getStoredMockAds } from "../../app/services/api";

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

function validateJsonSyntax(obj: any, label: string) {
  try {
    const serialized = JSON.stringify(obj);
    const parsed = JSON.parse(serialized);
    assert(typeof parsed === "object" && parsed !== null, `${label} produces valid, parseable JSON`);
    return serialized;
  } catch (err: any) {
    assert(false, `${label} failed JSON serialization/parsing: ${err.message}`);
    return "";
  }
}

async function runTests() {
  console.log("\n=== 1. TESTING WEBSITE & ORGANIZATION STRUCTURED DATA ===");

  const webSite = buildWebSiteSchema();
  const webSiteJson = validateJsonSyntax(webSite, "WebSite Schema");
  assert(webSite["@context"] === "https://schema.org", "WebSite has @context https://schema.org");
  assert(webSite["@type"] === "WebSite", "WebSite @type is WebSite");
  assert(webSite.name === "FreeAdsPost", "WebSite name is FreeAdsPost");
  assert(webSite.url === "https://freeadspost.vercel.app", "WebSite url is canonical https://freeadspost.vercel.app");
  assert(
    webSite.potentialAction?.["@type"] === "SearchAction",
    "WebSite includes SearchAction potentialAction"
  );
  assert(
    webSite.potentialAction?.target?.urlTemplate?.includes("/ads?search={search_term_string}"),
    "SearchAction points to /ads?search={search_term_string}"
  );

  const org = buildOrganizationSchema();
  const orgJson = validateJsonSyntax(org, "Organization Schema");
  assert(org["@context"] === "https://schema.org", "Organization has @context https://schema.org");
  assert(org["@type"] === "Organization", "Organization @type is Organization");
  assert(org.name === "FreeAdsPost", "Organization name is FreeAdsPost");
  assert(org.url === "https://freeadspost.vercel.app", "Organization url is canonical");
  assert(org.logo === "https://freeadspost.vercel.app/favicon.ico", "Organization has valid logo");

  console.log("\n=== 2. TESTING BREADCRUMBLIST STRUCTURED DATA ===");

  // Ad breadcrumb test
  const adBreadcrumbs = buildBreadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Vehicles", url: "/category/vehicles" },
    { name: "2022 Tesla Model 3 Long Range AWD", url: "/ad/2022-tesla-model-3-long-range-awd-delhi-ncr" },
  ]);

  validateJsonSyntax(adBreadcrumbs, "Ad Detail Breadcrumbs");
  assert(adBreadcrumbs["@type"] === "BreadcrumbList", "BreadcrumbList @type is BreadcrumbList");
  assert(adBreadcrumbs.itemListElement.length === 3, "Breadcrumbs contains 3 items");
  assert(adBreadcrumbs.itemListElement[0].position === 1, "Item 1 position is 1");
  assert(adBreadcrumbs.itemListElement[0].name === "Home", "Item 1 name is Home");
  assert(
    adBreadcrumbs.itemListElement[0].item === "https://freeadspost.vercel.app/",
    "Item 1 has absolute URL"
  );
  assert(adBreadcrumbs.itemListElement[1].position === 2, "Item 2 position is 2");
  assert(adBreadcrumbs.itemListElement[1].name === "Vehicles", "Item 2 name is Vehicles");
  assert(
    adBreadcrumbs.itemListElement[1].item === "https://freeadspost.vercel.app/category/vehicles",
    "Item 2 points to category URL"
  );
  assert(adBreadcrumbs.itemListElement[2].position === 3, "Item 3 position is 3");
  assert(
    adBreadcrumbs.itemListElement[2].item === "https://freeadspost.vercel.app/ad/2022-tesla-model-3-long-range-awd-delhi-ncr",
    "Item 3 points to ad canonical URL"
  );

  console.log("\n=== 3. TESTING CATEGORY COLLECTIONPAGE & ITEMLIST ===");

  const allAds = getStoredMockAds();
  for (const cat of SUPPORTED_CATEGORIES) {
    const catAds = allAds.filter((a) => a.category === cat.name && a.status === "APPROVED");
    const catCollection = buildCategoryCollectionSchema(cat, catAds);
    validateJsonSyntax(catCollection, `Category CollectionPage [${cat.slug}]`);

    assert(catCollection["@type"] === "CollectionPage", `[${cat.slug}] @type is CollectionPage`);
    assert(catCollection.name === cat.h1, `[${cat.slug}] name matches category H1`);
    assert(
      catCollection.url === `https://freeadspost.vercel.app/category/${cat.slug}`,
      `[${cat.slug}] url matches category canonical URL`
    );
    assert(
      catCollection.mainEntity?.["@type"] === "ItemList",
      `[${cat.slug}] mainEntity is ItemList`
    );
    assert(
      catCollection.mainEntity?.numberOfItems === catAds.length,
      `[${cat.slug}] numberOfItems matches real active ad count (${catAds.length})`
    );
  }

  console.log("\n=== 4. TESTING LOCATION COLLECTIONPAGE & ITEMLIST ===");

  const mumbaiConfig = KNOWN_LOCATIONS.find((l) => l.slug === "mumbai")!;
  const mumbaiAds = allAds.filter((a) => a.location?.includes("Mumbai") && a.status === "APPROVED");
  const mumbaiCollection = buildLocationCollectionSchema(mumbaiConfig, mumbaiAds);

  validateJsonSyntax(mumbaiCollection, "Mumbai Location CollectionPage");
  assert(mumbaiCollection["@type"] === "CollectionPage", "Location @type is CollectionPage");
  assert(mumbaiCollection.name === mumbaiConfig.h1, "Location name matches location H1");
  assert(
    mumbaiCollection.url === "https://freeadspost.vercel.app/location/mumbai",
    "Location url matches canonical URL"
  );
  assert(mumbaiCollection.mainEntity?.numberOfItems === 2, "Mumbai ItemList contains 2 ads");

  console.log("\n=== 5. TESTING ADVERTISEMENT-SPECIFIC STRUCTURED DATA (HONEST & TRUTHFUL) ===");

  for (const ad of allAds) {
    const schema = buildAdStructuredData(ad);
    const jsonStr = validateJsonSyntax(schema, `Ad Structured Data [${ad.title.slice(0, 30)}...]`);

    // Verify context
    assert(schema["@context"] === "https://schema.org", `Ad has @context https://schema.org`);
    const s: any = schema;

    // Category-specific schema validation
    if (ad.category === "Vehicles") {
      assert(s["@type"] === "Vehicle", `Vehicles ad has @type Vehicle (got: ${s["@type"]})`);
      assert(s.category === "Vehicles", `Vehicle has category Vehicles`);
      assert(s.itemCondition === "https://schema.org/UsedCondition", `Vehicle itemCondition is UsedCondition`);
    } else if (ad.category === "Jobs") {
      assert(s["@type"] === "JobPosting", `Jobs ad has @type JobPosting (got: ${s["@type"]})`);
      assert(s.title === ad.title, `JobPosting title matches ad title`);
      assert(s.hiringOrganization?.["@type"] === "Organization", `JobPosting has hiringOrganization`);
      assert(s.jobLocation?.["@type"] === "Place", `JobPosting has jobLocation Place`);
      if (typeof ad.price === "number" && ad.price > 0) {
        assert(s.baseSalary?.["@type"] === "MonetaryAmount", `JobPosting has baseSalary MonetaryAmount`);
        assert(s.baseSalary?.value?.value === ad.price, `baseSalary matches ad price`);
      }
    } else if (ad.category === "Real Estate") {
      assert(
        s["@type"] === "RealEstateListing",
        `Real Estate ad has @type RealEstateListing (got: ${s["@type"]})`
      );
    } else if (ad.category === "Services") {
      assert(s["@type"] === "Service", `Services ad has @type Service (got: ${s["@type"]})`);
      assert(Boolean(s.serviceType), `Service has serviceType`);
      assert(s.provider?.["@type"] === "Organization", `Service has provider Organization`);
    } else {
      assert(s["@type"] === "Product", `General Goods/Merchandise has @type Product (got: ${s["@type"]})`);
    }

    // Offer Validation
    if (s["@type"] !== "JobPosting") {
      const offer = s.offers;
      assert(offer?.["@type"] === "Offer", `Listing includes valid Offer`);
      assert(offer?.availability === "https://schema.org/InStock", `Offer availability is InStock`);
      if (typeof ad.price === "number" && ad.price > 0) {
        assert(offer?.price === ad.price, `Offer price (${offer?.price}) truthfully equals ad.price (${ad.price})`);
        assert(offer?.priceCurrency === "INR", `Offer currency is INR`);
      }
    }

    // ANTI-MANIPULATION SAFEGUARDS: Verify ZERO fake or misleading data
    assert(!("aggregateRating" in schema), `ZERO fake aggregateRating injected in ${ad.title.slice(0, 25)}`);
    assert(!("review" in schema), `ZERO fake reviews injected in ${ad.title.slice(0, 25)}`);
    assert(!("ratingValue" in schema), `ZERO fake ratingValue injected in ${ad.title.slice(0, 25)}`);
    assert(!("reviewCount" in schema), `ZERO fake reviewCount injected in ${ad.title.slice(0, 25)}`);

    // Verify ZERO contact leak in schema
    assert(
      !jsonStr.includes("+91") && !jsonStr.includes("555-") && !jsonStr.includes("@example.com"),
      `Structured data does NOT leak private seller phone or email`
    );
  }

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
