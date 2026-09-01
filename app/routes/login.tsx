import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import type { Route } from "./+types/login";
import { login, isAuthenticated } from "../utils/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Login – FreeAdsPost" },
    { name: "description", content: "Log in to post free ads on FreeAdsPost." },
  ];
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = searchParams.get("redirectTo") || "/post-ad";

  useEffect(() => {
    // If already authenticated, redirect straight away
    if (isAuthenticated()) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const result = await login(email.trim(), password);

    setIsSubmitting(false);

    if (result.success) {
      navigate(redirectTo, { replace: true });
    } else {
      setError(result.error || "Invalid email or password.");
    }
  };

  return (
    <section
      className="section"
      style={{
        paddingTop: "120px",
        minHeight: "calc(100vh - 100px)",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div className="container" style={{ maxWidth: "450px" }}>
        <div className="post-form-card">
          <h2
            style={{
              textAlign: "center",
              marginBottom: "10px",
              fontFamily: "var(--font2)",
              fontWeight: 800,
            }}
          >
            Welcome <span className="gradient-text">Back</span>
          </h2>
          <p
            style={{
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "0.9rem",
              marginBottom: "24px",
            }}
          >
            Log in to post classified ads for free.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="loginEmail">Email Address</label>
              <input
                type="email"
                id="loginEmail"
                placeholder="e.g. user@example.com"
                value={email}
                disabled={isSubmitting}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="loginPassword">Password</label>
              <input
                type="password"
                id="loginPassword"
                placeholder="••••••••"
                value={password}
                disabled={isSubmitting}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                required
              />
            </div>

            {error && (
              <div
                className="field-error"
                style={{ marginBottom: "20px", textAlign: "center" }}
              >
                {error}
              </div>
            )}

            <div style={{ marginTop: "24px" }}>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? "⏳ Logging in..." : "🔑 Log In Now"}</span>
              </button>
            </div>
          </form>

          <p style={{ textAlign: "center", marginTop: "20px", color: "var(--muted)", fontSize: "0.9rem" }}>
            New user? <Link to={redirectTo !== "/post-ad" ? `/register?redirectTo=${encodeURIComponent(redirectTo)}` : "/register"} style={{ color: "var(--accent)" }}>Create an Account</Link>
          </p>

          <div
            style={{
              marginTop: "20px",
              textAlign: "center",
              fontSize: "0.82rem",
              color: "var(--muted)",
              background: "var(--bg3)",
              padding: "12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}
          >
            <p>💡 <strong>Demo Credentials:</strong></p>
            <p style={{ marginTop: "4px" }}>
              Email: <code>user@example.com</code><br />
              Password: <code>password123</code>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
