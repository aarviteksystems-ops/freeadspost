import { useState, useEffect } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "~/context/AuthContext";
import { getPublicAd, type AdItem } from "~/services/api";

export function meta() {
  return [
    { title: "Advertisement Details - FreeAds Post" },
    {
      name: "description",
      content: "View full details and verified seller information for classified advertisements on FreeAds Post."
    }
  ];
}

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

export default function AdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user, isAuthenticated } = useAuth();

  const [ad, setAd] = useState<AdItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isVerified = Boolean(
    user && (
      user.email_verified === true ||
      String(user.email_verified).toLowerCase() === "true"
    )
  );

  useEffect(() => {
    if (!id) {
      setError("No advertisement ID provided.");
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchAd = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getPublicAd(id, token || undefined);
        if (!isMounted) return;

        if (res.success && res.data && res.data.ad) {
          setAd(res.data.ad);
        } else {
          setError(res.error?.message || "Advertisement not found or no longer available.");
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || "Unable to load advertisement details.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAd();

    return () => {
      isMounted = false;
    };
  }, [id, token]);

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-10 px-4">
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
            <div className="h-64 sm:h-96 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
            <div className="space-y-2">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !ad) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto text-2xl">
            🔍
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Advertisement Not Found
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {error || "This advertisement is either no longer available, expired, or pending administrative review."}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/ads"
              className="w-full sm:w-auto px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors"
            >
              ← Browse All Advertisements
            </Link>
            <Link
              to="/"
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sellerName = ad.seller?.name || "Verified Seller";
  const contactPhone = ad.contact?.phone || ad.seller?.phone;
  const contactEmail = ad.contact?.email || ad.seller?.email;
  const rawPhoneDigits = contactPhone ? contactPhone.replace(/\D/g, "") : "";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-6 sm:py-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Link to="/" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link to="/ads" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
            Classifieds
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px] sm:max-w-xs">
            {ad.title}
          </span>
        </nav>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / Center 2 Columns: Ad Details */}
          <div className="lg:col-span-2 space-y-6">
            <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              {/* Media Section */}
              <div className="relative bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 h-64 sm:h-96 flex items-center justify-center overflow-hidden">
                {ad.is_sponsored && (
                  <div className="absolute top-4 left-4 z-10">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded bg-amber-500 text-slate-950 uppercase tracking-wider shadow-sm">
                      <span>★</span>
                      <span>SPONSORED PLACEMENT</span>
                    </span>
                  </div>
                )}

                <div className="absolute top-4 right-4 z-10">
                  <span className="text-xs font-bold px-3 py-1 rounded bg-slate-900/80 text-white backdrop-blur-xs">
                    {ad.category}
                  </span>
                </div>

                {ad.image_url ? (
                  <img
                    src={ad.image_url}
                    alt={ad.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                      const parent = (e.target as HTMLElement).parentElement;
                      if (parent) {
                        const placeholder = document.createElement("div");
                        placeholder.className = "flex flex-col items-center justify-center text-slate-400 text-sm py-12";
                        placeholder.innerHTML = "<span class='text-4xl mb-2'>🏷️</span><span class='font-semibold'>Verified Classified Listing</span>";
                        parent.appendChild(placeholder);
                      }
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 select-none">
                    <span className="text-5xl mb-2">📢</span>
                    <span className="text-xs font-bold uppercase tracking-wider">Classified Notice</span>
                  </div>
                )}
              </div>

              {/* Ad Header & Meta Info */}
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-snug">
                    {ad.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                      <span>📍</span>
                      <span>{ad.location}</span>
                    </span>
                    <span>•</span>
                    <span>Posted {formatDate(ad.approved_at || ad.created_at)}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">
                      <span>✓</span>
                      <span>Verified Ad</span>
                    </span>
                  </div>
                </div>

                {/* Price (if available) */}
                {ad.price && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                      Price / Rate
                    </div>
                    <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                      {typeof ad.price === "number" ? `₹${ad.price.toLocaleString("en-IN")}` : ad.price}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Description & Specifications
                  </h2>
                  <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {ad.description}
                  </div>
                </div>
              </div>
            </article>

            {/* Safety Guidelines */}
            <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-5 space-y-2.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-900 dark:text-amber-100">
                <span>🛡️</span>
                <span>FreeAds Post Buyer Safety Guidelines</span>
              </div>
              <ul className="space-y-1.5 list-disc list-inside text-amber-800 dark:text-amber-300">
                <li>Never transfer advance payments, token amounts, or shipping fees before verifying the item in person.</li>
                <li>Meet sellers in well-lit, public locations (e.g. metro stations, coffee shops, or shopping centers).</li>
                <li>Carefully inspect all goods, documentation, and vehicle titles before finalizing payment.</li>
                <li>Report suspicious or deceptive listings directly to our moderation team.</li>
              </ul>
            </div>
          </div>

          {/* Right Column: Seller & Contact Information (Protected) */}
          <div className="space-y-6">
            {/* Seller Profile Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-lg">
                  {sellerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {sellerName}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>✓</span>
                    <span>Registered Marketplace Seller</span>
                  </div>
                </div>
              </div>

              {/* Contact Information Box - Server-Side Protection */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Seller Contact Details
                </h4>

                {!isAuthenticated ? (
                  /* Case 1: Unauthenticated Visitor */
                  <div className="border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 rounded-xl p-5 text-center space-y-3">
                    <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-full flex items-center justify-center mx-auto text-lg shadow-xs">
                      🔒
                    </div>
                    <div className="space-y-1">
                      <h5 className="font-bold text-slate-900 dark:text-white text-sm">
                        Login to view contact information
                      </h5>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                        To protect our sellers from spam, scraping, and fraud, phone numbers and email addresses are only accessible to verified members.
                      </p>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <Link
                        to={`/login?redirect=${encodeURIComponent(`/ad/${ad.ad_id}`)}`}
                        className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                      >
                        Log In to Contact Seller
                      </Link>
                      <Link
                        to="/register"
                        className="w-full py-2 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors"
                      >
                        Create Free Account
                      </Link>
                    </div>
                  </div>
                ) : !isVerified ? (
                  /* Case 2: Authenticated but Unverified User */
                  <div className="border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 rounded-xl p-5 text-center space-y-3">
                    <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-full flex items-center justify-center mx-auto text-lg">
                      ✉️
                    </div>
                    <div className="space-y-1">
                      <h5 className="font-bold text-slate-900 dark:text-white text-sm">
                        Verify your email to contact sellers
                      </h5>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        Please verify your email address to unlock seller contact information.
                      </p>
                    </div>
                    <Link
                      to="/verify-email"
                      className="inline-block w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      Verify Email Address
                    </Link>
                  </div>
                ) : (
                  /* Case 3: Authenticated and Verified User */
                  <div className="space-y-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Contact Preference:{" "}
                        <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">
                          {ad.contact_preference || "EMAIL"}
                        </span>
                      </div>

                      {contactPhone ? (
                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-slate-500 dark:text-slate-400">Phone:</span>
                          <a
                            href={`tel:${contactPhone}`}
                            className="font-bold text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            {contactPhone}
                          </a>
                        </div>
                      ) : null}

                      {contactEmail ? (
                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-slate-500 dark:text-slate-400">Email:</span>
                          <a
                            href={`mailto:${contactEmail}`}
                            className="font-bold text-blue-700 dark:text-blue-400 hover:underline truncate max-w-[170px]"
                            title={contactEmail}
                          >
                            {contactEmail}
                          </a>
                        </div>
                      ) : null}
                    </div>

                    {/* Direct Action Buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                      {contactPhone && (
                        <a
                          href={`tel:${contactPhone}`}
                          className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg text-center shadow-xs transition-colors flex items-center justify-center gap-2"
                        >
                          <span>📞</span>
                          <span>Call Seller ({contactPhone})</span>
                        </a>
                      )}

                      {contactPhone && rawPhoneDigits && (
                        <a
                          href={`https://wa.me/${rawPhoneDigits}?text=${encodeURIComponent(`Hi, I am inquiring about your advertisement "${ad.title}" on FreeAds Post.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg text-center shadow-xs transition-colors flex items-center justify-center gap-2"
                        >
                          <span>💬</span>
                          <span>Chat on WhatsApp</span>
                        </a>
                      )}

                      {contactEmail && (
                        <a
                          href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Inquiry about ${ad.title}`)}`}
                          className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold rounded-lg text-center transition-colors flex items-center justify-center gap-2"
                        >
                          <span>✉️</span>
                          <span>Send Email Inquiry</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 shadow-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Listing Information
              </h4>
              <div className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Ad Reference:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{ad.ad_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Category:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{ad.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Location:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{ad.location}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/ads"
                  className="block w-full py-2 text-center text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  ← Back to All Classifieds
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
