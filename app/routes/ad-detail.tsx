import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/ad-detail";
import { getAdById, deleteAd, CATEGORIES, type Ad } from "../utils/db";
import { getUser, isAuthenticated } from "../utils/auth";

const CATEGORY_LABELS: Record<string, string> = {
  "real-estate": "🏠 Real Estate",
  "vehicles": "🚗 Vehicles",
  "jobs": "💼 Jobs",
  "electronics": "📱 Electronics",
  "furniture": "🛋️ Furniture",
  "fashion": "👗 Fashion",
  "services": "🔧 Services",
  "education": "📚 Education",
  "pets": "🐾 Pets",
  "others": "📦 Others",
};

const CONDITION_LABELS: Record<string, string> = {
  "new": "🟢 New",
  "like-new": "🔵 Like New",
  "good": "Good",
  "fair": "🟠 Fair",
  "not-applicable": "—",
};

export default function AdDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id") || "";
  const [ad, setAd] = useState<Ad | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [imageValid, setImageValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(isAuthenticated());

  useEffect(() => {
    const handleAuthChange = () => setIsLoggedIn(isAuthenticated());
    window.addEventListener("auth-change", handleAuthChange);
    return () => window.removeEventListener("auth-change", handleAuthChange);
  }, []);

  useEffect(() => {
    async function loadAd() {
      setLoading(true);
      const foundAd = await getAdById(id);
      setAd(foundAd);
      if (foundAd) {
        document.title = `${foundAd.title} – FreeAdsPost`;
      } else {
        document.title = "Ad Details – FreeAdsPost";
      }
      setLoading(false);
    }
    if (id) {
      loadAd();
    } else {
      setLoading(false);
    }
  }, [id, isLoggedIn]);

  if (loading) {
    return (
      <section className="section" style={{ paddingTop: "100px" }}>
        <div className="container" style={{ textAlign: "center" }}>
          <h3>Loading ad details...</h3>
        </div>
      </section>
    );
  }

  if (!ad) {
    return (
      <section className="section" style={{ paddingTop: "100px" }}>
        <div className="container">
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>Ad not found</h3>
            <Link to="/browse" className="btn btn-primary">
              Browse Ads
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const getAdPriceDisplay = () => {
    if (ad.priceType === "free") return "🆓 Free";
    if (ad.priceType === "contact") return "📞 Contact for Price";
    return `₹${Number(ad.price).toLocaleString("en-IN")}${
      ad.priceType === "negotiable" ? " (Neg.)" : ""
    }`;
  };

  const getFormattedDate = () => {
    return new Date(ad.postedAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const handleDelete = async () => {
    const success = await deleteAd(ad.id);
    if (success) {
      navigate("/browse");
    }
  };

  const categoryInfo = CATEGORIES.find((c) => c.slug === ad.category) || {
    icon: "📦",
    color: "#64748b",
  };

  return (
    <>
      <section className="section" style={{ paddingTop: "100px" }}>
        <div className="container">
          <button
            onClick={() => navigate(-1)}
            className="back-link btn-link"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
            }}
          >
            ← Back to Listings
          </button>
          <div id="adDetailContent">
            <div className="ad-detail-grid">
              <div className="ad-detail-left">
                <div className="ad-detail-img-wrap">
                  {ad.image && imageValid ? (
                    <img
                      src={ad.image}
                      alt={ad.title}
                      onError={() => setImageValid(false)}
                    />
                  ) : (
                    <div className="img-placeholder">{categoryInfo.icon}</div>
                  )}
                  <span className="ad-category-badge">
                    {CATEGORY_LABELS[ad.category] || ad.category}
                  </span>
                </div>
                <div className="ad-detail-meta-tags">
                  <span className="meta-tag">📅 {getFormattedDate()}</span>
                  <span className="meta-tag">
                    📍 {ad.city}
                    {ad.state ? `, ${ad.state}` : ""}
                  </span>
                  {ad.condition !== "not-applicable" && (
                    <span className="meta-tag">
                      {CONDITION_LABELS[ad.condition] || ad.condition}
                    </span>
                  )}
                </div>
              </div>
              <div className="ad-detail-right">
                <h1 className="ad-detail-title">{ad.title}</h1>
                <div className="ad-detail-price">{getAdPriceDisplay()}</div>
                <div className="ad-detail-section">
                  <h3>Description</h3>
                  <p
                    dangerouslySetInnerHTML={{
                      __html: ad.description.replace(/\n/g, "<br/>"),
                    }}
                  ></p>
                </div>
                <div className="contact-card">
                  <h3>📞 Contact Seller</h3>
                  <div className="contact-name">
                    <strong>{ad.seller?.name || "Seller"}</strong>
                    {ad.seller?.companyName && (
                      <div style={{ color: "var(--muted)", marginTop: "3px" }}>{ad.seller.companyName}</div>
                    )}
                  </div>
                  {ad.sellerAvailable !== false ? (
                    <div style={{ marginBottom: "14px", color: "var(--success, #22c55e)", fontWeight: 600, fontSize: "0.9rem" }}>
                      🟢 Seller available to respond
                    </div>
                  ) : (
                    <div style={{ marginBottom: "14px", color: "var(--muted)", fontWeight: 500, fontSize: "0.9rem" }}>
                      ⚪ Seller is currently away
                    </div>
                  )}

                  {!isLoggedIn ? (
                    <div
                      className="contact-locked-box"
                      style={{
                        background: "var(--bg2)",
                        border: "1.5px dashed var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "20px 16px",
                        textAlign: "center",
                        marginBottom: "16px",
                      }}
                    >
                      <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔒</div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", fontWeight: 700 }}>
                        Contact Info Protected
                      </h4>
                      <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.45 }}>
                        Please log in or create an account to view this seller's phone number and email.
                      </p>
                      <Link
                        to={`/login?redirectTo=${encodeURIComponent(`/ad-detail?id=${ad.id}`)}`}
                        className="btn btn-primary contact-btn"
                        style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}
                      >
                        🔑 Log In to View Contact
                      </Link>
                      <div style={{ marginTop: "12px", fontSize: "0.82rem", color: "var(--muted)" }}>
                        Don't have an account?{" "}
                        <Link
                          to={`/register?redirectTo=${encodeURIComponent(`/ad-detail?id=${ad.id}`)}`}
                          style={{ color: "var(--accent)", fontWeight: 600 }}
                        >
                          Sign Up Free
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <>
                      {ad.seller?.phone ? (
                        <a href={`tel:${ad.seller.phone}`} className="btn btn-primary contact-btn">
                          📱 Call: {ad.seller.phone}
                        </a>
                      ) : (
                        <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "10px", textAlign: "center" }}>
                          📱 Phone number not provided
                        </div>
                      )}
                      {ad.seller?.email && (
                        <a href={`mailto:${ad.seller.email}`} className="btn btn-outline contact-btn">
                          ✉️ Email Seller ({ad.seller.email})
                        </a>
                      )}
                    </>
                  )}

                  <p className="contact-warning">
                    ⚠️ Never pay in advance. Meet in a public place. Beware of scams.
                  </p>
                </div>
                <div className="ad-detail-actions">
                  <Link
                    to={`/browse?cat=${ad.category}`}
                    className="btn btn-outline"
                  >
                    More in {CATEGORY_LABELS[ad.category] || ad.category}
                  </Link>
                  {isLoggedIn && getUser()?.id === ad.sellerId && (
                    <button
                      className="btn btn-danger"
                      onClick={() => setShowDeleteModal(true)}
                    >
                      🗑️ Delete Ad
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DELETE CONFIRM MODAL */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteModal(false);
          }}
        >
          <div className="modal-card">
            <div className="modal-icon">🗑️</div>
            <h2>Delete This Ad?</h2>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
