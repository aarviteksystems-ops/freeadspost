import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { AdCard } from "~/components/AdCard";
import { useAuth } from "~/context/AuthContext";
import { getPublicAds, type AdItem, type PublicAdsOptions } from "~/services/api";

export function meta() {
  return [
    { title: "Browse Classifieds & Advertisements - FreeAds Post" },
    {
      name: "description",
      content: "Discover verified classified advertisements across Indian cities. Filter by category, location, and keywords with instant sorting."
    }
  ];
}

const CATEGORIES = [
  "ALL",
  "Services",
  "Electronics",
  "Real Estate",
  "Jobs",
  "Vehicles",
  "Community",
  "Buy / Sell",
  "Other"
];

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

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return String(dateStr);
  }
}

export default function AdsDiscoveryPage() {
  return <AdsDiscoveryContent />;
}

function AdsDiscoveryContent() {
  const { token, user, isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-synchronized or local filter states
  const initialSearch = searchParams.get("q") || "";
  const initialCategory = searchParams.get("category") || "ALL";
  const initialLocation = searchParams.get("location") || "";
  const initialSort = (searchParams.get("sort") as "sponsored_first" | "newest" | "oldest") || "sponsored_first";
  const initialPage = parseInt(searchParams.get("page") || "1", 10) || 1;

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [titleQuery, setTitleQuery] = useState("");
  const [descQuery, setDescQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedLocation, setSelectedLocation] = useState(initialLocation);
  const [sortBy, setSortBy] = useState<"sponsored_first" | "newest" | "oldest">(initialSort);
  const [page, setPage] = useState(initialPage);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Debounced search queries (350ms delay to prevent excessive API requests on keystroke)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [debouncedDesc, setDebouncedDesc] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setDebouncedTitle(titleQuery);
      setDebouncedDesc(descQuery);
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery, titleQuery, descQuery]);

  // Data states
  const [ads, setAds] = useState<AdItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected ad for detail modal
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);

  const PAGE_SIZE = 12;

  // Sync state changes with API call
  useEffect(() => {
    const fetchAds = async () => {
      setIsLoading(true);
      setError(null);

      const options: PublicAdsOptions = {
        category: selectedCategory !== "ALL" ? selectedCategory : undefined,
        location: selectedLocation.trim() || undefined,
        search: debouncedSearch.trim() || undefined,
        title: debouncedTitle.trim() || undefined,
        description: debouncedDesc.trim() || undefined,
        sort_by: sortBy,
        page: page,
        limit: PAGE_SIZE
      };

      try {
        const res = await getPublicAds(options, token || undefined);
        if (res.success && res.data) {
          setAds(res.data.ads || []);
          setTotal(res.data.total || 0);
          setTotalPages(res.data.total_pages || 1);
          setHasMore(Boolean(res.data.has_more));
          if (res.data.locations && res.data.locations.length > 0) {
            setAvailableLocations(res.data.locations);
          }
        } else {
          setError(res.error?.message || "Unable to load advertisements.");
        }
      } catch (err: any) {
        setError(err.message || "A network error occurred while discovering advertisements.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAds();
  }, [token, debouncedSearch, debouncedTitle, debouncedDesc, selectedCategory, selectedLocation, sortBy, page]);

  // Reset all filters to default
  const handleResetFilters = () => {
    setSearchQuery("");
    setTitleQuery("");
    setDescQuery("");
    setDebouncedSearch("");
    setDebouncedTitle("");
    setDebouncedDesc("");
    setSelectedCategory("ALL");
    setSelectedLocation("");
    setSortBy("sponsored_first");
    setPage(1);
    setSearchParams({});
  };

  const startRecord = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(page * PAGE_SIZE, total);

  // Combine fetched locations with default Indian metros
  const allLocationSuggestions = Array.from(
    new Set([...availableLocations, ...DEFAULT_INDIAN_METROS])
  );

  return (
    <div className="min-h-screen py-6 sm:py-8 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* ========================================================= */}
        {/* 1. HEADER BANNER                                          */}
        {/* ========================================================= */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <span>🇮🇳</span>
              <span>All India Classifieds Directory</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Classified Advertisements
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Search verified advertisements across India. Direct deals with no middleman commission.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <Link
              to="/post-ad"
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Post Free Ad</span>
            </Link>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. SEARCH & FILTER CONTROLS                               */}
        {/* ========================================================= */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm space-y-3">
          
          {/* Main Filter Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
            {/* General Search (Title & Description) */}
            <div className="lg:col-span-5 relative">
              <input
                type="text"
                placeholder="Search keywords, items, or services..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-8 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="lg:col-span-3">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === "ALL" ? "All Categories" : cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Location Filter with Indian Datalist */}
            <div className="lg:col-span-2">
              <input
                type="text"
                placeholder="City, State..."
                value={selectedLocation}
                onChange={(e) => {
                  setSelectedLocation(e.target.value);
                  setPage(1);
                }}
                list="available-locations-list"
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <datalist id="available-locations-list">
                {allLocationSuggestions.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>

            {/* Sorting */}
            <div className="lg:col-span-2">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as "sponsored_first" | "newest" | "oldest");
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="sponsored_first">Sponsored First</option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>

          {/* Toggle Advanced Fields & Reset */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-blue-700 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
            >
              {showAdvanced ? "▲ Hide Specific Title/Description Filter" : "▼ Search Specifically by Title or Description"}
            </button>

            {(searchQuery || titleQuery || descQuery || selectedCategory !== "ALL" || selectedLocation || sortBy !== "sponsored_first") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline"
              >
                Reset All Filters
              </button>
            )}
          </div>

          {/* Advanced Inputs */}
          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Filter by Title Only
                </label>
                <input
                  type="text"
                  placeholder="e.g. iPhone, 2BHK Apartment, Plumber..."
                  value={titleQuery}
                  onChange={(e) => {
                    setTitleQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Filter by Description Only
                </label>
                <input
                  type="text"
                  placeholder="Keywords within body text..."
                  value={descQuery}
                  onChange={(e) => {
                    setDescQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* 3. RESULTS COUNT & ACTIVE FILTER SUMMARY                  */}
        {/* ========================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1 text-xs text-slate-600 dark:text-slate-400">
          <div>
            {!isLoading && (
              <span>
                Showing <strong className="text-slate-900 dark:text-white">{startRecord}</strong>–<strong className="text-slate-900 dark:text-white">{endRecord}</strong> of{" "}
                <strong className="text-slate-900 dark:text-white">{total}</strong> verified ad{total !== 1 ? "s" : ""}
                {selectedCategory !== "ALL" && (
                  <span> in <strong className="text-slate-900 dark:text-white">{selectedCategory}</strong></span>
                )}
                {selectedLocation && (
                  <span> in &ldquo;<strong className="text-slate-900 dark:text-white">{selectedLocation}</strong>&rdquo;</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span>Sorted by:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {sortBy === "sponsored_first" ? "Sponsored Priority" : sortBy === "newest" ? "Newest Date" : "Oldest Date"}
            </span>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200 text-xs">
            {error}
          </div>
        )}

        {/* ========================================================= */}
        {/* 4. ADVERTISEMENT GRID                                     */}
        {/* ========================================================= */}
        {isLoading ? (
          /* Loading Skeletons */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 animate-pulse"
              >
                <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
                <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
              </div>
            ))}
          </div>
        ) : ads.length === 0 ? (
          /* Empty State */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center space-y-3 shadow-sm my-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-2xl">
              🏷️
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No advertisements match your search
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              We couldn&apos;t find any approved advertisements matching your criteria. Try adjusting your search query, choosing &ldquo;ALL&rdquo; categories, or clearing the location filter.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-xs font-semibold"
              >
                Clear All Filters
              </button>
              <Link
                to="/post-ad"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-bold shadow-sm"
              >
                + Post an Ad Here
              </Link>
            </div>
          </div>
        ) : (
          /* Reusable Cards Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ads.map((ad) => (
              <AdCard key={ad.ad_id} ad={ad} onSelect={(selected) => setSelectedAd(selected)} />
            ))}
          </div>
        )}

        {/* ========================================================= */}
        {/* 5. SERVER-SIDE PAGINATION                                 */}
        {/* ========================================================= */}
        {!isLoading && totalPages > 1 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Page <strong className="text-slate-900 dark:text-white">{page}</strong> of{" "}
              <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>

              {/* Number Buttons */}
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .map((p, idx, arr) => {
                    const prevP = arr[idx - 1];
                    const showEllipsis = prevP && p - prevP > 1;
                    return (
                      <span key={p} className="flex items-center gap-1">
                        {showEllipsis && <span className="text-xs text-slate-400 px-1">...</span>}
                        <button
                          type="button"
                          onClick={() => setPage(p)}
                          className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${
                            page === p
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}
              </div>

              <button
                type="button"
                disabled={page >= totalPages || !hasMore}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================= */}
      {/* 6. MODAL: ADVERTISEMENT DETAILS                           */}
      {/* ========================================================= */}
      {selectedAd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4 my-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {selectedAd.category}
                  </span>
                  {selectedAd.is_sponsored && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-slate-950 uppercase">
                      ★ SPONSORED
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1.5 leading-snug">
                  {selectedAd.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAd(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none p-1"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            {/* External Image (if provided) */}
            {selectedAd.image_url && (
              <div className="rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 max-h-60 flex items-center justify-center">
                <img
                  src={selectedAd.image_url}
                  alt={selectedAd.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain max-h-60"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Description
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800">
                {selectedAd.description}
              </p>
            </div>

            {/* Metadata Specs */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Location</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedAd.location}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Contact Preference</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">{selectedAd.contact_preference}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Published</span>
                <span className="text-slate-700 dark:text-slate-300">{formatDate(selectedAd.approved_at || selectedAd.created_at)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Valid Until</span>
                <span className="text-slate-700 dark:text-slate-300">{formatDate(selectedAd.expires_at)}</span>
              </div>
            </div>

            {/* Seller & Contact Information (Protected Server-Side) */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Seller: {selectedAd.seller?.name || "Verified Seller"}
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ Verified Member
                </span>
              </div>

              {!isAuthenticated ? (
                <div className="border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/40 rounded-lg p-3.5 text-center space-y-2">
                  <div className="text-base">🔒</div>
                  <div className="font-bold text-slate-900 dark:text-white text-xs">
                    Login to view contact information
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    To protect sellers from spam and fraud, phone numbers and email addresses are only accessible to verified members.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <Link
                      to={`/login?redirect=${encodeURIComponent(`/ad/${selectedAd.ad_id}`)}`}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-md transition-colors"
                    >
                      Log In
                    </Link>
                    <Link
                      to="/register"
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-md hover:bg-slate-50 transition-colors"
                    >
                      Register
                    </Link>
                  </div>
                </div>
              ) : !(user?.email_verified === true || String(user?.email_verified).toLowerCase() === "true") ? (
                <div className="border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/40 rounded-lg p-3 text-center space-y-1.5">
                  <div className="text-base">✉️</div>
                  <div className="font-bold text-slate-900 dark:text-white text-xs">
                    Verify email to view seller contact
                  </div>
                  <Link
                    to="/verify-email"
                    className="inline-block text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    Verify your email now →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {(selectedAd.contact?.phone || selectedAd.seller?.phone) && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Phone:</span>
                      <a
                        href={`tel:${selectedAd.contact?.phone || selectedAd.seller?.phone}`}
                        className="font-bold text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        {selectedAd.contact?.phone || selectedAd.seller?.phone}
                      </a>
                    </div>
                  )}
                  {(selectedAd.contact?.email || selectedAd.seller?.email) && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Email:</span>
                      <a
                        href={`mailto:${selectedAd.contact?.email || selectedAd.seller?.email}`}
                        className="font-bold text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        {selectedAd.contact?.email || selectedAd.seller?.email}
                      </a>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    {(selectedAd.contact?.phone || selectedAd.seller?.phone) && (
                      <a
                        href={`tel:${selectedAd.contact?.phone || selectedAd.seller?.phone}`}
                        className="flex-1 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded text-center"
                      >
                        Call Seller
                      </a>
                    )}
                    {(selectedAd.contact?.phone || selectedAd.seller?.phone) && (
                      <a
                        href={`https://wa.me/${(selectedAd.contact?.phone || selectedAd.seller?.phone || "").replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded text-center"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-center">
                <Link
                  to={`/ad/${selectedAd.ad_id}`}
                  className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Open Full Ad Page</span>
                  <span>↗</span>
                </Link>
              </div>
            </div>

            {/* Safety Caution Notice */}
            <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-900 dark:text-amber-200">
              🛡️ <strong>Safety Advice:</strong> Meet the seller in person in a safe public location. Verify goods before making any UPI/cash payment.
            </div>

            {/* Close Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setSelectedAd(null)}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded transition-colors"
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
