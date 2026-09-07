import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { useAuth } from "~/context/AuthContext";
import { getDashboardSummary, getMembership, type DashboardSummary, type UserMembershipData } from "~/services/api";

export function meta() {
  return [
    { title: "Dashboard - FreeAds Post" },
    { name: "description", content: "Authenticated user dashboard for FreeAds Post" },
  ];
}

type TabKey = "dashboard" | "post-ad" | "my-ads" | "membership" | "profile";

export default function DashboardRoute() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [membershipData, setMembershipData] = useState<UserMembershipData | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  // Fetch summary counts from backend API
  useEffect(() => {
    async function loadSummary() {
      if (!token) return;
      try {
        const res = await getDashboardSummary(token);
        if (res.success && res.data) {
          setSummary(res.data);
        }
        const memRes = await getMembership(token);
        if (memRes.success && memRes.data) {
          setMembershipData(memRes.data);
        }
      } catch (err) {
        console.error("Failed to load dashboard summary or membership", err);
      } finally {
        setIsLoadingSummary(false);
      }
    }

    loadSummary();
  }, [token]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const currentUser = summary?.user || user;
  const counts = summary?.counts || { total: 0, pending: 0, approved: 0, rejected: 0 };

  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return "First login";
    try {
      const d = new Date(isoStr);
      return isNaN(d.getTime()) ? isoStr : d.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Navigation Bar / Tabs */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap items-center gap-1">
            {/* 1. Dashboard */}
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === "dashboard"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span>📊</span>
              <span>Overview</span>
            </button>

            {/* 2. Post Ad */}
            <Link
              to="/post-ad"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            >
              <span>+</span>
              <span>Post New Ad</span>
            </Link>

            {/* 3. My Ads */}
            <button
              type="button"
              onClick={() => setActiveTab("my-ads")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === "my-ads"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span>📋</span>
              <span>My Ads</span>
              <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                {counts.total}
              </span>
            </button>

            {/* 4. Membership */}
            <button
              type="button"
              onClick={() => setActiveTab("membership")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === "membership"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span>⭐</span>
              <span>Membership</span>
            </button>

            {/* 5. Profile */}
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === "profile"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span>👤</span>
              <span>Account Profile</span>
            </button>
          </nav>

          {/* Logout Action */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors ml-auto"
          >
            <span>Sign Out</span>
          </button>
        </div>

        {/* --- TAB 1: MAIN DASHBOARD --- */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* Top User Overview Banner */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                      {currentUser?.name || "User"}
                    </h1>

                    {/* Email Verification Status */}
                    {currentUser?.email_verified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                        <span>✓</span>
                        <span>Email Verified</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                        Pending Verification
                      </span>
                    )}

                    {/* Role Tag */}
                    <span className="text-[11px] px-2 py-0.5 rounded font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {currentUser?.role || "USER"}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Email: <strong className="text-slate-700 dark:text-slate-200">{currentUser?.email}</strong></span>
                    <span>•</span>
                    <span>Last Login: <strong className="text-slate-700 dark:text-slate-200">{formatDateTime(currentUser?.last_login)}</strong></span>
                  </p>
                </div>

                {/* Membership Status Badge */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded p-3 sm:text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Plan Status
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center sm:justify-end gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>{currentUser?.membership_status || "FREE"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Clean Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Ads */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total Ads
                  </span>
                  <span className="text-lg">📁</span>
                </div>
                <div className="mt-2">
                  <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    {isLoadingSummary ? "-" : counts.total}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Total listings posted</div>
                </div>
              </div>

              {/* Card 2: Pending Ads */}
              <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    Under Review
                  </span>
                  <span className="text-lg">⏳</span>
                </div>
                <div className="mt-2">
                  <div className="text-3xl font-extrabold text-amber-700 dark:text-amber-400">
                    {isLoadingSummary ? "-" : counts.pending}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Awaiting admin approval</div>
                </div>
              </div>

              {/* Card 3: Approved Ads */}
              <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    Live Ads
                  </span>
                  <span className="text-lg">✅</span>
                </div>
                <div className="mt-2">
                  <div className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-400">
                    {isLoadingSummary ? "-" : counts.approved}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Active in marketplace</div>
                </div>
              </div>

              {/* Card 4: Rejected Ads */}
              <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                    Declined
                  </span>
                  <span className="text-lg">❌</span>
                </div>
                <div className="mt-2">
                  <div className="text-3xl font-extrabold text-rose-700 dark:text-rose-400">
                    {isLoadingSummary ? "-" : counts.rejected}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Requires revision / rejected</div>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Post a new classified advertisement
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Reach buyers across Indian cities. Free, simple, and direct contact.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/post-ad"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors whitespace-nowrap"
                >
                  + Post Free Ad
                </Link>
                <Link
                  to="/my-ads"
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold rounded-md transition-colors"
                >
                  Manage Listings
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 2: POST AD REDIRECT INFO --- */}
        {activeTab === "post-ad" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-8 shadow-sm max-w-xl mx-auto text-center space-y-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-full flex items-center justify-center mx-auto text-xl">
              ✍️
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Create a Classified Advertisement
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
              Ready to submit your listing? All submissions are reviewed by an administrator before appearing publicly.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Link
                to="/post-ad"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md shadow-sm"
              >
                Go to Posting Form →
              </Link>
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-md text-slate-700 dark:text-slate-300"
              >
                Back to Overview
              </button>
            </div>
          </div>
        )}

        {/* --- TAB 3: MY ADS TAB SUMMARY --- */}
        {activeTab === "my-ads" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  My Advertisements Summary ({counts.total})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Quick status count of your submitted classifieds.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/my-ads"
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-md transition-colors"
                >
                  Manage Ads →
                </Link>
                <Link
                  to="/post-ad"
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md transition-colors"
                >
                  + Post Ad
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase">Under Review</div>
                <div className="text-2xl font-extrabold text-amber-900 dark:text-amber-100 mt-1">{counts.pending}</div>
              </div>
              <div className="p-4 rounded border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">Live &amp; Approved</div>
                <div className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-1">{counts.approved}</div>
              </div>
              <div className="p-4 rounded border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20">
                <div className="text-xs font-bold text-rose-800 dark:text-rose-300 uppercase">Declined</div>
                <div className="text-2xl font-extrabold text-rose-900 dark:text-rose-100 mt-1">{counts.rejected}</div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 4: MEMBERSHIP --- */}
        {activeTab === "membership" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-8 shadow-sm max-w-2xl mx-auto space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Membership &amp; Priority Placement
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Active members receive priority placement and prominent Sponsored labels.
              </p>
            </div>

            {/* Current Tier */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Tier</div>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {membershipData?.plan || currentUser?.membership_status || "FREE"}
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                (membershipData?.status || "ACTIVE") === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                {membershipData?.status || "ACTIVE"}
              </span>
            </div>

            {/* Sponsorship Eligibility */}
            <div className={`border rounded-lg p-4 ${
              membershipData?.is_eligible_for_sponsorship
                ? "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20"
            }`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  membershipData?.is_eligible_for_sponsorship
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                }`}>
                  {membershipData?.is_eligible_for_sponsorship ? "★ SPONSORSHIP ELIGIBLE" : "STANDARD TIER"}
                </span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {membershipData?.is_eligible_for_sponsorship
                    ? "Priority Sponsored Ranking Active"
                    : "Standard Ranking"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                {membershipData?.is_eligible_for_sponsorship
                  ? "Your active membership entitles your advertisements to receive top-of-page sponsored placement."
                  : "To unlock top-of-search placement with prominent ★ SPONSORED badges, view our membership plans."}
              </p>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <Link
                to="/membership"
                className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline"
              >
                View Transparent Membership Tiers →
              </Link>
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded text-slate-700 dark:text-slate-300"
              >
                Back to Overview
              </button>
            </div>
          </div>
        )}

        {/* --- TAB 5: PROFILE --- */}
        {activeTab === "profile" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-8 shadow-sm max-w-2xl mx-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Account Details
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your registered account credentials.
                </p>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                Verified Account
              </span>
            </div>

            <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-semibold">User ID</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200">{currentUser?.user_id}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-semibold">Full Name</dt>
                <dd className="font-bold text-slate-800 dark:text-slate-200">{currentUser?.name}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-semibold">Email</dt>
                <dd className="text-slate-800 dark:text-slate-200">{currentUser?.email}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-semibold">Phone</dt>
                <dd className="text-slate-800 dark:text-slate-200">{currentUser?.phone || "Not provided"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-semibold">Company</dt>
                <dd className="text-slate-800 dark:text-slate-200">{currentUser?.company_name || "Individual"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-semibold">Role</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200">{currentUser?.role || "USER"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-semibold">Last Login</dt>
                <dd className="text-slate-800 dark:text-slate-200">{formatDateTime(currentUser?.last_login)}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded text-slate-700 dark:text-slate-300"
            >
              Back to Overview
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
