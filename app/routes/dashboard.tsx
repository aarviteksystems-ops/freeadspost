import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/dashboard";
import { getUser, isAuthenticated, pingActivity, setAvailability, type User } from "../utils/auth";
import { getMyAds, type Ad } from "../utils/db";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Seller Dashboard – FreeAdsPost" }];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(getUser());
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const current = getUser();
    setUser(current);
    if (!current) return;
    await pingActivity();
    setUser(getUser());
    const mine = await getMyAds();
    setAds(mine);
    setLoading(false);
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login?redirectTo=/dashboard", { replace: true });
      return;
    }
    refresh();
    const timer = window.setInterval(() => {
      pingActivity().then(() => setUser(getUser()));
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [navigate]);

  if (!user) return null;

  const available = user.availabilityStatus === "available";

  return (
    <section className="section" style={{ paddingTop: "120px", minHeight: "calc(100vh - 100px)" }}>
      <div className="container">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "center", flexWrap: "wrap", marginBottom: "30px" }}>
          <div>
            <h1>Seller <span className="gradient-text">Dashboard</span></h1>
            <p style={{ color: "var(--muted)" }}>Manage your advertisements and your buyer availability.</p>
          </div>
          <Link to="/post-ad" className="btn btn-primary">+ Post Free Ad</Link>
        </div>

        <div className="post-form-card" style={{ marginBottom: "25px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ marginBottom: "6px" }}>Seller availability</h3>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                {available
                  ? "You are available. Your eligible ads can appear to buyers."
                  : "You are away. Your ads are not being promoted in active search."}
              </p>
            </div>
            <button
              className={`btn ${available ? "btn-primary" : "btn-secondary"}`}
              onClick={async () => {
                await setAvailability(!available);
                setUser(getUser());
              }}
            >
              {available ? "🟢 Available" : "⚪ Away"}
            </button>
          </div>
        </div>

        <div className="post-form-card">
          <h3 style={{ marginBottom: "18px" }}>Your advertisements</h3>
          {loading ? (
            <p style={{ color: "var(--muted)" }}>Loading your ads...</p>
          ) : ads.length === 0 ? (
            <div style={{ textAlign: "center", padding: "35px 10px" }}>
              <p style={{ color: "var(--muted)" }}>You haven't posted an advertisement yet.</p>
              <Link to="/post-ad" className="btn btn-primary" style={{ marginTop: "12px" }}>Post Your First Ad</Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {ads.map(ad => (
                <div key={ad.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px", display: "flex", justifyContent: "space-between", gap: "15px", alignItems: "center" }}>
                  <div>
                    <Link to={`/ad-detail?id=${ad.id}`} style={{ fontWeight: 700 }}>{ad.title}</Link>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "5px" }}>
                      {ad.city}{ad.state ? `, ${ad.state}` : ""} · {ad.status || "published"}
                    </div>
                  </div>
                  <Link to={`/ad-detail?id=${ad.id}`} className="btn btn-secondary">View</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
