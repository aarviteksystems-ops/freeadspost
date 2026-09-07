import { useState } from "react";
import { Link } from "react-router";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { useAuth } from "~/context/AuthContext";
import { createAd, type CreateAdPayload } from "~/services/api";

export function meta() {
  return [
    { title: "Post a Free Advertisement - FreeAds Post" },
    { name: "description", content: "Submit a verified classified advertisement on FreeAds Post." },
  ];
}

const CATEGORIES = [
  "Services",
  "Vehicles",
  "Electronics",
  "Real Estate",
  "Jobs",
  "Community",
  "Buy & Sell",
];

export default function PostAdRoute() {
  return (
    <ProtectedRoute>
      <PostAdForm />
    </ProtectedRoute>
  );
}

function PostAdForm() {
  const { token } = useAuth();

  const [formData, setFormData] = useState<CreateAdPayload>({
    title: "",
    category: "Services",
    description: "",
    image_url: "",
    location: "",
    contact_preference: "EMAIL",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submittedAd, setSubmittedAd] = useState<{ ad_id: string; title: string } | null>(null);
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

  // Validate form client-side
  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = "Title is required";
    } else if (formData.title.trim().length < 5) {
      errors.title = "Title must be at least 5 characters";
    } else if (formData.title.trim().length > 120) {
      errors.title = "Title cannot exceed 120 characters";
    }

    if (!formData.category.trim()) {
      errors.category = "Please select a category";
    }

    if (!formData.description.trim()) {
      errors.description = "Description is required";
    } else if (formData.description.trim().length < 20) {
      errors.description = "Description must be at least 20 characters";
    } else if (formData.description.trim().length > 3000) {
      errors.description = "Description cannot exceed 3000 characters";
    }

    if (!formData.location.trim()) {
      errors.location = "Location is required";
    } else if (formData.location.trim().length < 2) {
      errors.location = "Location must be at least 2 characters";
    }

    // Strict URL validation: HTTP/HTTPS only, reject javascript:, data:, etc.
    const imgUrl = (formData.image_url || "").trim();
    if (imgUrl) {
      if (imgUrl.length > 500) {
        errors.image_url = "Image URL cannot exceed 500 characters";
      } else {
        const lower = imgUrl.toLowerCase();
        if (lower.startsWith("javascript:") || lower.includes("javascript:")) {
          errors.image_url = "Invalid URL: javascript: is strictly prohibited";
        } else if (lower.startsWith("data:") || lower.includes("data:")) {
          errors.image_url = "Invalid URL: Base64 data URIs are not allowed. Please provide an external HTTP/HTTPS URL";
        } else if (lower.startsWith("file:") || lower.startsWith("blob:")) {
          errors.image_url = "Invalid URL: Only HTTP and HTTPS URLs are allowed";
        } else if (!/^https?:\/\//i.test(imgUrl)) {
          errors.image_url = "Image URL must begin with http:// or https://";
        } else if (!/^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/i.test(imgUrl)) {
          errors.image_url = "Malformed image URL. Please enter a valid web address";
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "image_url") {
      setImagePreviewFailed(false);
    }
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validateForm()) {
      return;
    }

    if (!token) {
      setGeneralError("You must be logged in to post an advertisement.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createAd(
        {
          title: formData.title.trim(),
          category: formData.category,
          description: formData.description.trim(),
          image_url: formData.image_url?.trim() || undefined,
          location: formData.location.trim(),
          contact_preference: formData.contact_preference,
        },
        token
      );

      if (res.success && res.data?.ad) {
        setSubmittedAd({
          ad_id: res.data.ad.ad_id,
          title: res.data.ad.title,
        });
      } else {
        setGeneralError(res.error?.message || "Failed to submit advertisement.");
      }
    } catch (err: any) {
      setGeneralError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submission Success Screen
  if (submittedAd) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-8 shadow-md text-center space-y-4">
          <div className="w-14 h-14 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <div className="inline-block px-3 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold rounded uppercase tracking-wider">
            Status: PENDING REVIEW
          </div>

          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Advertisement Submitted Successfully!
          </h1>

          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            &ldquo;{submittedAd.title}&rdquo;
          </p>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded p-3.5 text-xs text-slate-600 dark:text-slate-300 text-left leading-relaxed">
            <strong className="text-slate-900 dark:text-white block mb-1">Human Moderation Policy:</strong>
            To protect our community from spam and fraudulent postings, your advertisement has been submitted to our moderation queue. An administrator will review and approve it shortly.
          </div>

          <div className="space-y-2 pt-2">
            <Link
              to="/dashboard"
              className="block w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md text-xs sm:text-sm transition-colors shadow-sm"
            >
              Go to Dashboard
            </Link>
            <button
              type="button"
              onClick={() => {
                setSubmittedAd(null);
                setFormData({
                  title: "",
                  category: "Services",
                  description: "",
                  image_url: "",
                  location: "",
                  contact_preference: "EMAIL",
                });
              }}
              className="block w-full py-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold"
            >
              + Post another advertisement
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Post a Classified Advertisement
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Submit your listing for administrative review and publication in our local directory.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="text-xs font-semibold px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Form (8 cols on lg) */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-7 shadow-sm">
            {generalError && (
              <div className="mb-5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <span className="text-base">⚠️</span>
                <div>{generalError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Title */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    Ad Title <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.title.length}/120
                  </span>
                </div>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  maxLength={120}
                  placeholder="e.g., Maruti Suzuki Swift 2021 VXI - Single Owner"
                  className={`w-full px-3 py-2 rounded-md border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                    fieldErrors.title ? "border-rose-500 focus:ring-rose-400" : "border-slate-300 dark:border-slate-700"
                  }`}
                />
                {fieldErrors.title && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.title}</p>
                )}
              </div>

              {/* Category & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                    Category <span className="text-rose-600">*</span>
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.category && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.category}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                    Location <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="e.g., Andheri West, Mumbai, MH"
                    className={`w-full px-3 py-2 rounded-md border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                      fieldErrors.location ? "border-rose-500 focus:ring-rose-400" : "border-slate-300 dark:border-slate-700"
                    }`}
                  />
                  {fieldErrors.location && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.location}</p>
                  )}
                </div>
              </div>

              {/* Contact Preference */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                  Contact Channel <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "EMAIL", label: "Email Only" },
                    { value: "PHONE", label: "Phone Only" },
                    { value: "BOTH", label: "Both Email & Phone" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          contact_preference: opt.value as "EMAIL" | "PHONE" | "BOTH",
                        }))
                      }
                      className={`py-2 px-2.5 text-xs font-semibold rounded border text-center transition-colors ${
                        formData.contact_preference === opt.value
                          ? "border-amber-600 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* External Image URL */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    External Image URL <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Public HTTPS link</span>
                </div>
                <input
                  type="url"
                  name="image_url"
                  value={formData.image_url}
                  onChange={handleChange}
                  placeholder="https://images.example.com/photo.jpg"
                  className={`w-full px-3 py-2 rounded-md border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                    fieldErrors.image_url ? "border-rose-500 focus:ring-rose-400" : "border-slate-300 dark:border-slate-700"
                  }`}
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Paste a direct link to an image hosted on Imgur, Cloudinary, or any public HTTPS server.
                </p>
                {fieldErrors.image_url && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.image_url}</p>
                )}

                {/* Safe live image preview */}
                {formData.image_url && !fieldErrors.image_url && /^https?:\/\//i.test(formData.image_url) && (
                  <div className="mt-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                      Live Thumbnail Preview:
                    </div>
                    {imagePreviewFailed ? (
                      <div className="py-3 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded border border-dashed border-slate-200 dark:border-slate-700">
                        Unable to load external preview. Please ensure the URL is publicly accessible.
                      </div>
                    ) : (
                      <div className="max-w-xs mx-auto overflow-hidden rounded bg-slate-100 dark:bg-slate-900 h-36 flex items-center justify-center">
                        <img
                          src={formData.image_url}
                          alt="Ad preview"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain"
                          onError={() => setImagePreviewFailed(true)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    Full Description <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.description.length}/3000
                  </span>
                </div>
                <textarea
                  name="description"
                  rows={5}
                  value={formData.description}
                  onChange={handleChange}
                  maxLength={3000}
                  placeholder="Describe your item, vehicle, property, service, or job in detail. Include condition, model year, pricing, and availability..."
                  className={`w-full px-3 py-2 rounded-md border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                    fieldErrors.description ? "border-rose-500 focus:ring-rose-400" : "border-slate-300 dark:border-slate-700"
                  }`}
                />
                {fieldErrors.description && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.description}</p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Submitting for Review...</span>
                    </>
                  ) : (
                    "Submit Advertisement for Review"
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Guidelines Sidebar (4 cols on lg) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Posting Guidelines</span>
              </h3>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>Accurate Title:</strong> Mention brand, model, or specific service title clearly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>Indian Location:</strong> Include your locality and city so local buyers find you quickly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>Fair Pricing:</strong> State honest expected pricing or mention negotiable terms in description.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 font-bold">✗</span>
                  <span><strong>Zero Tolerance:</strong> Prohibited items, fraudulent schemes, or duplicate spam postings are banned permanently.</span>
                </li>
              </ul>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4 text-xs text-amber-900 dark:text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <span>⚡</span>
                <span>Moderation Turnaround</span>
              </div>
              <p className="leading-relaxed">
                Advertisements are reviewed within 24 hours. Once approved, they appear across search results and category feeds.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
