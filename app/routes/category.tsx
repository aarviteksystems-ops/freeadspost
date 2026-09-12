import { useState, useEffect } from "react";
import { Link, useSearchParams, data } from "react-router";
import type { Route } from "./+types/category";
import { AdCard } from "~/components/AdCard";
import { useAuth } from "~/context/AuthContext";
import { getPublicAds, type AdItem, type PublicAdsOptions } from "~/services/api";
import {
  SUPPORTED_CATEGORIES,
  getCategoryBySlug,
  buildCategoryMetaDescriptors,
  type CategoryConfig
} from "~/utils/categories";
import { KNOWN_LOCATIONS } from "~/utils/locations";
import { StructuredData } from "~/components/StructuredData";
import {
  buildBreadcrumbSchema,
  buildCategoryCollectionSchema,
} from "~/utils/schema";

export async function loader({ params, request }: Route.LoaderArgs) {
  const categorySlug = params.category;
  const category = getCategoryBySlug(categorySlug);

  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const location = url.searchParams.get("location") || "";
  const sort = (url.searchParams.get("sort") as "sponsored_first" | "newest" | "oldest") || "sponsored_first";
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;

  if (!category) {
    return data({
      category: null,
      ads: [],
      total: 0,
      totalPages: 1,
      page: 1,
      locations: [],
      search,
      location,
      sort,
      requestUrl: request.url
    }, { status: 404 });
  }

  const options: PublicAdsOptions = {
    category: category.name,
    search: search || undefined,
    location: location && location !== "ALL" ? location : undefined,
    sort_by: sort,
    page,
    limit: 12
  };

  const res = await getPublicAds(options);

  return {
    category,
    ads: res.data?.ads || [],
    total: res.data?.total || 0,
    totalPages: res.data?.total_pages || 1,
    page,
    locations: res.data?.locations || [],
    search,
    location,
    sort,
    requestUrl: request.url
  };
}

export async function clientLoader({ params, request, serverLoader }: Route.ClientLoaderArgs) {
  try {
    const serverData = await serverLoader();
    if (serverData && serverData.category) {
      return serverData;
    }
  } catch {
    // Fall back to client fetch
  }

  const categorySlug = params.category;
  const category = getCategoryBySlug(categorySlug);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const location = url.searchParams.get("location") || "";
  const sort = (url.searchParams.get("sort") as "sponsored_first" | "newest" | "oldest") || "sponsored_first";
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;

  if (!category) {
    return {
      category: null,
      ads: [],
      total: 0,
      totalPages: 1,
      page: 1,
      locations: [],
      search,
      location,
      sort,
      requestUrl: request.url
    };
  }

  const options: PublicAdsOptions = {
    category: category.name,
    search: search || undefined,
    location: location && location !== "ALL" ? location : undefined,
    sort_by: sort,
    page,
    limit: 12
  };

  const res = await getPublicAds(options);

  return {
    category,
    ads: res.data?.ads || [],
    total: res.data?.total || 0,
    totalPages: res.data?.total_pages || 1,
    page,
    locations: res.data?.locations || [],
    search,
    location,
    sort,
    requestUrl: request.url
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return buildCategoryMetaDescriptors(loaderData?.category, loaderData?.requestUrl);
}

const DEFAULT_INDIAN_METROS = [
  "Mumbai, Maharashtra",
  "Delhi NCR",
  "Bengaluru, Karnataka",
  "Hyderabad, Telangana",
  "Chennai, Tamil Nadu",
  "Kolkata, West Bengal",
  "Pune, Maharashtra",
  "Ahmedabad, Gujarat",
  "Jaipur, Rajasthan",
  "Surat, Gujarat",
  "Lucknow, Uttar Pradesh",
  "Chandigarh",
  "Kochi, Kerala",
  "Indore, Madhya Pradesh",
];

export default function CategoryPage({ loaderData }: Route.ComponentProps) {
  const { category } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  // If category is not supported, render friendly 404 with all valid category options
  if (!category) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-12 px-4 flex items-center justify-center">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-sm">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto text-3xl">
            🏷️
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Category Not Found
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              The category you requested does not exist or has been renamed. Explore our verified classified categories below:
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {SUPPORTED_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/category/${cat.slug}`}
                className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-center transition-colors group"
              >
                <div className="text-2xl mb-1">{cat.icon}</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                  {cat.displayName}
                </div>
              </Link>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <Link
              to="/ads"
              className="inline-block px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors"
            >
              ← Browse All Advertisements
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Filter and search states
  const [searchInput, setSearchInput] = useState(loaderData.search || "");
  const [selectedLocation, setSelectedLocation] = useState(loaderData.location || "");
  const [sortBy, setSortBy] = useState<"sponsored_first" | "newest" | "oldest">(
    loaderData.sort || "sponsored_first"
  );
  const [ads, setAds] = useState<AdItem[]>(loaderData.ads);
  const [total, setTotal] = useState(loaderData.total);
  const [page, setPage] = useState(loaderData.page);
  const [totalPages, setTotalPages] = useState(loaderData.totalPages);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);

  // Synchronize when loaderData changes
  useEffect(() => {
    setAds(loaderData.ads);
    setTotal(loaderData.total);
    setPage(loaderData.page);
    setTotalPages(loaderData.totalPages);
    setSearchInput(loaderData.search || "");
    setSelectedLocation(loaderData.location || "");
    setSortBy(loaderData.sort || "sponsored_first");
  }, [loaderData]);

  // Handle filter changes
  const applyFilters = (newSearch?: string, newLoc?: string, newSort?: string, newPage: number = 1) => {
    const params = new URLSearchParams();
    const q = newSearch !== undefined ? newSearch : searchInput;
    const loc = newLoc !== undefined ? newLoc : selectedLocation;
    const s = newSort !== undefined ? newSort : sortBy;

    if (q.trim()) params.set("q", q.trim());
    if (loc && loc !== "ALL") params.set("location", loc);
    if (s && s !== "sponsored_first") params.set("sort", s);
    if (newPage > 1) params.set("page", String(newPage));

    setSearchParams(params);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(searchInput, selectedLocation, sortBy, 1);
  };

  const handleLocationChange = (newLoc: string) => {
    setSelectedLocation(newLoc);
    applyFilters(searchInput, newLoc, sortBy, 1);
  };

  const handleSortChange = (newSort: "sponsored_first" | "newest" | "oldest") => {
    setSortBy(newSort);
    applyFilters(searchInput, selectedLocation, newSort, 1);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedLocation("");
    setSortBy("sponsored_first");
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(searchInput || selectedLocation || sortBy !== "sponsored_first" || page > 1);

  const breadcrumbSchema = buildBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Classifieds", url: "/ads" },
      { name: category.displayName, url: `/category/${category.slug}` },
    ],
    loaderData.requestUrl
  );

  const collectionSchema = buildCategoryCollectionSchema(
    category,
    ads,
    loaderData.requestUrl
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-6 sm:py-8">
      <StructuredData data={[breadcrumbSchema, collectionSchema]} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Link to="/" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link to="/ads" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
            Classifieds
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {category.displayName}
          </span>
        </nav>

        {/* Category Header with Unique H1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl sm:text-3xl shrink-0">
                {category.icon}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {category.h1}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {category.tagline} • <span className="font-semibold text-blue-700 dark:text-blue-400">{total} active {total === 1 ? 'advertisement' : 'advertisements'}</span>
                </p>
              </div>
            </div>

            <Link
              to="/post-ad"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0"
            >
              <span>+</span>
              <span>Post in {category.displayName}</span>
            </Link>
          </div>

          {/* Quick Category Switcher Pills */}
          <div className="pt-5 mt-5 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Explore Categories:
              </span>
              {SUPPORTED_CATEGORIES.map((cat) => {
                const isActive = cat.slug === category.slug;
                return (
                  <Link
                    key={cat.slug}
                    to={`/category/${cat.slug}`}
                    className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1 ${
                      isActive
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.displayName}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Keyword Search */}
            <div className="sm:col-span-6 relative">
              <input
                type="text"
                aria-label={`Search within ${category.displayName}`}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`Search within ${category.displayName}...`}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            </div>

            {/* Location Filter */}
            <div className="sm:col-span-3">
              <select
                aria-label="Filter by location"
                value={selectedLocation}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              >
                <option value="">All Locations</option>
                {DEFAULT_INDIAN_METROS.map((metro) => (
                  <option key={metro} value={metro}>
                    {metro}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Filter */}
            <div className="sm:col-span-3 flex gap-2">
              <select
                aria-label="Sort advertisements"
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as any)}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              >
                <option value="sponsored_first">Sponsored First</option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  title="Reset filters"
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Real Advertisements List */}
        {ads.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-4">
            <div className="text-4xl">{category.icon}</div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              No active advertisements found in {category.displayName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {hasActiveFilters
                ? "Try adjusting your search terms or clearing your location filter to see more advertisements."
                : `There are no listings in ${category.displayName} at this time. Post the first classified ad in this category!`}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  Clear All Filters
                </button>
              ) : (
                <Link
                  to="/post-ad"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  Post an Advertisement in {category.displayName}
                </Link>
              )}
              <Link
                to="/ads"
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Browse All Categories
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Grid of Crawlable Ad Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {ads.map((ad) => (
                <AdCard
                  key={ad.ad_id}
                  ad={ad}
                  onSelect={(selected) => setSelectedAd(selected)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => applyFilters(undefined, undefined, undefined, page - 1)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400 px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => applyFilters(undefined, undefined, undefined, page + 1)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick SEO Context Box at Bottom */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <h2 className="font-bold text-slate-900 dark:text-white">
            About {category.displayName} on FreeAdsPost
          </h2>
          <p className="leading-relaxed">
            {category.metaDescription} All advertisements are verified before publishing to maintain marketplace authenticity across India. To view verified seller contact details or respond to an advertisement, visit the advertisement details page.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Popular in this category:</span>
            {category.popularSearchTerms.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setSearchInput(term);
                  applyFilters(term, selectedLocation, sortBy, 1);
                }}
                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
              >
                {term}
              </button>
            ))}
          </div>
        </section>

        {/* Top Locations for this Category */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white text-sm">
            Top Locations for {category.displayName}
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Browse verified {category.displayName.toLowerCase()} advertisements in India&apos;s leading cities:
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {["mumbai", "delhi", "bengaluru", "hyderabad", "pune", "chennai", "kolkata"].map((slug) => {
              const loc = KNOWN_LOCATIONS.find((l) => l.slug === slug);
              if (!loc) return null;
              return (
                <Link
                  key={slug}
                  to={`/location/${slug}`}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold transition-colors"
                >
                  {category.displayName} in {loc.city} →
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* Detail Modal if an ad is selected via quick view */}
      {selectedAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                {selectedAd.category}
              </span>
              <button
                type="button"
                onClick={() => setSelectedAd(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {selectedAd.image_url && (
              <img
                src={selectedAd.image_url}
                alt={selectedAd.title}
                className="w-full h-48 object-cover rounded-lg"
              />
            )}

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {selectedAd.title}
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-4 leading-relaxed">
              {selectedAd.description}
            </p>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              📍 {selectedAd.location}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <Link
                to={`/ad/${selectedAd.slug || selectedAd.ad_id}`}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg text-center transition-colors"
              >
                View Full Advertisement →
              </Link>
              <button
                type="button"
                onClick={() => setSelectedAd(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
