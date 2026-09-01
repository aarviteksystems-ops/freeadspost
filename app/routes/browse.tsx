import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/browse";
import { getAds, CATEGORIES, type Ad } from "../utils/db";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Browse Ads – FreeAdsPost" },
    { name: "description", content: "Browse free classified ads by category on FreeAdsPost." },
  ];
}

const PER_PAGE = 12;

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ads, setAds] = useState<Ad[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  // Read URL parameters
  const activeCategory = searchParams.get("cat") || "";
  const searchQuery = searchParams.get("q") || "";
  const currentPage = Number(searchParams.get("page") || "1");

  useEffect(() => {
    async function loadAds() {
      const data = await getAds();
      setAds(data);
    }
    loadAds();
  }, []);

  // Sync search input with URL search query
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const handleCategoryClick = (categorySlug: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (categorySlug) {
      newParams.set("cat", categorySlug);
    } else {
      newParams.delete("cat");
    }
    newParams.delete("page");
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      newParams.set("q", searchInput.trim());
    } else {
      newParams.delete("q");
    }
    newParams.delete("page");
    setSearchParams(newParams);
  };

  const handlePageClick = (pageNum: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", pageNum.toString());
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filter ads
  let filteredAds = [...ads];
  if (activeCategory) {
    filteredAds = filteredAds.filter((a) => a.category === activeCategory);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredAds = filteredAds.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q)
    );
  }

  // Sort ads
  if (sortBy === "newest") {
    filteredAds.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  } else if (sortBy === "oldest") {
    filteredAds.sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
  } else if (sortBy === "price-low") {
    filteredAds.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sortBy === "price-high") {
    filteredAds.sort((a, b) => Number(b.price) - Number(a.price));
  }

  // Pagination calculations
  const totalPages = Math.ceil(filteredAds.length / PER_PAGE);
  const paginatedAds = filteredAds.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE
  );

  const getAdPriceDisplay = (ad: Ad) => {
    if (ad.priceType === "free") return "🆓 Free";
    if (ad.priceType === "contact") return "Contact";
    return `₹${Number(ad.price).toLocaleString("en-IN")}${
      ad.priceType === "negotiable" ? " (Neg.)" : ""
    }`;
  };

  const getFormattedDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  };

  const getCategoryLabel = (slug: string) => {
    const found = CATEGORIES.find((c) => c.slug === slug);
    return found ? found.label : "All Ads";
  };

  return (
    <>
      <section className="page-hero">
        <div className="hero-bg-glow glow1"></div>
        <div className="container">
          <div className="page-hero-text">
            <h1>
              Browse <span className="gradient-text">All Ads</span>
            </h1>
            <p>Find what you're looking for across thousands of listings</p>
          </div>
          <form onSubmit={handleSearchSubmit} className="browse-search-bar">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search ads..."
            />
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="container browse-layout">
          {/* SIDEBAR */}
          <aside className="browse-sidebar">
            <div className="sidebar-card">
              <h3>📂 Categories</h3>
              <ul className="cat-list">
                <li>
                  <button
                    onClick={() => handleCategoryClick("")}
                    className={`cat-link btn-link ${activeCategory === "" ? "active" : ""}`}
                    style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
                  >
                    All Categories{" "}
                    <span className="cat-count">{ads.length}</span>
                  </button>
                </li>
                {CATEGORIES.map((cat) => {
                  const count = ads.filter((a) => a.category === cat.slug).length;
                  return (
                    <li key={cat.slug}>
                      <button
                        onClick={() => handleCategoryClick(cat.slug)}
                        className={`cat-link btn-link ${activeCategory === cat.slug ? "active" : ""}`}
                        style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
                      >
                        {cat.icon} {cat.label}{" "}
                        <span className="cat-count">{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="sidebar-card">
              <h3>⚙️ Sort By</h3>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete("page");
                  setSearchParams(newParams);
                }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
            </div>
            <Link to="/post-ad" className="btn btn-primary sidebar-post-btn">
              + Post Your Ad Free
            </Link>
          </aside>

          {/* ADS PANEL */}
          <div className="browse-main">
            <div className="browse-toolbar">
              <span>{getCategoryLabel(activeCategory)}</span>
              <span className="badge">
                {filteredAds.length} Ad{filteredAds.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="ads-grid">
              {paginatedAds.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔍</div>
                  <h3>No Ads Found</h3>
                  <p>Try a different search or category.</p>
                  <Link to="/post-ad" className="btn btn-primary">
                    Post the First Ad
                  </Link>
                </div>
              ) : (
                paginatedAds.map((ad) => {
                  const cat = CATEGORIES.find((c) => c.slug === ad.category) || {
                    icon: "📦",
                    color: "#64748b",
                    label: ad.category,
                  };
                  return (
                    <Link
                      key={ad.id}
                      to={`/ad-detail?id=${ad.id}`}
                      className="ad-card"
                      style={{ "--cat-color": cat.color } as React.CSSProperties}
                    >
                      <div className="ad-card-img">
                        {ad.image ? (
                          <img
                            src={ad.image}
                            alt={ad.title}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                const placeholder = document.createElement("div");
                                placeholder.className = "ad-img-placeholder";
                                placeholder.innerText = cat.icon;
                                parent.appendChild(placeholder);
                              }
                            }}
                          />
                        ) : (
                          <div className="ad-img-placeholder">{cat.icon}</div>
                        )}
                        <span className="ad-cat-chip">
                          {cat.icon} {cat.label}
                        </span>
                      </div>
                      <div className="ad-card-body">
                        <h3 className="ad-card-title">{ad.title}</h3>
                        <p className="ad-card-desc">
                          {ad.description.substring(0, 80)}
                          {ad.description.length > 80 ? "…" : ""}
                        </p>
                        <div className="ad-card-footer">
                          <span className="ad-price">{getAdPriceDisplay(ad)}</span>
                          <span className="ad-location">📍 {ad.city}</span>
                          <span style={{ color: "#16a34a", fontSize: "0.78rem", fontWeight: 600 }}>🟢 Seller available</span>
                          <span className="ad-date">🕐 {getFormattedDate(ad.postedAt)}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="pagination">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => handlePageClick(pageNum)}
                    className={`page-btn ${pageNum === currentPage ? "active" : ""}`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
