import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  const robotsTxt = `# FreeAdsPost robots.txt
# https://freeadspost.vercel.app/

User-agent: *
Allow: /
Allow: /ads
Allow: /category/
Allow: /location/
Allow: /ad/
Allow: /membership

# Disallow private user accounts, posting, authentication, and moderation areas
Disallow: /admin
Disallow: /admin/
Disallow: /dashboard
Disallow: /dashboard/
Disallow: /my-ads
Disallow: /my-ads/
Disallow: /post-ad
Disallow: /post-ad/
Disallow: /login
Disallow: /register
Disallow: /verify-email

# Prevent crawling of internal dynamic filter/search query permutations
Disallow: /*?*search=
Disallow: /*?*sort=

# Reference to the dynamic XML sitemap
Sitemap: https://freeadspost.vercel.app/sitemap.xml
`;

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
