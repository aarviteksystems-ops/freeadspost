import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "~/context/AuthContext";

export function meta() {
  return [
    { title: "Sign In - FreeAds Post" },
    { name: "description", content: "Sign in to FreeAds Post - India's Free Classifieds" },
  ];
}

export default function LoginRoute() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "";
  const redirectTarget = /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnverified, setIsUnverified] = useState(false);

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(redirectTarget, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsUnverified(false);

    if (!email.trim() || !password) {
      setError("Please enter both email address and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      if (res.success) {
        navigate(redirectTarget, { replace: true });
      } else {
        if (res.code === "EMAIL_NOT_VERIFIED") {
          setIsUnverified(true);
        }
        setError(res.error || "Invalid email or password.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-1.5">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-slate-900 dark:bg-amber-600 flex items-center justify-center text-white font-black text-base shadow-sm">
            F
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            FreeAds<span className="text-amber-600 dark:text-amber-500">Post</span>
          </span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Sign In to Your Account
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          New to FreeAds Post?{" "}
          <Link to="/register" className="font-bold text-blue-700 dark:text-blue-400 hover:underline">
            Create a free account
          </Link>
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-6 px-5 sm:px-8 shadow-sm rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
          {error && (
            <div className={`rounded p-3 text-xs flex items-start gap-2 ${
              isUnverified
                ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                : "bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200"
            }`}>
              <span className="text-sm shrink-0 mt-0.5">{isUnverified ? "⚠️" : "❌"}</span>
              <div className="space-y-1">
                <p className="font-medium">{error}</p>
                {isUnverified && (
                  <p>
                    <Link to="/verify-email" className="font-bold underline hover:opacity-80">
                      Have a token? Click here to verify manually.
                    </Link>
                  </p>
                )}
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-blue-700 dark:text-blue-400 font-semibold hover:underline"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2.5 px-4 rounded shadow-sm text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Signing in...</span>
                  </span>
                ) : (
                  "Sign In to FreeAds Post"
                )}
              </button>
            </div>
          </form>

          {/* Trust Reassurance Footer */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <span>🛡️</span>
              <span>100% Secure &amp; Anti-Spam Protected</span>
            </div>
            <p>Your contact preference is respected. No spam or unsolicited marketing.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
