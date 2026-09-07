import { useState } from "react";
import { Link } from "react-router";
import { registerUser } from "~/services/api";

export function meta() {
  return [
    { title: "Create Free Account - FreeAds Post" },
    { name: "description", content: "Create an account on FreeAds Post - India's Free Classifieds" },
  ];
}

export default function RegisterRoute() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company_name: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Full name is required";
    } else if (formData.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      errors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    if (!formData.phone.trim()) {
      errors.phone = "Phone number is required";
    } else {
      const digits = formData.phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        errors.phone = "Please enter a valid phone number (7-15 digits)";
      }
    }

    if (!formData.password) {
      errors.password = "Password is required";
    } else if (formData.password.length < 8) {
      errors.password = "Password must be at least 8 characters long";
    } else if (!/[A-Za-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      errors.password = "Password must contain at least one letter and one number";
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerUser({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        company_name: formData.company_name.trim() || undefined,
        password: formData.password,
      });

      if (res.success) {
        setRegisteredEmail(formData.email.trim());
      } else {
        setError(res.error?.message || "Registration failed. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success Confirmation Screen
  if (registeredEmail) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl">
            ✉️
          </div>

          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Verify Your Email
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
            We have sent an activation link to <strong className="text-slate-900 dark:text-white">{registeredEmail}</strong>.
            Please click the link in your email to activate your account.
          </p>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded p-3 text-xs text-amber-900 dark:text-amber-300 text-left">
            <strong>Important:</strong> The verification token is valid for 24 hours. Ads and platform features are accessible once verified.
          </div>

          <div className="space-y-2 pt-2">
            <Link
              to="/login"
              className="block w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-xs sm:text-sm transition-colors shadow-sm"
            >
              Go to Sign In
            </Link>
            <button
              type="button"
              onClick={() => {
                setRegisteredEmail(null);
                setFormData({
                  name: "",
                  email: "",
                  phone: "",
                  company_name: "",
                  password: "",
                  confirmPassword: "",
                });
              }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
            >
              Register another account
            </button>
          </div>
        </div>
      </main>
    );
  }

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
          Create Your Free Member Account
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Already registered?{" "}
          <Link to="/login" className="font-bold text-blue-700 dark:text-blue-400 hover:underline">
            Sign in here
          </Link>
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-6 px-5 sm:px-8 shadow-sm rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded p-3 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200">
              <span className="text-sm shrink-0">⚠️</span>
              <div>{error}</div>
            </div>
          )}

          <form className="space-y-3.5" onSubmit={handleSubmit} noValidate>
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Rajesh Kumar"
                className={`w-full px-3 py-2 rounded border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                  fieldErrors.name
                    ? "border-rose-500 focus:ring-rose-400"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="rajesh@example.com"
                className={`w-full px-3 py-2 rounded border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                  fieldErrors.email
                    ? "border-rose-500 focus:ring-rose-400"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.email}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+91 98765 43210"
                className={`w-full px-3 py-2 rounded border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                  fieldErrors.phone
                    ? "border-rose-500 focus:ring-rose-400"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
              {fieldErrors.phone && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.phone}</p>
              )}
            </div>

            {/* Company Name (Optional) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Business / Company <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                placeholder="e.g., Kumar Auto Services"
                className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  Password <span className="text-rose-500">*</span>
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
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className={`w-full px-3 py-2 rounded border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                  fieldErrors.password
                    ? "border-rose-500 focus:ring-rose-400"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
              {fieldErrors.password ? (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.password}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Minimum 8 characters with at least one letter and one number
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className={`w-full px-3 py-2 rounded border text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                  fieldErrors.confirmPassword
                    ? "border-rose-500 focus:ring-rose-400"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2.5 px-4 rounded shadow-sm text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Creating account...</span>
                  </span>
                ) : (
                  "Create Free Account"
                )}
              </button>
            </div>
          </form>

          {/* Privacy Note */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center">
            By registering, you agree to FreeAds Post&apos;s community guidelines and verified trading policies.
          </div>
        </div>
      </div>
    </main>
  );
}
