import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("register", "routes/register.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("login", "routes/login.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("post-ad", "routes/post-ad.tsx"),
  route("my-ads", "routes/my-ads.tsx"),
  route("ads", "routes/ads.tsx"),
  route("category/:category", "routes/category.tsx"),
  route("location/:location", "routes/location.tsx"),
  route("ad/:slug", "routes/ad-detail.tsx"),
  route("membership", "routes/membership.tsx"),
  route("admin", "routes/admin.tsx"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
] satisfies RouteConfig;
