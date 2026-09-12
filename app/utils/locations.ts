export interface LocationConfig {
  slug: string;
  city: string;
  state: string;
  fullName: string;
  aliases: string[];
  h1: string;
  metaTitle: string;
  metaDescription: string;
}

/**
 * Standard Indian metro location hubs recognized by FreeAdsPost.
 * Aligned with the single `location` string format stored in Google Sheets and ad records.
 */
export const KNOWN_LOCATIONS: LocationConfig[] = [
  {
    slug: "mumbai",
    city: "Mumbai",
    state: "Maharashtra",
    fullName: "Mumbai, Maharashtra",
    aliases: ["mumbai", "bombay"],
    h1: "Classified Advertisements in Mumbai",
    metaTitle: "Classified Advertisements in Mumbai, Maharashtra | FreeAdsPost",
    metaDescription: "Browse verified classified ads in Mumbai, Maharashtra. Discover trusted local services, electronics, vehicles, jobs, and properties on FreeAdsPost."
  },
  {
    slug: "delhi",
    city: "Delhi NCR",
    state: "Delhi",
    fullName: "Delhi NCR",
    aliases: ["delhi", "delhi-ncr", "delhi ncr", "new delhi"],
    h1: "Classified Advertisements in Delhi NCR",
    metaTitle: "Classified Advertisements in Delhi NCR | FreeAdsPost",
    metaDescription: "Explore verified classified advertisements across Delhi NCR. Find cars, jobs, real estate, electronics, and local services on FreeAdsPost."
  },
  {
    slug: "bengaluru",
    city: "Bengaluru",
    state: "Karnataka",
    fullName: "Bengaluru, Karnataka",
    aliases: ["bengaluru", "bangalore"],
    h1: "Classified Advertisements in Bengaluru",
    metaTitle: "Classified Advertisements in Bengaluru, Karnataka | FreeAdsPost",
    metaDescription: "Find verified classified advertisements in Bengaluru, Karnataka. Explore tech jobs, web services, rental properties, and gadgets on FreeAdsPost."
  },
  {
    slug: "hyderabad",
    city: "Hyderabad",
    state: "Telangana",
    fullName: "Hyderabad, Telangana",
    aliases: ["hyderabad", "secunderabad"],
    h1: "Classified Advertisements in Hyderabad",
    metaTitle: "Classified Advertisements in Hyderabad, Telangana | FreeAdsPost",
    metaDescription: "Discover verified classified ads in Hyderabad, Telangana. Find apartments for rent, commercial real estate, jobs, and vehicles on FreeAdsPost."
  },
  {
    slug: "pune",
    city: "Pune",
    state: "Maharashtra",
    fullName: "Pune, Maharashtra",
    aliases: ["pune", "poona"],
    h1: "Classified Advertisements in Pune",
    metaTitle: "Classified Advertisements in Pune, Maharashtra | FreeAdsPost",
    metaDescription: "Explore verified classified listings in Pune, Maharashtra. Find tech job openings, rental homes, services, and used goods on FreeAdsPost."
  },
  {
    slug: "chennai",
    city: "Chennai",
    state: "Tamil Nadu",
    fullName: "Chennai, Tamil Nadu",
    aliases: ["chennai", "madras"],
    h1: "Classified Advertisements in Chennai",
    metaTitle: "Classified Advertisements in Chennai, Tamil Nadu | FreeAdsPost",
    metaDescription: "Browse verified classified ads in Chennai, Tamil Nadu. Find electronics, laptops, home appliances, services, and cars on FreeAdsPost."
  },
  {
    slug: "kolkata",
    city: "Kolkata",
    state: "West Bengal",
    fullName: "Kolkata, West Bengal",
    aliases: ["kolkata", "calcutta"],
    h1: "Classified Advertisements in Kolkata",
    metaTitle: "Classified Advertisements in Kolkata, West Bengal | FreeAdsPost",
    metaDescription: "Shop verified classified advertisements in Kolkata, West Bengal. Browse furniture, home goods, services, and local listings on FreeAdsPost."
  },
  {
    slug: "gurgaon",
    city: "Gurgaon",
    state: "Haryana",
    fullName: "Gurgaon, Haryana",
    aliases: ["gurgaon", "gurugram"],
    h1: "Classified Advertisements in Gurgaon",
    metaTitle: "Classified Advertisements in Gurgaon, Haryana | FreeAdsPost",
    metaDescription: "Browse local classified listings in Gurgaon (Gurugram), Haryana. Discover corporate jobs, commercial spaces, luxury homes, and tech services."
  },
  {
    slug: "noida",
    city: "Noida",
    state: "Uttar Pradesh",
    fullName: "Noida, Uttar Pradesh",
    aliases: ["noida", "greater noida"],
    h1: "Classified Advertisements in Noida",
    metaTitle: "Classified Advertisements in Noida, Uttar Pradesh | FreeAdsPost",
    metaDescription: "Find verified classified advertisements in Noida, Uttar Pradesh. Browse tech jobs, residential apartments, industrial property, and services."
  },
  {
    slug: "ahmedabad",
    city: "Ahmedabad",
    state: "Gujarat",
    fullName: "Ahmedabad, Gujarat",
    aliases: ["ahmedabad"],
    h1: "Classified Advertisements in Ahmedabad",
    metaTitle: "Classified Advertisements in Ahmedabad, Gujarat | FreeAdsPost",
    metaDescription: "Explore verified classified advertisements in Ahmedabad, Gujarat. Find commercial properties, vehicles, textiles, and local services on FreeAdsPost."
  },
  {
    slug: "jaipur",
    city: "Jaipur",
    state: "Rajasthan",
    fullName: "Jaipur, Rajasthan",
    aliases: ["jaipur"],
    h1: "Classified Advertisements in Jaipur",
    metaTitle: "Classified Advertisements in Jaipur, Rajasthan | FreeAdsPost",
    metaDescription: "Browse verified classified ads in Jaipur, Rajasthan. Discover handicrafts, residential plots, vehicles, and business services on FreeAdsPost."
  },
  {
    slug: "chandigarh",
    city: "Chandigarh",
    state: "Punjab / Haryana",
    fullName: "Chandigarh",
    aliases: ["chandigarh", "mohali", "panchkula"],
    h1: "Classified Advertisements in Chandigarh",
    metaTitle: "Classified Advertisements in Chandigarh | FreeAdsPost",
    metaDescription: "Find verified classified advertisements in Chandigarh Tricity. Explore rental properties, automotive listings, electronics, and jobs on FreeAdsPost."
  }
];

/**
 * Resolves a location configuration by slug or alias.
 */
export function getLocationBySlug(slug?: string | null): LocationConfig | undefined {
  if (!slug) return undefined;
  const clean = slug.trim().toLowerCase().replace(/_/g, "-");
  return KNOWN_LOCATIONS.find(
    (loc) => loc.slug === clean || loc.aliases.includes(clean)
  );
}

/**
 * Resolves a location configuration from an advertisement's location string.
 */
export function getLocationFromAdLocation(locationStr?: string | null): LocationConfig | undefined {
  if (!locationStr) return undefined;
  const clean = locationStr.trim().toLowerCase();
  return KNOWN_LOCATIONS.find(
    (loc) =>
      clean.includes(loc.slug) ||
      clean.includes(loc.city.toLowerCase()) ||
      loc.aliases.some((alias) => clean.includes(alias))
  );
}

/**
 * Alias for getLocationFromAdLocation.
 */
export const resolveLocationSlug = getLocationFromAdLocation;

/**
 * Builds canonical URL for location pages.
 */
export function buildLocationCanonicalUrl(slug: string, requestUrl?: string): string {
  const cleanSlug = slug.trim().toLowerCase();
  const envSiteUrl = typeof process !== "undefined" && process.env?.VITE_SITE_URL
    ? process.env.VITE_SITE_URL.replace(/\/$/, "")
    : "";
  if (envSiteUrl) {
    return `${envSiteUrl}/location/${cleanSlug}`;
  }
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      if (url.origin && !url.hostname.includes("localhost") && !url.hostname.includes("127.0.0.1")) {
        return `${url.origin}/location/${cleanSlug}`;
      }
    } catch {
      // fallback
    }
  }
  return `https://freeadspost.vercel.app/location/${cleanSlug}`;
}

/**
 * Builds React Router meta descriptors for location pages.
 * Anti-thin-content safeguard: If totalAds === 0, sets noindex, follow to prevent doorway penalty.
 */
export function buildLocationMetaDescriptors(
  location: LocationConfig | null | undefined,
  totalAds: number,
  requestUrl?: string
) {
  if (!location) {
    return [
      { title: "Location Not Found | FreeAdsPost" },
      {
        name: "description",
        content: "The requested city or location could not be found. Browse verified classified advertisements by location across India on FreeAdsPost."
      },
      { name: "robots", content: "noindex, nofollow" }
    ];
  }

  const canonicalUrl = buildLocationCanonicalUrl(location.slug, requestUrl);
  // Only index when sufficient real inventory exists; otherwise set noindex to avoid thin content / doorway pages
  const robots = totalAds > 0 ? "index, follow" : "noindex, follow";

  return [
    { title: location.metaTitle },
    { name: "description", content: location.metaDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { name: "robots", content: robots },
    { property: "og:title", content: location.metaTitle },
    { property: "og:description", content: location.metaDescription },
    { property: "og:url", content: canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "FreeAdsPost" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: location.metaTitle },
    { name: "twitter:description", content: location.metaDescription }
  ];
}
