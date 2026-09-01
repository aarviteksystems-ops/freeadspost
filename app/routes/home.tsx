import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/home";
import { getAds, CATEGORIES, type Ad } from "../utils/db";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FreeAdsPost – Post Free Classified Ads" },
    { name: "description", content: "Post and browse free classified ads in categories like real estate, jobs, vehicles, electronics and more. 100% free." },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [ads, setAds] = useState<Ad[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [adsCount, setAdsCount] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    async function loadAds() {
      const loadedAds = await getAds();
      setAds(loadedAds);

      // Simple counter animation
      if (loadedAds.length > 0) {
        let current = 0;
        const target = loadedAds.length;
        const step = Math.max(1, Math.floor(target / 40));
        timer = setInterval(() => {
          current = Math.min(current + step, target);
          setAdsCount(current);
          if (current >= target) {
            if (timer) clearInterval(timer);
          }
        }, 40);
      }
    }
    loadAds();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    let url = "/browse?";
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.append("q", searchQuery.trim());
    if (searchCategory) params.append("cat", searchCategory);
    navigate(url + params.toString());
  };

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

  // 6 latest ads
  const latestAds = ads.slice(0, 6);

  return (
    <>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg-glow glow1"></div>
        <div className="hero-bg-glow glow2"></div>
        <div className="hero-bg-glow glow3"></div>
        <div className="container hero-content">
          <div className="hero-badge">🎉 100% Free — No Hidden Fees</div>
          <h1 className="hero-title">
            Buy, Sell &amp; Connect
            <br />
            <span className="gradient-text">All in One Place</span>
          </h1>
          <p className="hero-sub">
            Post your ads for free. Reach thousands of buyers and sellers in your area across every category.
          </p>
          <form onSubmit={handleSearch} className="hero-search-box">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ads e.g. iPhone, Apartment, Job..."
            />
            <select
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </form>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-num">{adsCount}</span>
              <span className="stat-label">Ads Posted</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat">
              <span className="stat-num">10+</span>
              <span className="stat-label">Categories</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat">
              <span className="stat-num">Free</span>
              <span className="stat-label">Always</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ── */}
      <section className="section categories-section">
        <div className="container">
          <div className="section-header">
            <h2>
              Browse by <span className="gradient-text">Category</span>
            </h2>
            <p>Explore thousands of ads across popular categories</p>
          </div>
          <div className="categories-grid" id="categoriesGrid">
            {CATEGORIES.map((cat) => {
              const count = ads.filter((a) => a.category === cat.slug).length;
              return (
                <Link
                  key={cat.slug}
                  to={`/browse?cat=${cat.slug}`}
                  className="cat-card"
                  style={{ "--cat-color": cat.color } as React.CSSProperties}
                >
                  <div className="cat-card-icon">{cat.icon}</div>
                  <div className="cat-card-body">
                    <h3>{cat.label}</h3>
                    <p>{cat.desc}</p>
                    <span className="cat-card-count">
                      {count} Ad{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="cat-card-arrow">→</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── LATEST ADS ── */}
      <section className="section latest-section">
        <div className="container">
          <div className="section-header">
            <h2>
              Latest <span className="gradient-text">Ads</span>
            </h2>
            <p>Fresh listings posted recently</p>
            <Link to="/browse" className="btn btn-outline">
              View All Ads →
            </Link>
          </div>
          <div className="ads-grid">
            {latestAds.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h3>No Ads Yet</h3>
                <p>Be the first to post an ad!</p>
                <Link to="/post-ad" className="btn btn-primary">
                  Post Your Ad
                </Link>
              </div>
            ) : (
              latestAds.map((ad) => {
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
                            // Replace with icon placeholder on error
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
                        <span className="ad-date">🕐 {getFormattedDate(ad.postedAt)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* ── WHY US ── */}
      <section className="section why-section">
        <div className="container">
          <div className="section-header">
            <h2>
              Why <span className="gradient-text">FreeAdsPost?</span>
            </h2>
          </div>
          <div className="why-grid">
            <div className="why-card">
              <div className="why-icon">🚀</div>
              <h3>Post in Seconds</h3>
              <p>Simple form, instant listing. Your ad goes live immediately.</p>
            </div>
            <div className="why-card">
              <div className="why-icon">💰</div>
              <h3>Always Free</h3>
              <p>No listing fees, no hidden charges. Post unlimited ads for free.</p>
            </div>
            <div className="why-card">
              <div className="why-icon">🌍</div>
              <h3>Wide Reach</h3>
              <p>Connect with buyers and sellers across multiple categories.</p>
            </div>
            <div className="why-card">
              <div className="why-icon">🔒</div>
              <h3>Safe &amp; Secure</h3>
              <p>Your data stays private. We never sell your information.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section">
        <div className="container cta-inner">
          <h2>Ready to post your first ad?</h2>
          <p>It takes less than 2 minutes. No registration required.</p>
          <Link to="/post-ad" className="btn btn-primary btn-lg">
            Post Free Ad Now →
          </Link>
        </div>
      </section>
    </>
  );
}
