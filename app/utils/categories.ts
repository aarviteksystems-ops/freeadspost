export interface CategoryConfig {
  slug: string;
  name: string;
  displayName: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  icon: string;
  tagline: string;
  popularSearchTerms: string[];
}

/**
 * The 8 categories supported by the FreeAdsPost platform.
 * Strictly aligned with Google Sheets backend and application validation.
 */
export const SUPPORTED_CATEGORIES: CategoryConfig[] = [
  {
    slug: "vehicles",
    name: "Vehicles",
    displayName: "Vehicles",
    h1: "Vehicles Classified Advertisements in India",
    metaTitle: "Vehicles Classified Ads in India | FreeAdsPost",
    metaDescription: "Browse verified cars, motorcycles, commercial vehicles, and auto parts for sale across Indian cities on FreeAdsPost.",
    icon: "🚗",
    tagline: "Cars, bikes, scooters, commercial vehicles, and automotive spares",
    popularSearchTerms: ["Cars", "Bikes", "Electric Scooters", "SUVs", "Commercial"]
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    displayName: "Real Estate",
    h1: "Real Estate & Property Classifieds in India",
    metaTitle: "Real Estate & Property Advertisements | FreeAdsPost",
    metaDescription: "Find apartments, houses, commercial shops, plots, and rental properties across major Indian cities on FreeAdsPost.",
    icon: "🏢",
    tagline: "Flats for rent, properties for sale, commercial spaces, and PG accommodation",
    popularSearchTerms: ["Apartments", "Commercial Shops", "Plots", "House For Sale", "1 BHK / 2 BHK"]
  },
  {
    slug: "jobs",
    name: "Jobs",
    displayName: "Jobs",
    h1: "Jobs & Employment Vacancies in India",
    metaTitle: "Jobs & Employment Classifieds | FreeAdsPost",
    metaDescription: "Discover verified local job openings, full-time positions, part-time work, and remote vacancies across India on FreeAdsPost.",
    icon: "💼",
    tagline: "Tech, sales, marketing, operations, retail, and local employment opportunities",
    popularSearchTerms: ["Software Engineer", "Sales Executive", "Remote Jobs", "Full Time", "Internships"]
  },
  {
    slug: "electronics",
    name: "Electronics",
    displayName: "Electronics",
    h1: "Electronics & Gadgets Classifieds in India",
    metaTitle: "Electronics & Gadgets Classified Ads | FreeAdsPost",
    metaDescription: "Buy and sell laptops, smartphones, tablets, cameras, audio equipment, and home appliances on FreeAdsPost.",
    icon: "📱",
    tagline: "Computers, mobile phones, audio gear, TVs, and smart home gadgets",
    popularSearchTerms: ["Laptops", "Smartphones", "MacBook", "Cameras", "Headphones"]
  },
  {
    slug: "services",
    name: "Services",
    displayName: "Services",
    h1: "Professional & Local Services in India",
    metaTitle: "Professional & Local Services Ads | FreeAdsPost",
    metaDescription: "Hire verified local professionals, home maintenance specialists, tech freelancers, tutors, and business consultants on FreeAdsPost.",
    icon: "🛠️",
    tagline: "Freelance tech, photography, repairs, home maintenance, and consulting",
    popularSearchTerms: ["Web Development", "Photography", "Home Repairs", "Consulting", "Design"]
  },
  {
    slug: "buy-sell",
    name: "Buy & Sell",
    displayName: "Buy & Sell",
    h1: "Buy & Sell Goods & Merchandise in India",
    metaTitle: "Buy & Sell Classified Advertisements | FreeAdsPost",
    metaDescription: "Shop verified secondhand goods, home furniture, collectibles, fitness gear, and general merchandise on FreeAdsPost.",
    icon: "🛒",
    tagline: "Furniture, collectibles, home essentials, books, fashion, and daily items",
    popularSearchTerms: ["Furniture", "Dining Table", "Beds", "Fitness Gear", "Books"]
  },
  {
    slug: "community",
    name: "Community",
    displayName: "Community",
    h1: "Community Announcements & Local Activities",
    metaTitle: "Community Announcements & Classifieds | FreeAdsPost",
    metaDescription: "Connect with local community groups, workshops, social events, interest clubs, and neighborhood announcements on FreeAdsPost.",
    icon: "🤝",
    tagline: "Local events, volunteer groups, classes, clubs, and neighborhood notices",
    popularSearchTerms: ["Workshops", "Events", "Classes", "Volunteer", "Clubs"]
  },
  {
    slug: "other",
    name: "Other",
    displayName: "Other Classifieds",
    h1: "Other Classified Advertisements in India",
    metaTitle: "Other Classified Advertisements | FreeAdsPost",
    metaDescription: "Discover miscellaneous classified ads, specialty items, and unique local listings across India on FreeAdsPost.",
    icon: "📦",
    tagline: "Specialty items, miscellaneous merchandise, and unique classified listings",
    popularSearchTerms: ["Miscellaneous", "Special Offers", "Unique Items"]
  }
];

/**
 * Finds category configuration by URL slug (case-insensitive, trimmed).
 */
export function getCategoryBySlug(slug?: string | null): CategoryConfig | undefined {
  if (!slug) return undefined;
  const clean = slug.trim().toLowerCase().replace(/_/g, "-");
  return SUPPORTED_CATEGORIES.find(
    (c) => c.slug === clean || (clean === "buy-and-sell" && c.slug === "buy-sell")
  );
}

/**
 * Finds category configuration by category name (e.g. "Buy & Sell", "Buy / Sell", "Real Estate").
 */
export function getCategoryByName(name?: string | null): CategoryConfig | undefined {
  if (!name) return undefined;
  const clean = name.trim().toLowerCase();
  const norm = clean.replace(/[\s/&]+/g, "-");
  return SUPPORTED_CATEGORIES.find(
    (c) =>
      c.name.toLowerCase() === clean ||
      c.displayName.toLowerCase() === clean ||
      c.slug === norm ||
      (c.slug === "buy-sell" && clean.includes("buy") && clean.includes("sell"))
  );
}

/**
 * Converts category name to URL-safe slug.
 */
export function toCategorySlug(name: string): string {
  const cat = getCategoryByName(name);
  if (cat) return cat.slug;
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s/&]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generates canonical URL for a category page.
 */
export function buildCategoryCanonicalUrl(slug: string, requestUrl?: string): string {
  const cleanSlug = slug.trim().toLowerCase();
  const envSiteUrl = typeof process !== "undefined" && process.env?.VITE_SITE_URL
    ? process.env.VITE_SITE_URL.replace(/\/$/, "")
    : "";
  if (envSiteUrl) {
    return `${envSiteUrl}/category/${cleanSlug}`;
  }
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      if (url.origin && !url.hostname.includes("localhost") && !url.hostname.includes("127.0.0.1")) {
        return `${url.origin}/category/${cleanSlug}`;
      }
    } catch {
      // fallback
    }
  }
  return `https://freeadspost.vercel.app/category/${cleanSlug}`;
}

/**
 * Builds React Router meta descriptors for category pages.
 */
export function buildCategoryMetaDescriptors(category: CategoryConfig | null | undefined, requestUrl?: string) {
  if (!category) {
    return [
      { title: "Category Not Found | FreeAdsPost" },
      {
        name: "description",
        content: "The requested classified advertisement category could not be found. Browse verified categories on FreeAdsPost."
      },
      { name: "robots", content: "noindex, nofollow" }
    ];
  }

  const canonicalUrl = buildCategoryCanonicalUrl(category.slug, requestUrl);

  return [
    { title: category.metaTitle },
    { name: "description", content: category.metaDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:title", content: category.metaTitle },
    { property: "og:description", content: category.metaDescription },
    { property: "og:url", content: canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "FreeAdsPost" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: category.metaTitle },
    { name: "twitter:description", content: category.metaDescription }
  ];
}
