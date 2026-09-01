import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  NavLink,
} from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/root";
import { getUser, logout, pingActivity, type User } from "./utils/auth";
import "./style.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;700;800&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    setCurrentUser(getUser());

    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };

    const activityTimer = window.setInterval(() => {
      if (getUser()) pingActivity().then(() => setCurrentUser(getUser()));
    }, 5 * 60 * 1000);

    const handleAuthChange = () => {
      setCurrentUser(getUser());
    };

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("auth-change", handleAuthChange);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("auth-change", handleAuthChange);
      window.clearInterval(activityTimer);
    };
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* ── NAVBAR ── */}
        <nav className={`navbar ${scrolled ? "scrolled" : ""}`} id="navbar">
          <div className="container nav-inner">
            <Link to="/" className="logo" onClick={() => setMenuOpen(false)}>
              <span className="logo-icon">📌</span>
              <span>
                FreeAds<span className="logo-accent">Post</span>
              </span>
            </Link>
            <ul className={`nav-links ${menuOpen ? "open" : ""}`} id="navLinks">
              <li>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={() => setMenuOpen(false)}
                >
                  Home
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/browse"
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={() => setMenuOpen(false)}
                >
                  Browse Ads
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/post-ad"
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={() => setMenuOpen(false)}
                >
                  Post Ad
                </NavLink>
              </li>
              {currentUser ? (
                <>
                  <li style={{ display: "flex", alignItems: "center" }}>
                    <span className="nav-welcome" style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                      👋 Hi, {currentUser.name}
                    </span>
                  </li>
                  <li>
                    <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMenuOpen(false)}>
                      Dashboard
                    </NavLink>
                  </li>
                  <li style={{ display: "flex", alignItems: "center" }}>
                    <button
                      onClick={() => {
                        logout();
                        setMenuOpen(false);
                      }}
                      className="btn-link"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--muted)",
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        fontWeight: 500,
                        padding: 0,
                        fontFamily: "inherit"
                      }}
                    >
                      Logout
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <NavLink to="/register" className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMenuOpen(false)}>
                      Create Account
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/login"
                      className={({ isActive }) => (isActive ? "active" : "")}
                      onClick={() => setMenuOpen(false)}
                    >
                      Login
                    </NavLink>
                  </li>
                </>
              )}
            </ul>
            <div className="nav-actions">
              <Link to="/post-ad" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
                + Post Free Ad
              </Link>
              <button
                className="hamburger"
                id="hamburger"
                aria-label="Menu"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                &#9776;
              </button>
            </div>
          </div>
        </nav>

        {children}

        {/* ── FOOTER ── */}
        <footer className="footer">
          <div className="container footer-inner">
            <div className="footer-brand">
              <Link to="/" className="logo">
                📌 FreeAds<span className="logo-accent">Post</span>
              </Link>
              <p>The easiest way to buy, sell and connect in your community.</p>
            </div>
            <div className="footer-links">
              <h4>Quick Links</h4>
              <Link to="/">Home</Link>
              <Link to="/browse">Browse Ads</Link>
              <Link to="/post-ad">Post Ad</Link>
            </div>
            <div className="footer-links">
              <h4>Categories</h4>
              <Link to="/browse?cat=real-estate">Real Estate</Link>
              <Link to="/browse?cat=vehicles">Vehicles</Link>
              <Link to="/browse?cat=jobs">Jobs</Link>
              <Link to="/browse?cat=electronics">Electronics</Link>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 FreeAdsPost. All rights reserved.</p>
          </div>
        </footer>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
