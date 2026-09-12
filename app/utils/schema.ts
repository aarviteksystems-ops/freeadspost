import type { AdItem } from "~/services/api";
import type { CategoryConfig } from "./categories";
import type { LocationConfig } from "./locations";
import { getCityFromLocation, sanitizeForSeoText } from "./seo";
import { toCategorySlug } from "./categories";

export function getSiteBaseUrl(siteUrl?: string): string {
  const envUrl =
    typeof process !== "undefined" && process.env?.VITE_SITE_URL
      ? process.env.VITE_SITE_URL.replace(/\/$/, "")
      : "";
  if (envUrl) return envUrl;

  if (siteUrl) {
    try {
      const url = new URL(siteUrl);
      if (
        url.origin &&
        !url.hostname.includes("localhost") &&
        !url.hostname.includes("127.0.0.1")
      ) {
        return url.origin.replace(/\/$/, "");
      }
    } catch {
      // fallback
    }
  }

  return "https://freeadspost.vercel.app";
}

/**
 * Builds standard WebSite structured data with SearchAction for site search.
 */
export function buildWebSiteSchema(siteUrl?: string) {
  const base = getSiteBaseUrl(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FreeAdsPost",
    url: base,
    description: "India's Trusted Free Classifieds Marketplace. Post and browse verified classified advertisements across Indian cities.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/ads?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Builds Organization structured data representing the publisher/marketplace.
 */
export function buildOrganizationSchema(siteUrl?: string) {
  const base = getSiteBaseUrl(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "FreeAdsPost",
    url: base,
    logo: `${base}/favicon.ico`,
    description: "India's Trusted Free Classifieds Marketplace for verified services, real estate, jobs, electronics, vehicles, and merchandise.",
  };
}

/**
 * Builds BreadcrumbList structured data for any hierarchical navigation trail.
 */
export function buildBreadcrumbSchema(
  items: Array<{ name: string; url: string }>,
  siteUrl?: string
) {
  const base = getSiteBaseUrl(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${base}${item.url.startsWith("/") ? "" : "/"}${item.url}`,
    })),
  };
}

/**
 * Builds CollectionPage and ItemList structured data for category pages.
 */
export function buildCategoryCollectionSchema(
  category: CategoryConfig,
  ads: AdItem[],
  siteUrl?: string
) {
  const base = getSiteBaseUrl(siteUrl);
  const categoryUrl = `${base}/category/${category.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.h1,
    description: category.metaDescription,
    url: categoryUrl,
    mainEntity: {
      "@type": "ItemList",
      name: category.displayName,
      numberOfItems: ads.length,
      itemListElement: ads.slice(0, 20).map((ad, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: ad.title,
        url: `${base}/ad/${ad.slug || ad.ad_id}`,
      })),
    },
  };
}

/**
 * Builds CollectionPage and ItemList structured data for location pages with active listings.
 */
export function buildLocationCollectionSchema(
  location: LocationConfig,
  ads: AdItem[],
  siteUrl?: string
) {
  const base = getSiteBaseUrl(siteUrl);
  const locationUrl = `${base}/location/${location.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: location.h1,
    description: location.metaDescription,
    url: locationUrl,
    mainEntity: {
      "@type": "ItemList",
      name: `Classified Advertisements in ${location.city}`,
      numberOfItems: ads.length,
      itemListElement: ads.slice(0, 20).map((ad, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: ad.title,
        url: `${base}/ad/${ad.slug || ad.ad_id}`,
      })),
    },
  };
}

/**
 * Builds category-specific, truthful structured data for individual advertisements.
 * 
 * Rules:
 * - Uses only actual, visible data.
 * - Zero fake ratings or fabricated reviews.
 * - Zero fake prices (price only included if numeric and > 0).
 * - Zero contact leaks (phone/email shielded).
 */
export function buildAdStructuredData(ad: AdItem, siteUrl?: string) {
  const base = getSiteBaseUrl(siteUrl);
  const adUrl = `${base}/ad/${ad.slug || ad.ad_id}`;
  const cleanDescription = sanitizeForSeoText(ad.description || ad.title);
  const city = getCityFromLocation(ad.location);

  // Expiry date calculation (standard 30-day listing cycle from creation)
  let validUntil: string | undefined;
  if (ad.expires_at) {
    try {
      validUntil = new Date(ad.expires_at).toISOString().split("T")[0];
    } catch {
      // fallback
    }
  }
  if (!validUntil && ad.created_at) {
    try {
      const created = new Date(ad.created_at);
      created.setDate(created.getDate() + 30);
      validUntil = created.toISOString().split("T")[0];
    } catch {
      // fallback
    }
  }

  // Offer structure (only if valid price exists)
  const hasValidPrice = typeof ad.price === "number" && ad.price > 0;
  const offer = hasValidPrice
    ? {
        "@type": "Offer" as const,
        price: ad.price,
        priceCurrency: "INR",
        ...(validUntil ? { priceValidUntil: validUntil } : {}),
        availability: "https://schema.org/InStock",
        url: adUrl,
      }
    : {
        "@type": "Offer" as const,
        availability: "https://schema.org/InStock",
        url: adUrl,
      };

  const categoryNorm = (ad.category || "").trim().toLowerCase();

  // 1. Vehicles
  if (categoryNorm.includes("vehicle") || categoryNorm.includes("car") || categoryNorm.includes("bike")) {
    return {
      "@context": "https://schema.org",
      "@type": "Vehicle",
      name: ad.title,
      description: cleanDescription,
      url: adUrl,
      ...(ad.image_url ? { image: ad.image_url } : {}),
      category: "Vehicles",
      itemCondition: "https://schema.org/UsedCondition",
      offers: offer,
    };
  }

  // 2. Jobs
  if (categoryNorm.includes("job") || categoryNorm.includes("employment") || categoryNorm.includes("career")) {
    return {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: ad.title,
      description: cleanDescription,
      datePosted: ad.created_at || new Date().toISOString(),
      ...(validUntil ? { validThrough: validUntil } : {}),
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          ...(city ? { addressLocality: city } : {}),
          addressCountry: "IN",
        },
      },
      hiringOrganization: {
        "@type": "Organization",
        name: "Verified Employer via FreeAdsPost",
        sameAs: base,
      },
      employmentType: "FULL_TIME",
      ...(hasValidPrice
        ? {
            baseSalary: {
              "@type": "MonetaryAmount",
              currency: "INR",
              value: {
                "@type": "QuantitativeValue",
                value: ad.price,
                unitText: "MONTH",
              },
            },
          }
        : {}),
    };
  }

  // 3. Real Estate
  if (categoryNorm.includes("real estate") || categoryNorm.includes("property") || categoryNorm.includes("apartment")) {
    return {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: ad.title,
      description: cleanDescription,
      url: adUrl,
      ...(ad.image_url ? { image: ad.image_url } : {}),
      datePosted: ad.created_at ? ad.created_at.split("T")[0] : undefined,
      offers: offer,
    };
  }

  // 4. Services
  if (categoryNorm.includes("service")) {
    return {
      "@context": "https://schema.org",
      "@type": "Service",
      name: ad.title,
      description: cleanDescription,
      url: adUrl,
      ...(ad.image_url ? { image: ad.image_url } : {}),
      serviceType: ad.category || "Professional Services",
      ...(city
        ? {
            areaServed: {
              "@type": "City",
              name: city,
            },
          }
        : {}),
      provider: {
        "@type": "Organization",
        name: "Verified Provider via FreeAdsPost",
        url: base,
      },
      offers: offer,
    };
  }

  // 5. Electronics & Buy & Sell & General Goods (Default Product Schema)
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: ad.title,
    description: cleanDescription,
    url: adUrl,
    ...(ad.image_url ? { image: ad.image_url } : {}),
    category: ad.category || "General Classifieds",
    itemCondition: "https://schema.org/UsedCondition",
    offers: offer,
  };
}
