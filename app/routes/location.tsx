import { useState, useEffect } from "react";
import { Link, useSearchParams, data } from "react-router";
import type { Route } from "./+types/location";
import { AdCard } from "~/components/AdCard";
import { getPublicAds, type AdItem, type PublicAdsOptions } from "~/services/api";
import {
  KNOWN_LOCATIONS,
  getLocationBySlug,
  buildLocationMetaDescriptors,
  type LocationConfig
} from "~/utils/locations";
import { SUPPORTED_CATEGORIES } from "~/utils/categories";
import { StructuredData } from "~/components/StructuredData";
import {
  buildBreadcrumbSchema,
  buildLocationCollectionSchema,
} from "~/utils/schema";

export async function loader({ params, request }: Route.LoaderArgs) {
  const locationSlug = params.location;
  const location = getLocationBySlug(locationSlug);

  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category") || "ALL";
  const sort = (url.searchParams.get("sort") as "sponsored_first" | "newest" | "oldest") || "sponsored_first";
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;

  if (!location) {
    return data({
      location: null,
      ads: [],
      total: 0,
      totalPages: 1,
      page: 1,
      activeCategories: [],
      search,
      category,
      sort,
      requestUrl: request.url
    }, { status: 404 });
  }

  // Fetch all ads in this location to discover active categories present in this city
  const allCityAdsRes = await getPublicAds({ location: location.city, limit: 50 });
  const allCityAds = allCityAdsRes.data?.ads || [];

  const categoryCounts: Record<string, number> = {};
  for (const ad of allCityAds) {
    if (ad.category) {
      categoryCounts[ad.category] = (categoryCounts[ad.category] || 0) + 1;
    }
  }

  const activeCategories = Object.entries(categoryCounts).map(([name, count]) => ({
    name,
    count
  }));

  // Fetch filtered ads
  const options: PublicAdsOptions = {
    location: location.city,
    category: category !== "ALL" ? category : undefined,
    search: search || undefined,
    sort_by: sort,
    page,
    limit: 12
  };

  const res = await getPublicAds(options);

  return {
    location,
    ads: res.data?.ads || [],
    total: res.data?.total || 0,
    totalPages: res.data?.total_pages || 1,
    page,
    activeCategories,
    search,
    category,
    sort,
    requestUrl: request.url
  };
}

export async function clientLoader({ params, request, serverLoader }: Route.ClientLoaderArgs) {
  try {
    const serverData = await serverLoader();
    if (serverData && serverData.location) {
      return serverData;
    }
  } catch {
    // Fall back to client fetch
  }

  const locationSlug = params.location;
  const location = getLocationBySlug(locationSlug);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category") || "ALL";
  const sort = (url.searchParams.get("sort") as "sponsored_first" | "newest" | "oldest") || "sponsored_first";
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;

  if (!location) {
    return {
      location: null,
      ads: [],
      total: 0,
      totalPages: 1,
      page: 1,
      activeCategories: [],
      search,
      category,
      sort,
      requestUrl: request.url
    };
  }

  const allCityAdsRes = await getPublicAds({ location: location.city, limit: 50 });
  const allCityAds = allCityAdsRes.data?.ads || [];
  const categoryCounts: Record<string, number> = {};
  for (const ad of allCityAds) {
    if (ad.category) {
      categoryCounts[ad.category] = (categoryCounts[ad.category] || 0) + 1;
    }
  }
  const activeCategories = Object.entries(categoryCounts).map(([name, count]) => ({
    name,
    count
  }));

  const options: PublicAdsOptions = {
    location: location.city,
    category: category !== "ALL" ? category : undefined,
    search: search || undefined,
    sort_by: sort,
    page,
    limit: 12
  };

  const res = await getPublicAds(options);

  return {
    location,
    ads: res.data?.ads || [],
    total: res.data?.total || 0,
    totalPages: res.data?.total_pages || 1,
    page,
    activeCategories,
    search,
    category,
    sort,
    requestUrl: request.url
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return buildLocationMetaDescriptors(
    loaderData?.location,
    loaderData?.total || 0,
    loaderData?.requestUrl
  );
}

export default function LocationPage({ loaderData }: Route.ComponentProps) {
  const { location } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  // 404 / Location Not Found Fallback
  if (!location) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-12 px-4 flex items-center justify-center">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-sm">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto text-3xl">
            📍
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Location Not Found
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              The requested city or location is not recognized. Browse active classified hubs across India below:
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            {KNOWN_LOCATIONS.slice(0, 6).map((loc) => (
              <Link
                key={loc.slug}
                to={`/location/${loc.slug}`}
                className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-center transition-colors group"
              >
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                  {loc.city}
                </div>
                <div className="text-[10px] text-slate-400 truncate">{loc.state}</div>
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

  const [searchInput, setSearchInput] = useState(loaderData.search || "");
  const [selectedCategory, setSelectedCategory] = useState(loaderData.category || "ALL");
  const [sortBy, setSortBy] = useState<"sponsored_first" | "newest" | "oldest">(
    loaderData.sort || "sponsored_first"
  );
  const [ads, setAds] = useState<AdItem[]>(loaderData.ads);
  const [total, setTotal] = useState(loaderData.total);
  const [page, setPage] = useState(loaderData.page);
  const [totalPages, setTotalPages] = useState(loaderData.totalPages);
  const [activeCategories, setActiveCategories] = useState(loaderData.activeCategories || []);
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);

  useEffect(() => {
    setAds(loaderData.ads);
    setTotal(loaderData.total);
    setPage(loaderData.page);
    setTotalPages(loaderData.totalPages);
    setActiveCategories(loaderData.activeCategories || []);
    setSearchInput(loaderData.search || "");
    setSelectedCategory(loaderData.category || "ALL");
    setSortBy(loaderData.sort || "sponsored_first");
  }, [loaderData]);

  const applyFilters = (newSearch?: string, newCat?: string, newSort?: string, newPage: number = 1) => {
    const params = new URLSearchParams();
    const q = newSearch !== undefined ? newSearch : searchInput;
    const c = newCat !== undefined ? newCat : selectedCategory;
    const s = newSort !== undefined ? newSort : sortBy;

    if (q.trim()) params.set("q", q.trim());
    if (c && c !== "ALL") params.set("category", c);
    if (s && s !== "sponsored_first") params.set("sort", s);
    if (newPage > 1) params.set("page", String(newPage));

    setSearchParams(params);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(searchInput, selectedCategory, sortBy, 1);
  };

  const handleCategoryChange = (newCat: string) => {
    setSelectedCategory(newCat);
    applyFilters(searchInput, newCat, sortBy, 1);
  };

  const handleSortChange = (newSort: "sponsored_first" | "newest" | "oldest") => {
    setSortBy(newSort);
    applyFilters(searchInput, selectedCategory, newSort, 1);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedCategory("ALL");
    setSortBy("sponsored_first");
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(searchInput || selectedCategory !== "ALL" || sortBy !== "sponsored_first" || page > 1);

  const breadcrumbSchema = buildBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Classifieds", url: "/ads" },
      { name: location.city, url: `/location/${location.slug}` },
    ],
    loaderData.requestUrl
  );

  const collectionSchema =
    ads.length > 0
      ? buildLocationCollectionSchema(location, ads, loaderData.requestUrl)
      : null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-6 sm:py-8">
      <StructuredData
        data={collectionSchema ? [breadcrumbSchema, collectionSchema] : [breadcrumbSchema]}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Navigation Breadcrumbs */}
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
            {location.city}
          </span>
        </nav>

        {/* Location Header with Unique H1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-2xl sm:text-3xl shrink-0">
                📍
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {location.h1}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {location.fullName} • <span className="font-semibold text-blue-700 dark:text-blue-400">{total} verified {total === 1 ? 'advertisement' : 'advertisements'}</span>
                </p>
              </div>
            </div>

            <Link
              to="/post-ad"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0"
            >
              <span>+</span>
              <span>Post Ad in {location.city}</span>
            </Link>
          </div>

          {/* Relevant Active Categories in this Location */}
          {activeCategories.length > 0 && (
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Active in {location.city}:
                </span>
                <button
                  type="button"
                  onClick={() => handleCategoryChange("ALL")}
                  className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === "ALL"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  All Categories ({total})
                </button>
                {activeCategories.map((ac) => {
                  const isSelected = selectedCategory.toLowerCase() === ac.name.toLowerCase();
                  return (
                    <button
                      key={ac.name}
                      type="button"
                      onClick={() => handleCategoryChange(ac.name)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-blue-700 text-white shadow-xs"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span>{ac.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-blue-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                        {ac.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Keyword Search */}
            <div className="sm:col-span-6 relative">
              <input
                type="text"
                aria-label={`Search advertisements in ${location.city}`}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`Search advertisements in ${location.city}...`}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            </div>

            {/* Category Filter */}
            <div className="sm:col-span-3">
              <select
                aria-label="Filter by category"
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              >
                <option value="ALL">All Categories</option>
                {SUPPORTED_CATEGORIES.map((cat) => (
                  <option key={cat.slug} value={cat.name}>
                    {cat.displayName}
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

        {/* Real Active Advertisements Grid */}
        {ads.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-4">
            <div className="text-4xl">📍</div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              No advertisements currently active in {location.city}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {hasActiveFilters
                ? "Try clearing your category filter or search keywords to see all available listings."
                : `We do not have active classified listings in ${location.city} right now. Be the first to post a verified advertisement in this city!`}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
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
                  Post an Advertisement in {location.city}
                </Link>
              )}
              <Link
                to="/ads"
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Browse All Indian Cities
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
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

        {/* Explore Other Active Metro Cities Section */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs text-slate-600 dark:text-slate-400 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">
            Classified Advertisements Across Other Indian Cities
          </h2>
          <p className="leading-relaxed">
            FreeAdsPost connects buyers and sellers across Indian metropolitan hubs with verified listings, spam protection, and contact security. Explore advertisements in other cities:
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {KNOWN_LOCATIONS.filter((l) => l.slug !== location.slug).map((otherLoc) => (
              <Link
                key={otherLoc.slug}
                to={`/location/${otherLoc.slug}`}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-md font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
              >
                Classifieds in {otherLoc.city}
              </Link>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <span className="font-bold text-slate-900 dark:text-white block">
              Browse Categories Across India:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {SUPPORTED_CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/category/${cat.slug}`}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-medium transition-colors inline-flex items-center gap-1"
                >
                  <span>{cat.icon}</span>
                  <span>{cat.displayName}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Detail Modal if selected */}
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
