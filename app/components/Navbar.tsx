import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "~/context/AuthContext";
import { SUPPORTED_CATEGORIES } from "~/utils/categories";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate("/login");
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Desktop Nav Links */}
        <div className="flex items-center gap-6 lg:gap-8">
          <Link
            to="/"
            onClick={closeMenu}
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 flex items-center justify-center text-white font-black text-base shadow-sm">
              F
            </div>
            <div>
              <div className="text-lg font-black tracking-tight text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                FreeAds<span className="text-amber-600 dark:text-amber-500">Post</span>
              </div>
              <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider -mt-1 hidden sm:block">
                India&apos;s Verified Classifieds
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Link
              to="/"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Home
            </Link>
            <Link
              to="/#about"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              About
            </Link>
            <Link
              to="/membership"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Membership
            </Link>
            <Link
              to="/ads"
              className="hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <span>Browse Ads</span>
            </Link>

            {/* Categories Dropdown Menu */}
            <div className="relative group py-2">
              <button
                type="button"
                className="hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300"
              >
                <span>Categories</span>
                <span className="text-[10px] text-slate-400 group-hover:rotate-180 transition-transform duration-150">▼</span>
              </button>
              <div className="absolute left-0 top-full hidden group-hover:block w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-2 z-50 animate-in fade-in-50 duration-100">
                {SUPPORTED_CATEGORIES.map((cat) => (
                  <Link
                    key={cat.slug}
                    to={`/category/${cat.slug}`}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-base shrink-0">{cat.icon}</span>
                    <span className="truncate">{cat.displayName}</span>
                  </Link>
                ))}
              </div>
            </div>

            {isAuthenticated && (
              <>
                <Link
                  to="/dashboard"
                  className="hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/my-ads"
                  className="hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  My Ads
                </Link>
                {user?.role === "ADMIN" && (
                  <Link
                    to="/admin"
                    className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-200 transition-colors border border-amber-300 dark:border-amber-800"
                  >
                    Admin Portal
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-2.5 sm:gap-3">
              <Link
                to="/post-ad"
                onClick={closeMenu}
                className="text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>+</span>
                <span>Post Free Ad</span>
              </Link>
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 max-w-[150px] truncate" title={user?.email}>
                  👤 {user?.name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                onClick={closeMenu}
                className="text-xs sm:text-sm font-semibold px-3 py-2 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/post-ad"
                onClick={closeMenu}
                className="text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1"
              >
                <span>+</span>
                <span>Post Free Ad</span>
              </Link>
            </div>
          )}

          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-3 pb-5 space-y-2 shadow-lg">
          <Link
            to="/"
            onClick={closeMenu}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Home
          </Link>
          <Link
            to="/#about"
            onClick={closeMenu}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            About
          </Link>
          <Link
            to="/membership"
            onClick={closeMenu}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Membership
          </Link>
          <Link
            to="/ads"
            onClick={closeMenu}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Browse Ads
          </Link>

          {/* Mobile Category Links */}
          <div className="pt-2 pb-1 border-t border-slate-100 dark:border-slate-800">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Categories
            </div>
            <div className="grid grid-cols-2 gap-1 px-1">
              {SUPPORTED_CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/category/${cat.slug}`}
                  onClick={closeMenu}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span>{cat.icon}</span>
                  <span className="truncate">{cat.displayName}</span>
                </Link>
              ))}
            </div>
          </div>

          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                onClick={closeMenu}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Dashboard
              </Link>
              <Link
                to="/my-ads"
                onClick={closeMenu}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                My Ads
              </Link>
              {user?.role === "ADMIN" && (
                <Link
                  to="/admin"
                  onClick={closeMenu}
                  className="block px-3 py-2 rounded-lg text-sm font-medium font-mono text-amber-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Admin Portal
                </Link>
              )}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="px-3 py-1 text-xs text-slate-500 dark:text-slate-400">
                  Signed in as <strong className="text-slate-800 dark:text-slate-200">{user?.name}</strong> ({user?.email})
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left mt-2 px-3 py-2 rounded-lg text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <Link
                to="/login"
                onClick={closeMenu}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={closeMenu}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Create Free Account
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
