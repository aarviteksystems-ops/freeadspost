import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { verifyEmail } from "~/services/api";

export function meta() {
  return [
    { title: "Verify Email - FreeAds Post" },
    { name: "description", content: "Verify your FreeAds Post account email address" },
  ];
}

export default function VerifyEmailRoute() {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get("token");

  const [manualToken, setManualToken] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    urlToken ? "verifying" : "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  const executeVerification = async (tokenToVerify: string) => {
    if (!tokenToVerify.trim()) return;

    setStatus("verifying");
    setErrorMessage(null);

    try {
      const res = await verifyEmail(tokenToVerify.trim());
      if (res.success) {
        setStatus("success");
        setVerifiedEmail(res.data?.email || null);
      } else {
        setStatus("error");
        setErrorMessage(
          res.error?.message || "Verification failed. The link may be invalid or expired."
        );
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "An unexpected error occurred while verifying your email.");
    }
  };

  useEffect(() => {
    if (urlToken) {
      executeVerification(urlToken);
    }
  }, [urlToken]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-block text-2xl font-black tracking-tight text-blue-600 dark:text-blue-400">
          FreeAds Post
        </Link>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Email Verification
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-xl rounded-2xl border border-slate-200 dark:border-slate-800 sm:px-10 text-center">
          {/* 1. Verifying State */}
          {status === "verifying" && (
            <div className="py-6">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Verifying your account...
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Please wait while we validate your verification token.
              </p>
            </div>
          )}

          {/* 2. Success State */}
          {status === "success" && (
            <div className="py-4">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Email Verified Successfully!
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                {verifiedEmail ? (
                  <>
                    Your email <strong>{verifiedEmail}</strong> has been confirmed.
                  </>
                ) : (
                  "Your email address has been confirmed."
                )}{" "}
                Your FreeAds Post account is now active.
              </p>

              <Link
                to="/login"
                className="block w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
              >
                Proceed to Login
              </Link>
            </div>
          )}

          {/* 3. Error State */}
          {status === "error" && (
            <div className="py-4">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Verification Failed
              </h3>
              <p className="text-sm text-rose-600 dark:text-rose-400 mb-6 leading-relaxed">
                {errorMessage}
              </p>

              <div className="space-y-3">
                <Link
                  to="/register"
                  className="block w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-medium rounded-lg text-sm transition-colors"
                >
                  Return to Registration
                </Link>
                <Link
                  to="/login"
                  className="block w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg text-sm transition-colors"
                >
                  Try Signing In
                </Link>
              </div>
            </div>
          )}

          {/* 4. Idle State (Manual Token Entry) */}
          {status === "idle" && (
            <div className="py-2 text-left">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                Please enter the verification token received in your email:
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeVerification(manualToken);
                }}
                className="space-y-4"
              >
                <div>
                  <input
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Enter 64-character token"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualToken.trim()}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  Verify Token
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
