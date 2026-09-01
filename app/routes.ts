import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("browse", "routes/browse.tsx"),
  route("post-ad", "routes/post-ad.tsx"),
  route("ad-detail", "routes/ad-detail.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
] satisfies RouteConfig;
