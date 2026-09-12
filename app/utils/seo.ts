import type { AdItem } from "~/services/api";

/**
 * Extracts primary city from location string (e.g. "Mumbai, Maharashtra" -> "Mumbai", "Delhi NCR" -> "Delhi NCR").
 */
export function getCityFromLocation(location?: string | null): string {
  if (!location) return "";
  const trimmed = location.trim();
  if (trimmed.includes(",")) {
    return trimmed.split(",")[0].trim();
  }
  return trimmed;
}

/**
 * Escapes regex special characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generates SEO title conforming to:
 * {Advertisement Title} in {City} | FreeAdsPost
 * Avoids duplicate city mentions if title already includes city.
 */
export function buildSeoTitle(ad: Pick<AdItem, "title"> & { location?: string | null }): string {
  const cleanTitle = (ad.title || "").trim().replace(/\s+/g, " ");
  if (!cleanTitle) return "Advertisement Details | FreeAdsPost";

  const city = getCityFromLocation(ad.location);
  if (!city) {
    return `${cleanTitle} | FreeAdsPost`;
  }

  // Check if title already contains the city name
  const cityRegex = new RegExp(`\\b${escapeRegex(city)}\\b`, "i");
  if (cityRegex.test(cleanTitle)) {
    return `${cleanTitle} | FreeAdsPost`;
  }

  return `${cleanTitle} in ${city} | FreeAdsPost`;
}

/**
 * Strips phone numbers, email addresses, WhatsApp digits, and external links
 * to ensure zero seller contact info leaks into public search engine snippets.
 */
export function sanitizeForSeoText(text: string): string {
  return text
    // Strip email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
    // Strip phone numbers / WhatsApp numbers (international or domestic patterns)
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g, "")
    // Strip URLs
    .replace(/https?:\/\/\S+/gi, "")
    // Collapse excess whitespace and newlines
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates unique, concise meta description strictly using actual public ad data.
 * Does not keyword stuff or invent data. Truncates cleanly to <= 160 characters.
 */
export function buildSeoDescription(
  ad: Pick<AdItem, "title"> & {
    description?: string | null;
    category?: string | null;
    location?: string | null;
  }
): string {
  const sanitizedDesc = sanitizeForSeoText(ad.description || "");

  if (sanitizedDesc.length >= 60) {
    if (sanitizedDesc.length <= 155) return sanitizedDesc;
    const sliced = sanitizedDesc.slice(0, 152);
    const lastSpace = sliced.lastIndexOf(" ");
    return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim() + "...";
  }

  // If description is short or empty, combine actual public attributes
  const parts: string[] = [];
  if (sanitizedDesc) parts.push(sanitizedDesc);
  if (ad.category) parts.push(`Category: ${ad.category}.`);
  if (ad.location) parts.push(`Location: ${ad.location}.`);
  parts.push("View full listing on FreeAdsPost.");

  const combined = parts.join(" ");
  if (combined.length <= 155) return combined;
  const sliced = combined.slice(0, 152);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim() + "...";
}

/**
 * Builds the canonical URL pointing to the single preferred public URL (/ad/[slug]).
 * Normalizes query parameters, trailing slashes, and non-slug identifiers.
 */
export function buildCanonicalUrl(slug: string, requestUrl?: string): string {
  const cleanSlug = encodeURIComponent(slug.trim().toLowerCase())
    .replace(/%2D/gi, "-")
    .replace(/%5F/gi, "_");

  // Allow override via environment variable if defined
  const envSiteUrl = typeof process !== "undefined" && process.env?.VITE_SITE_URL
    ? process.env.VITE_SITE_URL.replace(/\/$/, "")
    : "";
  if (envSiteUrl) {
    return `${envSiteUrl}/ad/${cleanSlug}`;
  }

  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      if (url.origin && !url.hostname.includes("localhost") && !url.hostname.includes("127.0.0.1")) {
        return `${url.origin}/ad/${cleanSlug}`;
      }
    } catch {
      // fallback to production URL
    }
  }

  return `https://freeadspost.vercel.app/ad/${cleanSlug}`;
}

/**
 * Builds standard React Router meta descriptors for public advertisement pages.
 */
export function buildAdMetaDescriptors(ad: AdItem | null | undefined, requestUrl?: string) {
  if (!ad) {
    return [
      { title: "Advertisement Not Found | FreeAdsPost" },
      {
        name: "description",
        content: "The requested classified advertisement is no longer available or is pending review on FreeAdsPost."
      },
      { name: "robots", content: "noindex, nofollow" }
    ];
  }

  const title = buildSeoTitle(ad);
  const description = buildSeoDescription(ad);
  const canonicalUrl = buildCanonicalUrl(ad.slug || ad.ad_id, requestUrl);
  const hasImage = Boolean(ad.image_url && ad.image_url.trim().length > 0);

  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonicalUrl },
    { property: "og:type", content: "article" },
    { property: "og:site_name", content: "FreeAdsPost" },
    ...(hasImage
      ? [
          { property: "og:image", content: ad.image_url! },
          { property: "og:image:alt", content: ad.title },
          { name: "twitter:image", content: ad.image_url! }
        ]
      : []),
    { name: "twitter:card", content: hasImage ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description }
  ];
}
