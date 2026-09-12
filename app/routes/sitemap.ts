import type { Route } from "./+types/sitemap";
import { getPublicAds, type AdItem } from "~/services/api";
import { SUPPORTED_CATEGORIES } from "~/utils/categories";
import { KNOWN_LOCATIONS, resolveLocationSlug } from "~/utils/locations";
import { generateAdSlug } from "~/utils/slug";

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
    return d.toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function getBaseUrl(request?: Request): string {
  const envUrl =
    typeof process !== "undefined" && process.env?.VITE_SITE_URL
      ? process.env.VITE_SITE_URL.replace(/\/$/, "")
      : "";
  if (envUrl) return envUrl;

  if (request) {
    try {
      const url = new URL(request.url);
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

interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: string;
}

/**
 * Resource route loader that dynamically generates XML sitemap.
 * Pulls live approved active advertisements, valid location hubs with real inventory,
 * supported categories, and essential static public pages.
 * Updates dynamically whenever ads are added, approved, removed, or expire.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const baseUrl = getBaseUrl(request);
  const today = new Date().toISOString().split("T")[0];

  const entries: SitemapUrlEntry[] = [];
  const seenUrls = new Set<string>();

  function addEntry(entry: SitemapUrlEntry) {
    if (seenUrls.has(entry.loc)) return;
    seenUrls.add(entry.loc);
    entries.push(entry);
  }

  // 1. Homepage
  addEntry({
    loc: `${baseUrl}/`,
    lastmod: today,
    changefreq: "daily",
    priority: "1.0",
  });

  // 2. Core Public Static Pages
  addEntry({
    loc: `${baseUrl}/ads`,
    lastmod: today,
    changefreq: "daily",
    priority: "0.9",
  });

  addEntry({
    loc: `${baseUrl}/membership`,
    lastmod: today,
    changefreq: "monthly",
    priority: "0.7",
  });

  // 3. Supported Public Category Pages (8 official categories)
  for (const category of SUPPORTED_CATEGORIES) {
    addEntry({
      loc: `${baseUrl}/category/${category.slug}`,
      lastmod: today,
      changefreq: "daily",
      priority: "0.8",
    });
  }

  // Fetch active approved advertisements
  let ads: AdItem[] = [];
  try {
    const res = await getPublicAds({ limit: 1000 });
    if (res.success && res.data?.ads) {
      ads = res.data.ads.filter((a) => a.status === "APPROVED");
    }
  } catch (err) {
    console.error("Failed to fetch public ads for sitemap:", err);
  }

  // 4. Valid Public Location Pages (Only include locations with real active inventory > 0)
  const locationAdCounts = new Map<string, number>();
  for (const ad of ads) {
    const locConfig = resolveLocationSlug(ad.location);
    if (locConfig) {
      locationAdCounts.set(
        locConfig.slug,
        (locationAdCounts.get(locConfig.slug) || 0) + 1
      );
    }
  }

  for (const location of KNOWN_LOCATIONS) {
    const count = locationAdCounts.get(location.slug) || 0;
    // Anti-thin / doorway safeguard: only index location hubs with real active ads
    if (count > 0) {
      addEntry({
        loc: `${baseUrl}/location/${location.slug}`,
        lastmod: today,
        changefreq: "daily",
        priority: "0.8",
      });
    }
  }

  // 5. Active Public Advertisement Pages
  for (const ad of ads) {
    const slug = ad.slug || generateAdSlug(ad.title, ad.location, ad.ad_id);
    const lastmod = formatDate(ad.updated_at || ad.created_at);
    const isSponsored = Boolean(ad.is_sponsored);

    addEntry({
      loc: `${baseUrl}/ad/${slug}`,
      lastmod,
      changefreq: "weekly",
      priority: isSponsored ? "0.9" : "0.8",
    });
  }

  // Render XML urlset
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ""}
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
