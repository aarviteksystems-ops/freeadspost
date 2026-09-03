import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/register";
import { isAuthenticated, register } from "../utils/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Create Seller Account – FreeAdsPost" },
    { name: "description", content: "Create a FreeAdsPost seller account." },
  ];
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) navigate(redirectTo, { replace: true });
  }, [navigate, redirectTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanPhone = phone.replace(/[\s\-()]/g, "");
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email and password are required.");
      return;
    }
    if (!/^\+?\d{7,15}$/.test(cleanPhone)) {
      setError("Please enter a valid phone number (7 to 15 digits).");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    const result = await register({
      name: name.trim(),
      email: email.trim(),
      phone: cleanPhone,
      companyName: companyName.trim(),
      password,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || "Could not create account.");
      return;
    }
    navigate(redirectTo, { replace: true });
  }

  return (
    <section className="section" style={{ paddingTop: "120px", minHeight: "calc(100vh - 100px)", display: "flex", alignItems: "center" }}>
      <div className="container" style={{ maxWidth: "500px" }}>
        <div className="post-form-card">
          <h2 style={{ textAlign: "center", marginBottom: "10px", fontFamily: "var(--font2)", fontWeight: 800 }}>
            Create <span className="gradient-text">Seller Account</span>
          </h2>
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.9rem", marginBottom: "24px" }}>
            Create your account once. Your advertisements will belong to your seller profile.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="registerName">Full Name *</label>
              <input id="registerName" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" disabled={submitting} />
            </div>
            <div className="form-group">
              <label htmlFor="registerEmail">Email Address *</label>
              <input id="registerEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" disabled={submitting} />
            </div>
            <div className="form-group">
              <label htmlFor="registerPhone">Phone *</label>
              <input id="registerPhone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" disabled={submitting} />
            </div>
            <div className="form-group">
              <label htmlFor="registerCompany">Company Name <span style={{ color: "var(--muted)" }}>(optional)</span></label>
              <input id="registerCompany" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Optional small business name" disabled={submitting} />
            </div>
            <div className="form-group">
              <label htmlFor="registerPassword">Password *</label>
              <input id="registerPassword" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" disabled={submitting} />
            </div>

            {error && <div className="field-error" style={{ marginBottom: "18px", textAlign: "center" }}>{error}</div>}

            <button className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center" }} disabled={submitting}>
              {submitting ? "⏳ Creating account..." : "Create Seller Account"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: "20px", color: "var(--muted)", fontSize: "0.9rem" }}>
            Already have an account? <Link to={redirectTo !== "/dashboard" ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login"} style={{ color: "var(--accent)" }}>Log in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
