import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "~/context/AuthContext";
import {
  adminGetOverview,
  adminGetUsers,
  adminGetAds,
  adminApproveAd,
  adminRejectAd,
  adminEditAd,
  adminDeleteAd,
  adminGetMemberships,
  adminGetActivityLogs,
  adminGetSettings,
  adminUpdateSetting,
  adminSponsorAd,
  adminRevokeSponsorAd,
  adminProcessInactivity,
  type AdminStats,
  type UserProfile,
  type AdItem,
  type AdminMembershipItem,
  type AdminLogItem,
  type AdminSettingItem
} from "~/services/api";

type AdminSection =
  | "dashboard"
  | "users"
  | "pending-ads"
  | "approved-ads"
  | "rejected-ads"
  | "memberships"
  | "activity-logs"
  | "settings";

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(dateStr);
  }
}

export function meta() {
  return [
    { title: "Admin Portal - FreeAds Post" },
    { name: "description", content: "Administrator control center for FreeAds Post." }
  ];
}

export default function AdminPage() {
  const { token, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [isAdminVerified, setIsAdminVerified] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentPendingAds, setRecentPendingAds] = useState<AdItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [memberships, setMemberships] = useState<AdminMembershipItem[]>([]);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [settings, setSettings] = useState<AdminSettingItem[]>([]);

  // UI state
  const [isLoadingSection, setIsLoadingSection] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [userActivityFilter, setUserActivityFilter] = useState<"ALL" | "ACTIVE" | "WARNING" | "INACTIVE">("ALL");
  const [isScanningInactivity, setIsScanningInactivity] = useState(false);

  // Modals
  const [rejectingAd, setRejectingAd] = useState<AdItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [editingAd, setEditingAd] = useState<AdItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    category: "",
    description: "",
    image_url: "",
    location: "",
    contact_preference: "EMAIL" as "EMAIL" | "PHONE" | "BOTH"
  });
  const [editingSetting, setEditingSetting] = useState<AdminSettingItem | null>(null);
  const [settingValue, setSettingValue] = useState("");

  const showFeedback = (type: "success" | "error", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleRunInactivityScan = async () => {
    if (!token) return;
    setIsScanningInactivity(true);
    try {
      const res = await adminProcessInactivity(token);
      if (res.success && res.data) {
        showFeedback(
          "success",
          `Inactivity scan completed: ${res.data.ads_hidden} ad(s) paused, ${res.data.warnings_sent} warning(s) sent.`
        );
        const usersRes = await adminGetUsers(token);
        if (usersRes.success && usersRes.data) {
          setUsers(usersRes.data.users || []);
        }
      } else {
        showFeedback("error", res.error?.message || "Failed to complete inactivity scan.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred during scan.");
    } finally {
      setIsScanningInactivity(false);
    }
  };

  // 1. Verify admin status strictly via server-side Admins Google Sheet check
  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated || !token) {
      setIsAdminVerified(false);
      setAuthError("You must sign in with an administrator account.");
      return;
    }

    const checkAdmin = async () => {
      try {
        const res = await adminGetOverview(token);
        if (res.success && res.data) {
          setIsAdminVerified(true);
          setStats(res.data.stats);
          setRecentPendingAds(res.data.recent_pending_ads || []);
        } else {
          setIsAdminVerified(false);
          setAuthError(res.error?.message || "Administrative privileges required. This account is not listed as an active administrator in the Admins Google Sheet.");
        }
      } catch (err: any) {
        setIsAdminVerified(false);
        setAuthError(err.message || "Failed to verify administrative authorization.");
      }
    };

    checkAdmin();
  }, [token, isAuthenticated, isAuthLoading]);

  // Cache of recently loaded section data (avoids redundant API calls when switching tabs)
  const loadedSectionsRef = useRef<Record<string, number>>({});

  // 2. Fetch section data when section changes (cached for 60 seconds unless forceRefresh = true)
  const loadSectionData = useCallback(async (forceRefresh = false) => {
    if (!isAdminVerified || !token) return;

    const now = Date.now();
    const lastLoaded = loadedSectionsRef.current[activeSection] || 0;
    if (!forceRefresh && (now - lastLoaded < 60000)) {
      return;
    }

    setIsLoadingSection(true);
    try {
      if (activeSection === "dashboard") {
        const res = await adminGetOverview(token);
        if (res.success && res.data) {
          setStats(res.data.stats);
          setRecentPendingAds(res.data.recent_pending_ads || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      } else if (activeSection === "users") {
        const res = await adminGetUsers(token);
        if (res.success && res.data) {
          setUsers(res.data.users || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      } else if (activeSection === "pending-ads") {
        const res = await adminGetAds("PENDING", token);
        if (res.success && res.data) {
          setAds(res.data.ads || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      } else if (activeSection === "approved-ads") {
        const res = await adminGetAds("APPROVED", token);
        if (res.success && res.data) {
          setAds(res.data.ads || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      } else if (activeSection === "rejected-ads") {
        const res = await adminGetAds("REJECTED", token);
        if (res.success && res.data) {
          setAds(res.data.ads || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      } else if (activeSection === "memberships") {
        const res = await adminGetMemberships(token);
        if (res.success && res.data) {
          setMemberships(res.data.memberships || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      } else if (activeSection === "activity-logs") {
        const res = await adminGetActivityLogs(100, token);
        if (res.success && res.data) {
          setLogs(res.data.logs || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      } else if (activeSection === "settings") {
        const res = await adminGetSettings(token);
        if (res.success && res.data) {
          setSettings(res.data.settings || []);
          loadedSectionsRef.current[activeSection] = Date.now();
        }
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to load section data.");
    } finally {
      setIsLoadingSection(false);
    }
  }, [activeSection, isAdminVerified, token]);

  useEffect(() => {
    loadSectionData();
  }, [loadSectionData]);

  // Action: Approve ad
  const handleApproveAd = async (adId: string) => {
    if (!token) return;
    setProcessingId(adId);
    try {
      const res = await adminApproveAd(adId, token);
      if (res.success) {
        showFeedback("success", "Advertisement approved and published.");
        // Refresh current list and stats
        if (activeSection === "pending-ads") {
          setAds((prev) => prev.filter((a) => a.ad_id !== adId));
        }
        setRecentPendingAds((prev) => prev.filter((a) => a.ad_id !== adId));
        if (stats) {
          setStats({
            ...stats,
            pending_ads: Math.max(0, stats.pending_ads - 1),
            approved_ads: stats.approved_ads + 1
          });
        }
      } else {
        showFeedback("error", res.error?.message || "Failed to approve advertisement.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Open Reject Modal
  const handleOpenReject = (ad: AdItem) => {
    setRejectingAd(ad);
    setRejectionReason("");
  };

  // Action: Confirm Reject Ad
  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !rejectingAd) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 5) {
      showFeedback("error", "Rejection reason must be at least 5 characters.");
      return;
    }

    setProcessingId(rejectingAd.ad_id);
    try {
      const res = await adminRejectAd(rejectingAd.ad_id, rejectionReason.trim(), token);
      if (res.success) {
        showFeedback("success", "Advertisement rejected with explanation.");
        if (activeSection === "pending-ads") {
          setAds((prev) => prev.filter((a) => a.ad_id !== rejectingAd.ad_id));
        }
        setRecentPendingAds((prev) => prev.filter((a) => a.ad_id !== rejectingAd.ad_id));
        if (stats) {
          setStats({
            ...stats,
            pending_ads: Math.max(0, stats.pending_ads - 1),
            rejected_ads: stats.rejected_ads + 1
          });
        }
        setRejectingAd(null);
      } else {
        showFeedback("error", res.error?.message || "Failed to reject advertisement.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Open Edit Modal
  const handleOpenEdit = (ad: AdItem) => {
    setEditingAd(ad);
    setEditForm({
      title: ad.title || "",
      category: ad.category || "",
      description: ad.description || "",
      image_url: ad.image_url || "",
      location: ad.location || "",
      contact_preference: (ad.contact_preference as "EMAIL" | "PHONE" | "BOTH") || "EMAIL"
    });
  };

  // Action: Confirm Edit Ad
  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingAd) return;
    setProcessingId(editingAd.ad_id);
    try {
      const res = await adminEditAd(
        {
          ad_id: editingAd.ad_id,
          title: editForm.title.trim(),
          category: editForm.category.trim(),
          description: editForm.description.trim(),
          image_url: editForm.image_url.trim(),
          location: editForm.location.trim(),
          contact_preference: editForm.contact_preference
        },
        token
      );
      if (res.success && res.data) {
        showFeedback("success", "Advertisement details updated by administrator.");
        const updatedAd = res.data.ad;
        setAds((prev) => prev.map((a) => (a.ad_id === updatedAd.ad_id ? { ...a, ...updatedAd } : a)));
        setRecentPendingAds((prev) => prev.map((a) => (a.ad_id === updatedAd.ad_id ? { ...a, ...updatedAd } : a)));
        setEditingAd(null);
      } else {
        showFeedback("error", res.error?.message || "Failed to update advertisement.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Admin Delete Ad
  const handleDeleteAd = async (adId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to delete this advertisement? This action cannot be undone.")) return;

    try {
      const res = await adminDeleteAd(adId, token);
      if (res.success) {
        setAds((prev) => prev.filter((a) => a.ad_id !== adId));
        loadSectionData();
      } else {
        alert(res.error?.message || "Failed to delete advertisement.");
      }
    } catch (err: any) {
      alert("Error deleting ad: " + err.message);
    }
  };

  const handleSponsorAd = async (adId: string) => {
    if (!token) return;
    const daysStr = window.prompt("Enter sponsorship duration in days (e.g., 7):", "7");
    if (!daysStr) return;
    const days = parseInt(daysStr, 10);
    if (isNaN(days) || days <= 0) {
      alert("Please enter a valid positive number of days.");
      return;
    }
    const res = await adminSponsorAd({ ad_id: adId, duration_days: days }, token);
    if (res.success) {
      alert("Advertisement successfully sponsored!");
      loadSectionData();
    } else {
      alert(res.error?.message || "Failed to sponsor ad. Ensure ad owner has an active membership.");
    }
  };

  const handleRevokeSponsor = async (adId: string) => {
    if (!token) return;
    if (!window.confirm("Are you sure you want to revoke sponsorship from this advertisement?")) return;
    const res = await adminRevokeSponsorAd(adId, token);
    if (res.success) {
      alert("Sponsorship revoked.");
      loadSectionData();
    } else {
      alert(res.error?.message || "Failed to revoke sponsorship.");
    }
  };

  // Action: Save Setting
  const handleSaveSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingSetting) return;
    setProcessingId("setting_" + editingSetting.setting);
    try {
      const res = await adminUpdateSetting(editingSetting.setting, settingValue, token);
      if (res.success) {
        showFeedback("success", `Setting '${editingSetting.setting}' updated.`);
        setSettings((prev) =>
          prev.map((s) => (s.setting === editingSetting.setting ? { ...s, value: settingValue } : s))
        );
        setEditingSetting(null);
      } else {
        showFeedback("error", res.error?.message || "Failed to update setting.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Loading state
  if (isAuthLoading || isAdminVerified === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-4">
          Verifying administrative authorization...
        </p>
      </div>
    );
  }

  // Access Denied Screen (Strict Server-Side Enforcement)
  if (!isAdminVerified) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Access Denied
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {authError || "Administrative privileges are required. This account is not listed as an active administrator in the Admins Google Sheet."}
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-500 dark:text-slate-400">
            Authorization is strictly validated on the server. Frontend roles and request parameters are rejected.
          </div>
          <div className="flex gap-3 pt-2">
            <Link
              to="/dashboard"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
            >
              Back to User Dashboard
            </Link>
            <Link
              to="/login"
              className="flex-1 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors"
            >
              Switch Account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Admin Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              FreeAds Post
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-400 text-slate-950 uppercase tracking-wider">
              ADMIN PORTAL
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              User Dashboard →
            </Link>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold hover:bg-slate-800 text-slate-300"
            >
              Exit Admin
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row gap-6">

        {/* Sidebar Navigation: 8 Required Sections */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm space-y-1 sticky top-24">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Admin Sections
            </div>

            {[
              { id: "dashboard", label: "Dashboard", count: null },
              { id: "users", label: "Users", count: stats?.total_users },
              { id: "pending-ads", label: "Pending Ads", count: stats?.pending_ads, alert: !!stats && stats.pending_ads > 0 },
              { id: "approved-ads", label: "Approved Ads", count: stats?.approved_ads },
              { id: "rejected-ads", label: "Rejected Ads", count: stats?.rejected_ads },
              { id: "memberships", label: "Memberships", count: stats?.active_memberships },
              { id: "activity-logs", label: "Activity Logs", count: null },
              { id: "settings", label: "Settings", count: null }
            ].map((tab) => {
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as AdminSection)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== null && tab.count !== undefined && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? "bg-blue-800 text-white"
                          : tab.alert
                          ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-extrabold"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Content Pane */}
        <main className="flex-1 space-y-6 min-w-0">

          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`p-4 rounded-xl text-xs sm:text-sm flex items-center justify-between animate-fadeIn shadow-sm ${
                feedback.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                  : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
              }`}
            >
              <span>{feedback.text}</span>
              <button onClick={() => setFeedback(null)} className="underline text-xs opacity-75">
                Dismiss
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* 1. DASHBOARD SECTION (8 STATS CARDS)                      */}
          {/* ========================================================= */}
          {activeSection === "dashboard" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Admin Overview
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Platform telemetry grounded directly in Google Sheets worksheets.
                  </p>
                </div>
              </div>

              {/* 8 Statistics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. Total users */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Users
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {stats ? stats.total_users : "-"}
                  </div>
                  <span className="text-[10px] text-slate-400">Registered accounts</span>
                </div>

                {/* 2. Verified users */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                    Verified Users
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                    {stats ? stats.verified_users : "-"}
                  </div>
                  <span className="text-[10px] text-slate-400">Email verified = true</span>
                </div>

                {/* 3. Active users */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                    Active Users
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-blue-700 dark:text-blue-300 mt-1">
                    {stats ? stats.active_users : "-"}
                  </div>
                  <span className="text-[10px] text-slate-400">status = ACTIVE</span>
                </div>

                {/* 4. Pending ads */}
                <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 shadow-sm bg-amber-50/20">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                    Pending Ads
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">
                    {stats ? stats.pending_ads : "-"}
                  </div>
                  <span className="text-[10px] text-amber-600 font-semibold">Requires moderation</span>
                </div>

                {/* 5. Approved ads */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                    Approved Ads
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {stats ? stats.approved_ads : "-"}
                  </div>
                  <span className="text-[10px] text-slate-400">Live in public feed</span>
                </div>

                {/* 6. Rejected ads */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                    Rejected Ads
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-rose-700 dark:text-rose-300 mt-1">
                    {stats ? stats.rejected_ads : "-"}
                  </div>
                  <span className="text-[10px] text-slate-400">Declined by admin</span>
                </div>

                {/* 7. Sponsored ads */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                    Sponsored Ads
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-purple-700 dark:text-purple-300 mt-1">
                    {stats ? stats.sponsored_ads : "-"}
                  </div>
                  <span className="text-[10px] text-slate-400">Priority placement</span>
                </div>

                {/* 8. Active memberships */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Active Memberships
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {stats ? stats.active_memberships : "-"}
                  </div>
                  <span className="text-[10px] text-slate-400">Active tier holders</span>
                </div>
              </div>

              {/* Pending Queue Quick Action */}
              {stats && stats.pending_ads > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                      {stats.pending_ads} Advertisement{stats.pending_ads > 1 ? "s" : ""} awaiting review
                    </h3>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                      Classified advertisements require manual review before being published.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveSection("pending-ads")}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto"
                  >
                    Open Moderation Queue →
                  </button>
                </div>
              )}

              {/* Recent Pending Ads preview */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Recent Submissions Awaiting Approval
                  </h3>
                  <button
                    onClick={() => setActiveSection("pending-ads")}
                    className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    View all pending
                  </button>
                </div>

                {recentPendingAds.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No pending advertisements in queue. All submissions are reviewed!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recentPendingAds.map((ad) => (
                      <div
                        key={ad.ad_id}
                        className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              {ad.category}
                            </span>
                            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {ad.title}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 mt-1 block">
                            Location: {ad.location} • Submitted: {formatDate(ad.created_at)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            disabled={processingId === ad.ad_id}
                            onClick={() => handleApproveAd(ad.ad_id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                          >
                            Approve
                          </button>
                          <button
                            disabled={processingId === ad.ad_id}
                            onClick={() => handleOpenReject(ad)}
                            className="px-3 py-1.5 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold rounded-lg"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. USERS SECTION                                         */}
          {/* ========================================================= */}
          {/* ========================================================= */}
          {/* 2. USERS SECTION                                         */}
          {/* ========================================================= */}
          {activeSection === "users" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Platform Users ({users.length})
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Records loaded directly from the Users worksheet with real-time inactivity tracking.
                  </p>
                </div>
                <button
                  disabled={isScanningInactivity || isLoadingSection}
                  onClick={handleRunInactivityScan}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                  title="Evaluates all users, sends warning notices, and sets ads of users inactive for 90+ days to HIDDEN"
                >
                  <span className={isScanningInactivity ? "animate-spin" : ""}>🔄</span>
                  <span>{isScanningInactivity ? "Running Inactivity Scan..." : "Run Inactivity Scan"}</span>
                </button>
              </div>

              {/* Activity Filter Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {[
                  { key: "ALL", label: "All Users", count: users.length },
                  { key: "ACTIVE", label: "Active", count: users.filter(u => u.inactivity_status === "ACTIVE" || (!u.inactivity_status && (!u.days_inactive || u.days_inactive < 60))).length },
                  { key: "WARNING", label: "Warning (60+ d)", count: users.filter(u => u.inactivity_status === "WARNING" || (u.days_inactive !== undefined && u.days_inactive >= 60 && u.days_inactive < 90)).length },
                  { key: "INACTIVE", label: "Inactive (90+ d)", count: users.filter(u => u.inactivity_status === "INACTIVE" || (u.days_inactive !== undefined && u.days_inactive >= 90)).length }
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setUserActivityFilter(f.key as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                      userActivityFilter === f.key
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span>{f.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>

              {isLoadingSection ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading users...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border-y border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">User ID</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Last Login</th>
                        <th className="p-3">Activity Status</th>
                        <th className="p-3">Verified</th>
                        <th className="p-3">Account Status</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {users
                        .filter((u) => {
                          const days = u.days_inactive !== undefined ? u.days_inactive : 0;
                          const isInactive = u.inactivity_status === "INACTIVE" || days >= 90;
                          const isWarning = u.inactivity_status === "WARNING" || (days >= 60 && days < 90);
                          if (userActivityFilter === "INACTIVE") return isInactive;
                          if (userActivityFilter === "WARNING") return isWarning;
                          if (userActivityFilter === "ACTIVE") return !isInactive && !isWarning;
                          return true;
                        })
                        .map((u) => {
                          const days = u.days_inactive !== undefined ? u.days_inactive : 0;
                          const isInactive = u.inactivity_status === "INACTIVE" || days >= 90;
                          const isWarning = u.inactivity_status === "WARNING" || (days >= 60 && days < 90);

                          return (
                            <tr key={u.user_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                              <td className="p-3 font-mono text-[11px] text-slate-500">{u.user_id}</td>
                              <td className="p-3 font-semibold text-slate-900 dark:text-white">{u.name}</td>
                              <td className="p-3 text-slate-600 dark:text-slate-300">{u.email}</td>
                              <td className="p-3 text-slate-500">
                                {u.last_login ? formatDate(u.last_login) : <span className="text-slate-400 italic">Never</span>}
                              </td>
                              <td className="p-3">
                                {isInactive ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    INACTIVE ({days}d)
                                  </span>
                                ) : isWarning ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    WARNING ({days}d)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    ACTIVE ({days}d)
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                {u.email_verified ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    TRUE
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    FALSE
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {u.account_status}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-[11px]">{u.role}</td>
                              <td className="p-3 text-slate-400">{formatDate(u.created_at)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 3. PENDING ADS (MODERATION QUEUE)                         */}
          {/* ========================================================= */}
          {activeSection === "pending-ads" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Pending Advertisements Queue ({ads.length})
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Review and moderate newly submitted or edited advertisements.
                  </p>
                </div>
              </div>

              {isLoadingSection ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading pending ads...</div>
              ) : ads.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No pending advertisements. The moderation queue is clear!
                </div>
              ) : (
                <div className="space-y-4">
                  {ads.map((ad) => (
                    <div
                      key={ad.ad_id}
                      className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              PENDING REVIEW
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              {ad.category}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              ID: {ad.ad_id}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            {ad.title}
                          </h3>
                        </div>

                        {/* All 4 Actions: APPROVE, REJECT, EDIT, DELETE */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            disabled={processingId === ad.ad_id}
                            onClick={() => handleApproveAd(ad.ad_id)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={processingId === ad.ad_id}
                            onClick={() => handleOpenReject(ad)}
                            className="px-3.5 py-1.5 border border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            disabled={processingId === ad.ad_id}
                            onClick={() => handleOpenEdit(ad)}
                            className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            disabled={processingId === ad.ad_id}
                            onClick={() => handleDeleteAd(ad.ad_id)}
                            className="px-3.5 py-1.5 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        {ad.description}
                      </p>

                      {/* Image URL preview (if provided) */}
                      {ad.image_url ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
                          <img
                            src={ad.image_url}
                            alt={ad.title}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              External Image URL
                            </span>
                            <a
                              href={ad.image_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block"
                            >
                              {ad.image_url}
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">
                          No image URL provided for this advertisement.
                        </div>
                      )}

                      {/* Metadata Grid (Location, Contact, User details, Created date) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-500">
                        <div>
                          <span className="font-semibold text-slate-400 block text-[11px]">Location</span>
                          <span className="text-slate-700 dark:text-slate-300">{ad.location}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400 block text-[11px]">Contact Preference</span>
                          <span className="text-slate-700 dark:text-slate-300">{ad.contact_preference}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400 block text-[11px]">User</span>
                          <span className="text-slate-800 dark:text-slate-200 font-medium">
                            {ad.user_name || "User"}
                          </span>
                          {ad.user_email && (
                            <span className="block text-[11px] text-slate-400 truncate">{ad.user_email}</span>
                          )}
                          <span className="block font-mono text-[10px] text-slate-400">UID: {ad.user_id}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400 block text-[11px]">Created Date</span>
                          <span className="text-slate-700 dark:text-slate-300">{formatDate(ad.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 4. APPROVED ADS SECTION                                   */}
          {/* ========================================================= */}
          {activeSection === "approved-ads" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Approved Advertisements ({ads.length})
                </h2>
              </div>

              {isLoadingSection ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading approved ads...</div>
              ) : (
                <div className="space-y-3">
                  {ads.map((ad) => (
                    <div
                      key={ad.ad_id}
                      className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            APPROVED
                          </span>
                          {ad.is_sponsored && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                              ★ SPONSORED
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {ad.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
                          <span>Category: {ad.category}</span>
                          <span>Location: {ad.location}</span>
                          {ad.is_sponsored && ad.sponsored_until && (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              Sponsored Until: {formatDate(ad.sponsored_until)}
                            </span>
                          )}
                          <span>Approved: {formatDate(ad.approved_at || ad.updated_at)}</span>
                          <span>Expires: {formatDate(ad.expires_at)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {ad.is_sponsored ? (
                          <button
                            onClick={() => handleRevokeSponsor(ad.ad_id)}
                            className="px-3 py-1.5 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          >
                            Revoke Sponsor
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSponsorAd(ad.ad_id)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg shadow-sm"
                          >
                            ★ Sponsor Ad
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(ad)}
                          className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAd(ad.ad_id)}
                          className="px-3 py-1.5 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 5. REJECTED ADS SECTION                                   */}
          {/* ========================================================= */}
          {activeSection === "rejected-ads" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Rejected Advertisements ({ads.length})
                </h2>
              </div>

              {isLoadingSection ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading rejected ads...</div>
              ) : (
                <div className="space-y-3">
                  {ads.map((ad) => (
                    <div
                      key={ad.ad_id}
                      className="p-4 rounded-xl border border-rose-100 dark:border-rose-950/40 bg-rose-50/20 dark:bg-rose-950/10 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            REJECTED
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {ad.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(ad)}
                            className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAd(ad.ad_id)}
                            className="px-2.5 py-1 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-rose-800 dark:text-rose-300">
                        <strong className="font-semibold">Reason:</strong> {ad.rejection_reason || "No reason specified"}
                      </p>
                      <div className="text-[11px] text-slate-400">
                        Updated: {formatDate(ad.updated_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 6. MEMBERSHIPS SECTION                                    */}
          {/* ========================================================= */}
          {activeSection === "memberships" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Memberships ({memberships.length})
                </h2>
              </div>

              {isLoadingSection ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading memberships...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border-y border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">Membership ID</th>
                        <th className="p-3">User ID</th>
                        <th className="p-3">Plan</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Start Date</th>
                        <th className="p-3">Expiry Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {memberships.map((m) => (
                        <tr key={m.membership_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-3 font-mono text-[11px]">{m.membership_id}</td>
                          <td className="p-3 font-mono text-[11px]">{m.user_id}</td>
                          <td className="p-3 font-semibold">{m.plan}</td>
                          <td className="p-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              {m.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400">{formatDate(m.start_date)}</td>
                          <td className="p-3 text-slate-400">{formatDate(m.expiry_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 7. ACTIVITY LOGS SECTION                                  */}
          {/* ========================================================= */}
          {activeSection === "activity-logs" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Platform Activity Audit Trail ({logs.length})
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Full audit history recorded in the ActivityLog worksheet.
                  </p>
                </div>
              </div>

              {isLoadingSection ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading audit logs...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border-y border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">User ID</th>
                        <th className="p-3">Entity Type</th>
                        <th className="p-3">Entity ID</th>
                        <th className="p-3">Metadata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {logs.map((log) => (
                        <tr key={log.log_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 font-mono text-[11px]">
                          <td className="p-3 text-slate-400 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                          <td className="p-3 font-bold text-blue-600 dark:text-blue-400">{log.action}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{log.user_id}</td>
                          <td className="p-3 text-slate-500">{log.entity_type}</td>
                          <td className="p-3 text-slate-500">{log.entity_id || "-"}</td>
                          <td className="p-3 text-slate-400 truncate max-w-xs">{log.metadata || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 8. SETTINGS SECTION                                       */}
          {/* ========================================================= */}
          {activeSection === "settings" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    System Configuration Settings
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Parameters stored in the Settings worksheet.
                  </p>
                </div>
              </div>

              {isLoadingSection ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading settings...</div>
              ) : (
                <div className="space-y-3">
                  {settings.map((s) => (
                    <div
                      key={s.setting}
                      className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                          {s.setting}
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">{s.description}</p>
                        <div className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 mt-1">
                          Current Value: {s.value}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setEditingSetting(s);
                          setSettingValue(s.value);
                        }}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg self-start sm:self-auto"
                      >
                        Edit Value
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* --- MODAL: REJECT AD WITH REASON --- */}
      {rejectingAd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Reject Advertisement
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Provide a clear reason for rejecting &ldquo;{rejectingAd.title}&rdquo;. This will be visible to the user on their My Ads page.
            </p>
            <form onSubmit={handleConfirmReject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  placeholder="e.g. Image URL is broken or content violates guidelines."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingAd(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingId === rejectingAd.ad_id}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-sm disabled:opacity-50"
                >
                  {processingId === rejectingAd.ad_id ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ADMIN EDIT AD --- */}
      {editingAd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Admin Edit Advertisement
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: {editingAd.ad_id} • Status: {editingAd.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAd(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmEdit} className="space-y-3.5">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Category & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Services">Services</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Real Estate">Real Estate</option>
                    <option value="Jobs">Jobs</option>
                    <option value="Vehicles">Vehicles</option>
                    <option value="Community">Community</option>
                    <option value="Buy / Sell">Buy / Sell</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Location <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Contact Preference */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contact Preference
                </label>
                <select
                  value={editForm.contact_preference}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      contact_preference: e.target.value as "EMAIL" | "PHONE" | "BOTH"
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="EMAIL">Email Only</option>
                  <option value="PHONE">Phone Only</option>
                  <option value="BOTH">Both Email and Phone</option>
                </select>
              </div>

              {/* External Image URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  External Image URL (optional)
                </label>
                <input
                  type="url"
                  value={editForm.image_url}
                  placeholder="https://example.com/photo.jpg"
                  onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Must be an HTTP or HTTPS link. No file uploads.
                </span>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAd(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingId === editingAd.ad_id}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm disabled:opacity-50"
                >
                  {processingId === editingAd.ad_id ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: EDIT SETTING --- */}
      {editingSetting && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Edit Setting: {editingSetting.setting}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {editingSetting.description}
            </p>
            <form onSubmit={handleSaveSetting} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Setting Value
                </label>
                <input
                  type="text"
                  required
                  value={settingValue}
                  onChange={(e) => setSettingValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSetting(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingId === "setting_" + editingSetting.setting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm disabled:opacity-50"
                >
                  Save Setting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
