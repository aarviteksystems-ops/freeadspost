import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useAuth } from "~/context/AuthContext";
import { getPublicAds, type AdItem } from "~/services/api";
import { AdCard } from "~/components/AdCard";
import { toCategorySlug } from "~/utils/categories";
import { StructuredData } from "~/components/StructuredData";
import { buildWebSiteSchema, buildOrganizationSchema } from "~/utils/schema";

export function meta() {
  return [
    { title: "Buy, sell, and discover trusted services locally." },
    {
      name: "description",
      content: "Browse verified Indian classified advertisements. Find trusted local services, jobs, real estate, electronics, and vehicles."
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

const POPULAR_CITIES = [
  "All India",
  "Mumbai",
  "Delhi NCR",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
];

const CATEGORY_TILES = [
  { name: "Vehicles", icon: "🚗", count: "Cars & Bikes" },
  { name: "Real Estate", icon: "🏢", count: "Rent & Sale" },
  { name: "Jobs", icon: "💼", count: "Local Openings" },
  { name: "Electronics", icon: "📱", count: "Gadgets & Appliances" },
  { name: "Services", icon: "🛠️", count: "Local Experts" },
  { name: "Buy / Sell", icon: "🛒", count: "Deals & Goods" },
];

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Recently";
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

export default function Home() {
  const { isAuthenticated, token, user } = useAuth();

  // State for authenticated ad browsing
  const [ads, setAds] = useState<AdItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);

  // Fetch approved ads for both visitors and authenticated users
  useEffect(() => {
    const loadAds = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getPublicAds(
          {
            category: selectedCategory !== "ALL" ? selectedCategory : undefined,
            search: searchQuery.trim() || undefined,
            location: selectedLocation.trim() || undefined,
          },
          token || undefined
        );

        if (res.success && res.data) {
          setAds(res.data.ads || []);
        } else {
          setError(res.error?.message || "Failed to load advertisements.");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      } finally {
        setIsLoading(false);
      }
    };

    loadAds();
  }, [token, selectedCategory, searchQuery, selectedLocation]);

  const webSiteSchema = buildWebSiteSchema();
  const orgSchema = buildOrganizationSchema();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-slate-50 dark:bg-slate-950">
      <StructuredData data={[webSiteSchema, orgSchema]} />
      {/* ========================================================= */}
      {/* 1. TRUSTED INDIAN CLASSIFIEDS HERO & SEARCH HEADER         */}
      {/* ========================================================= */}
      <section className="bg-slate-900 text-white border-b border-slate-800 py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="max-w-3xl space-y-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold bg-slate-800 text-amber-400 border border-slate-700">
              <span>🇮🇳</span>
              <span>Buy, sell, and discover trusted services locally.</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Buy, sell, and discover trusted services locally.
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              FreeAds Post connects genuine individuals and verified local businesses. Every advertisement is reviewed by our administration team to prevent spam and maintain a safe marketplace.
            </p>
          </div>

          {/* Quick Search & City Controls */}
          <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 max-w-4xl">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3">
              {/* Search Input */}
              <div className="sm:col-span-6 relative">
                <span className="absolute left-3 top-3 text-slate-400 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Find cars, phones, flats, jobs, services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 rounded-md text-xs sm:text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Location Quick Select */}
              <div className="sm:col-span-4 relative">
                <span className="absolute left-3 top-3 text-slate-400 text-sm">📍</span>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value === "All India" ? "" : e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-md text-xs sm:text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {POPULAR_CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Link */}
              <div className="sm:col-span-2">
                <Link
                  to={`/ads${searchQuery || (selectedLocation && selectedLocation !== "All India")
                    ? `?${new URLSearchParams({
                      ...(searchQuery ? { q: searchQuery } : {}),
                      ...(selectedLocation && selectedLocation !== "All India" ? { location: selectedLocation } : {}),
                    }).toString()}`
                    : ""
                    }`}
                  className="w-full h-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold rounded-md flex items-center justify-center transition-colors shadow-sm"
                >
                  Browse All
                </Link>
              </div>
            </div>
          </div>

          {!isAuthenticated && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/register"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-md border border-slate-700 transition-colors"
              >
                Create Free Account
              </Link>
              <Link
                to="/post-ad"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold rounded-md border border-slate-700 transition-colors"
              >
                + Post Free Ad
              </Link>
              <Link
                to="/login"
                className="text-xs text-slate-400 hover:text-white transition-colors underline ml-1"
              >
                Already a member? Sign In
              </Link>
            </div>
          )}

          {/* Trust Value Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>100% Moderated:</strong> No spam or scam ads</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Verified Accounts:</strong> Genuine Indian phone &amp; email</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Completely Free:</strong> 0% commission on direct deals</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. POPULAR CATEGORIES GRID                                */}
      {/* ========================================================= */}
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Popular Categories
            </h2>
            <Link to="/ads" className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline">
              View all categories →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {CATEGORY_TILES.map((cat) => (
              <Link
                key={cat.name}
                to={`/category/${toCategorySlug(cat.name)}`}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-all hover:border-blue-500 hover:shadow-xs group"
              >
                <div className="text-2xl mb-1">{cat.icon}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                  {cat.name}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {cat.count}
                </div>
              </Link>
            ))}
          </div>

          {/* Active Metro City Links */}
          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
            <span className="font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-[10px]">
              Active Locations:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/location/mumbai" className="text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold">
                📍 Mumbai
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link to="/location/delhi" className="text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold">
                📍 Delhi NCR
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link to="/location/bengaluru" className="text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold">
                📍 Bengaluru
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link to="/location/hyderabad" className="text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold">
                📍 Hyderabad
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link to="/location/pune" className="text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold">
                📍 Pune
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link to="/location/chennai" className="text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold">
                📍 Chennai
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link to="/location/kolkata" className="text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold">
                📍 Kolkata
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. CLASSIFIED LISTINGS FEED (PUBLIC & AUTHENTICATED)      */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 flex-1">
        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Fresh Recommendations in India
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified classified ads across Indian cities.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === cat
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200 text-xs">
            {error}
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 py-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 animate-pulse"
              >
                <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
                <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded"></div>
              </div>
            ))}
          </div>
        ) : ads.length === 0 ? (
          /* Empty State */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center space-y-3 shadow-sm my-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-2xl">
              📋
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              No active advertisements found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {selectedCategory !== "ALL" || searchQuery || selectedLocation
                ? "No listings match your current search or location filter. Try choosing 'ALL' categories or clearing search keywords."
                : "There are currently no active classifieds published. Be the first to post a free ad!"}
            </p>
            <div className="pt-2">
              <Link
                to="/post-ad"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md shadow-sm inline-block"
              >
                + Post Free Advertisement
              </Link>
            </div>
          </div>
        ) : (
          /* Ads Grid */
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {ads.map((ad) => (
                <AdCard key={ad.ad_id} ad={ad} onSelect={(selected) => setSelectedAd(selected)} />
              ))}
            </div>

            <div className="text-center pt-4">
              <Link
                to="/ads"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                <span>Open Full Advertisement Discovery Portal</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* 4. POPULAR CLASSIFIED SEARCHES ACROSS INDIA               */}
      {/* ========================================================= */}
      <section className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Explore Popular Indian Classifieds
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Direct links to verified local listings in India&apos;s leading cities.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 text-xs">
            <div className="space-y-2.5">
              <span className="font-bold text-slate-900 dark:text-white block text-sm">Metropolitan Hubs</span>
              <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                <li>
                  <Link to="/location/delhi" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Used Cars &amp; Vehicles in Delhi NCR
                  </Link>
                </li>
                <li>
                  <Link to="/location/mumbai" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Professional Services in Mumbai
                  </Link>
                </li>
                <li>
                  <Link to="/location/bengaluru" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Web &amp; IT Services in Bengaluru
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <span className="font-bold text-slate-900 dark:text-white block text-sm">Jobs &amp; Properties</span>
              <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                <li>
                  <Link to="/location/hyderabad" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Flats &amp; Real Estate in Hyderabad
                  </Link>
                </li>
                <li>
                  <Link to="/location/pune" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Tech Jobs in Pune
                  </Link>
                </li>
                <li>
                  <Link to="/category/jobs" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    All Employment Vacancies
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <span className="font-bold text-slate-900 dark:text-white block text-sm">Electronics &amp; Goods</span>
              <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                <li>
                  <Link to="/location/chennai" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Laptops &amp; Gadgets in Chennai
                  </Link>
                </li>
                <li>
                  <Link to="/location/kolkata" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Furniture &amp; Goods in Kolkata
                  </Link>
                </li>
                <li>
                  <Link to="/category/electronics" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Electronics Classifieds
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <span className="font-bold text-slate-900 dark:text-white block text-sm">Top Categories</span>
              <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                <li>
                  <Link to="/category/vehicles" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Cars &amp; Vehicles for Sale
                  </Link>
                </li>
                <li>
                  <Link to="/category/real-estate" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Homes &amp; Commercial Real Estate
                  </Link>
                </li>
                <li>
                  <Link to="/category/services" className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline">
                    Verified Local Services
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. ABOUT & SAFETY IN THE INDIAN MARKETPLACE                */}
      {/* ========================================================= */}
      <section id="about" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="max-w-2xl space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">
              Why FreeAds Post
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Built for trustworthy, direct community commerce.
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Unlike unmoderated boards riddled with outdated numbers and spam links, FreeAds Post was engineered with strict quality moderation and user privacy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-2.5">
              <div className="w-9 h-9 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold text-base">
                🛡️
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Human Moderation Review
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Every classified ad is manually reviewed by an administrator. Inappropriate listings, misleading pricing, and fraudulent links are rejected promptly.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-2.5">
              <div className="w-9 h-9 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold text-base">
                ✉️
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Verified Community
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                All authors and viewers must verify their email. No anonymous disposable accounts are permitted on the platform.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-2.5">
              <div className="w-9 h-9 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center font-bold text-base">
                🇮🇳
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Local Indian Classifieds
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Targeted by Indian cities and states. Deals happen directly between buyer and seller with zero hidden intermediary fees.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. MODAL: ADVERTISEMENT DETAILS                           */}
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
                aria-label="Close modal"
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
                Listing Details
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
                <span className="text-slate-400 block text-[10px] uppercase">Contact Via</span>
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

            {/* Seller & Contact Details (Protected Server-Side) */}
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
                      to={`/login?redirect=${encodeURIComponent(`/ad/${selectedAd.slug || selectedAd.ad_id}`)}`}
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
                  to={`/ad/${selectedAd.slug || selectedAd.ad_id}`}
                  className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Open Full Ad Page</span>
                  <span>↗</span>
                </Link>
              </div>
            </div>

            {/* Safety Caution Notice */}
            <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-900 dark:text-amber-200">
              🛡️ <strong>Safety Advice:</strong> Meet the seller in a public place. Inspect products thoroughly before transferring payment. Never share confidential banking OTPs.
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
