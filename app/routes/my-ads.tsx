import { useState, useEffect } from "react";
import { Link } from "react-router";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { useAuth } from "~/context/AuthContext";
import {
  getMyAds,
  updateAd,
  hideAd,
  resubmitAd,
  reactivateAd,
  deleteAd,
  type AdItem,
  type UpdateAdPayload
} from "~/services/api";

const CATEGORIES = [
  "Services",
  "Vehicles",
  "Electronics",
  "Real Estate",
  "Jobs",
  "Community",
  "Buy & Sell",
  "Home & Garden",
  "Fashion",
  "Other"
];

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
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

export function meta() {
  return [
    { title: "My Classified Advertisements - FreeAds Post" },
    { name: "description", content: "Manage your classified advertisements on FreeAds Post." }
  ];
}

export default function MyAdsPage() {
  return (
    <ProtectedRoute>
      <MyAdsContent />
    </ProtectedRoute>
  );
}

function MyAdsContent() {
  const { token, user } = useAuth();
  const [ads, setAds] = useState<AdItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [editingAd, setEditingAd] = useState<AdItem | null>(null);
  const [deletingAd, setDeletingAd] = useState<AdItem | null>(null);

  // Edit form state
  const [editFormData, setEditFormData] = useState<UpdateAdPayload>({
    ad_id: "",
    title: "",
    category: "Services",
    description: "",
    location: "",
    contact_preference: "EMAIL",
    image_url: ""
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Load user ads on mount
  useEffect(() => {
    fetchAds();
  }, [token]);

  const fetchAds = async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getMyAds(token);
      if (res.success && res.data) {
        setAds(res.data.ads || []);
      } else {
        setErrorMessage(res.error?.message || "Failed to load your advertisements.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load advertisements.");
    } finally {
      setIsLoading(false);
    }
  };

  const showFeedback = (type: "success" | "error", text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);
  };

  // Open edit modal
  const handleOpenEdit = (ad: AdItem) => {
    setEditingAd(ad);
    setEditFormData({
      ad_id: ad.ad_id,
      title: ad.title || "",
      category: ad.category || "Services",
      description: ad.description || "",
      location: ad.location || "",
      contact_preference: (ad.contact_preference as any) || "EMAIL",
      image_url: ad.image_url || ""
    });
    setEditErrors({});
  };

  // Submit edit form
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingAd) return;

    // Validate
    const errors: Record<string, string> = {};
    if (!editFormData.title.trim() || editFormData.title.trim().length < 5) {
      errors.title = "Title must be at least 5 characters.";
    }
    if (!editFormData.description.trim() || editFormData.description.trim().length < 20) {
      errors.description = "Description must be at least 20 characters.";
    }
    if (!editFormData.location.trim() || editFormData.location.trim().length < 2) {
      errors.location = "Location is required.";
    }
    if (editFormData.image_url && editFormData.image_url.trim()) {
      const url = editFormData.image_url.trim();
      if (!/^https?:\/\//i.test(url)) {
        errors.image_url = "Image URL must start with http:// or https://";
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setIsSubmittingEdit(true);
    setEditErrors({});

    try {
      const res = await updateAd(editFormData, token);
      if (res.success) {
        showFeedback("success", res.message || "Advertisement updated and submitted for admin review.");
        setEditingAd(null);
        fetchAds();
      } else {
        setEditErrors({ form: res.error?.message || "Failed to update advertisement." });
      }
    } catch (err: any) {
      setEditErrors({ form: err.message || "An unexpected error occurred." });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Hide action (APPROVED -> HIDDEN)
  const handleHide = async (adId: string) => {
    if (!token) return;
    setProcessingId(adId);
    try {
      const res = await hideAd(adId, token);
      if (res.success) {
        showFeedback("success", "Advertisement has been paused/hidden from public listings.");
        fetchAds();
      } else {
        showFeedback("error", res.error?.message || "Failed to hide advertisement.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Resubmit action (REJECTED -> PENDING)
  const handleResubmit = async (adId: string) => {
    if (!token) return;
    setProcessingId(adId);
    try {
      const res = await resubmitAd(adId, token);
      if (res.success) {
        showFeedback("success", "Advertisement resubmitted for admin approval.");
        fetchAds();
      } else {
        showFeedback("error", res.error?.message || "Failed to resubmit advertisement.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Safe Reactivation action (HIDDEN -> PENDING)
  const handleReactivate = async (adId: string) => {
    if (!token) return;
    setProcessingId(adId);
    try {
      const res = await reactivateAd(adId, token);
      if (res.success) {
        showFeedback("success", "Advertisement submitted for admin review to reactivate.");
        fetchAds();
      } else {
        showFeedback("error", res.error?.message || "Failed to request reactivation.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Delete action (-> DELETED)
  const handleConfirmDelete = async () => {
    if (!token || !deletingAd) return;
    setProcessingId(deletingAd.ad_id);
    try {
      const res = await deleteAd(deletingAd.ad_id, token);
      if (res.success) {
        showFeedback("success", "Advertisement deleted successfully.");
        setDeletingAd(null);
        fetchAds();
      } else {
        showFeedback("error", res.error?.message || "Failed to delete advertisement.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred.");
    } finally {
      setProcessingId(null);
    }
  };

  // Filter & paginate ads
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  const filteredAds = ads.filter((ad) => {
    if (activeFilter === "ALL") return true;
    return ad.status === activeFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAds.length / ITEMS_PER_PAGE));
  const paginatedAds = filteredAds.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Clear, high-contrast status badge helper
  const getStatusBadge = (status: AdItem["status"]) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <span>⏳</span>
            <span>UNDER REVIEW</span>
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span>✓</span>
            <span>LIVE &amp; APPROVED</span>
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <span>✗</span>
            <span>DECLINED</span>
          </span>
        );
      case "HIDDEN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <span>⏸</span>
            <span>PAUSED / HIDDEN</span>
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            <span>📅</span>
            <span>EXPIRED</span>
          </span>
        );
      case "DELETED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 line-through border border-slate-200 dark:border-slate-800">
            DELETED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header Breadcrumbs & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <Link to="/dashboard" className="hover:text-blue-600 transition-colors">
                Dashboard
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">My Ads</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              My Classified Advertisements
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage, edit, pause, and track all listings posted by {user?.email}.
            </p>
          </div>

          <Link
            to="/post-ad"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold rounded-md transition-colors shadow-sm self-start sm:self-auto"
          >
            <span>+</span>
            <span>Post New Ad</span>
          </Link>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div
            className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between shadow-sm ${
              feedbackMessage.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800"
                : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{feedbackMessage.type === "success" ? "✅" : "⚠️"}</span>
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-xs font-semibold underline opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { key: "ALL", label: "All Ads", count: ads.length },
            { key: "PENDING", label: "Under Review", count: ads.filter((a) => a.status === "PENDING").length },
            { key: "APPROVED", label: "Live & Approved", count: ads.filter((a) => a.status === "APPROVED").length },
            { key: "REJECTED", label: "Declined", count: ads.filter((a) => a.status === "REJECTED").length },
            { key: "HIDDEN", label: "Paused", count: ads.filter((a) => a.status === "HIDDEN").length },
            { key: "EXPIRED", label: "Expired", count: ads.filter((a) => a.status === "EXPIRED").length },
            { key: "DELETED", label: "Deleted", count: ads.filter((a) => a.status === "DELETED").length }
          ].map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => setActiveFilter(pill.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeFilter === pill.key
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span>{pill.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                  activeFilter === pill.key
                    ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-800"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                {pill.count}
              </span>
            </button>
          ))}
        </div>

        {/* Paused Listings Notice */}
        {!isLoading && ads.some((a) => a.status === "HIDDEN") && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 shadow-sm">
            <span className="text-base leading-none mt-0.5">ℹ️</span>
            <div className="space-y-0.5">
              <strong className="font-bold block">Paused Listings Policy:</strong>
              <p className="leading-relaxed">
                One or more of your advertisements are currently <strong>PAUSED / HIDDEN</strong>. In accordance with marketplace safety standards, listings are not published publicly without administrator review. Click <strong>&ldquo;Request Reactivation&rdquo;</strong> to submit your ad for approval.
              </p>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center">
            <div className="w-7 h-7 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-2.5">
              Loading your advertisements...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-lg p-6 text-center space-y-2.5">
            <span className="text-2xl">⚠️</span>
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{errorMessage}</p>
            <button
              type="button"
              onClick={fetchAds}
              className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded"
            >
              Retry
            </button>
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center text-lg">
              📂
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {activeFilter === "ALL" ? "No advertisements found" : `No ${activeFilter.toLowerCase()} advertisements`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm mx-auto">
                {activeFilter === "ALL"
                  ? "You have not submitted any advertisements yet. Click below to create your first free listing."
                  : `You currently do not have any advertisements with status '${activeFilter}'.`}
              </p>
            </div>
            {activeFilter === "ALL" ? (
              <Link
                to="/post-ad"
                className="inline-flex items-center gap-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded shadow-sm"
              >
                + Post Your First Ad
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setActiveFilter("ALL")}
                className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline"
              >
                View all advertisements
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {paginatedAds.map((ad) => {
              const isProcessing = processingId === ad.ad_id;

              return (
                <div
                  key={ad.ad_id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    {/* Left details */}
                    <div className="flex-1 space-y-2">
                      {/* Status and Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {getStatusBadge(ad.status)}

                        {ad.is_sponsored ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-500 text-slate-950 uppercase">
                            ★ SPONSORED
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            Standard
                          </span>
                        )}

                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                          {ad.category}
                        </span>

                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {ad.ad_id}
                        </span>
                      </div>

                      {/* Ad Title */}
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                        {ad.title}
                      </h2>

                      {/* Rejection Reason Alert if REJECTED */}
                      {ad.status === "REJECTED" && ad.rejection_reason && (
                        <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded text-xs text-rose-800 dark:text-rose-200">
                          <strong className="font-bold">Moderation Reason:</strong> {ad.rejection_reason}
                        </div>
                      )}

                      {/* Key Information Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 text-slate-600 dark:text-slate-400">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Location</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {ad.location || "Not specified"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Created</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatDate(ad.created_at)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Updated</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatDate(ad.updated_at)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Valid Until</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatDate(ad.expires_at)}
                          </span>
                        </div>
                      </div>

                      {/* Thumbnail Preview */}
                      {ad.image_url && (
                        <div className="flex items-center gap-2 pt-1">
                          <img
                            src={ad.image_url}
                            alt={ad.title}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 object-cover rounded border border-slate-200 dark:border-slate-700 bg-slate-100"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <span className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">
                            External image URL attached
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions Column bound strictly by status */}
                    <div className="flex lg:flex-col items-center lg:items-end gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                      {/* PENDING Actions: Edit, Delete */}
                      {ad.status === "PENDING" && (
                        <>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleOpenEdit(ad)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => setDeletingAd(ad)}
                            className="px-3 py-1.5 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}

                      {/* APPROVED Actions: Edit, Hide, Delete */}
                      {ad.status === "APPROVED" && (
                        <>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleOpenEdit(ad)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleHide(ad.ad_id)}
                            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded transition-colors"
                          >
                            {isProcessing ? "Pausing..." : "Pause Ad"}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => setDeletingAd(ad)}
                            className="px-3 py-1.5 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}

                      {/* REJECTED Actions: Edit, Resubmit, Delete */}
                      {ad.status === "REJECTED" && (
                        <>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleOpenEdit(ad)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleResubmit(ad.ad_id)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded transition-colors shadow-sm"
                          >
                            {isProcessing ? "Submitting..." : "Resubmit"}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => setDeletingAd(ad)}
                            className="px-3 py-1.5 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}

                      {/* HIDDEN Actions: Request Reactivation, Edit, Delete */}
                      {ad.status === "HIDDEN" && (
                        <>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleReactivate(ad.ad_id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded transition-colors shadow-sm"
                            title="Submit this advertisement for admin review to reactivate"
                          >
                            {isProcessing && processingId === ad.ad_id ? "Requesting..." : "Request Reactivation"}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleOpenEdit(ad)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => setDeletingAd(ad)}
                            className="px-3 py-1.5 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing <strong className="text-slate-800 dark:text-slate-200">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to{" "}
                  <strong className="text-slate-800 dark:text-slate-200">{Math.min(currentPage * ITEMS_PER_PAGE, filteredAds.length)}</strong> of{" "}
                  <strong className="text-slate-800 dark:text-slate-200">{filteredAds.length}</strong> advertisements
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-600 dark:text-slate-400 px-1">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* --- MODAL 1: EDIT AD --- */}
      {editingAd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-2xl w-full p-5 sm:p-7 shadow-xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Edit Classified Advertisement
                </h3>
                <p className="text-xs text-slate-400">
                  Ad ID: {editingAd.ad_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAd(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-lg"
              >
                ✕
              </button>
            </div>

            {/* Crucial Notice: Status resets to PENDING */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <div>
                <strong className="font-bold block mb-0.5">Admin Moderation Notice:</strong>
                Saving changes to this advertisement will reset its status to <strong>PENDING</strong> for administrator review before it appears in public listings.
              </div>
            </div>

            {editErrors.form && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs rounded border border-rose-200 dark:border-rose-800">
                {editErrors.form}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs sm:text-sm">
              {/* Title */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Advertisement Title"
                />
                {editErrors.title && <p className="text-xs text-rose-500 mt-1">{editErrors.title}</p>}
              </div>

              {/* Category & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editFormData.category}
                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Location <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.location}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                    className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="City, State"
                  />
                  {editErrors.location && <p className="text-xs text-rose-500 mt-1">{editErrors.location}</p>}
                </div>
              </div>

              {/* Contact Preference */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Contact Preference
                </label>
                <div className="flex gap-2">
                  {(["EMAIL", "PHONE", "BOTH"] as const).map((pref) => (
                    <button
                      type="button"
                      key={pref}
                      onClick={() => setEditFormData({ ...editFormData, contact_preference: pref })}
                      className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors ${
                        editFormData.contact_preference === pref
                          ? "bg-amber-600 text-white border-amber-600 font-bold"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {pref === "BOTH" ? "Both (Email & Phone)" : pref}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Describe your item or service (minimum 20 characters)..."
                />
                {editErrors.description && <p className="text-xs text-rose-500 mt-1">{editErrors.description}</p>}
              </div>

              {/* External Image URL */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  External Image URL <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="url"
                  value={editFormData.image_url || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, image_url: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="https://example.com/image.jpg"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Direct HTTPS link only. No file uploads.
                </span>
                {editErrors.image_url && <p className="text-xs text-rose-500 mt-1">{editErrors.image_url}</p>}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAd(null)}
                  className="px-3.5 py-1.5 rounded text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmittingEdit ? "Saving..." : "Save & Re-submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: DELETE CONFIRMATION --- */}
      {deletingAd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-5 shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 mx-auto flex items-center justify-center text-lg">
              🗑️
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Advertisement?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">&ldquo;{deletingAd.title}&rdquo;</strong>?
                This action will mark the ad as DELETED.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingAd(null)}
                className="px-3.5 py-1.5 rounded text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={processingId === deletingAd.ad_id}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded shadow-sm transition-colors disabled:opacity-50"
              >
                {processingId === deletingAd.ad_id ? "Deleting..." : "Yes, Delete Ad"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
