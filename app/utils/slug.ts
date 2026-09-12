/**
 * FreeAdsPost - Safe Slug Generation Utilities
 * 
 * Rules:
 * - Lowercase
 * - Hyphen separated
 * - URL safe (alphanumeric and hyphens only)
 * - Removes unnecessary special characters
 * - Does not include private user information
 * - Disambiguates duplicate slugs with a stable suffix derived from the advertisement ID
 */

/**
 * Sanitizes a string into a URL-friendly slug component.
 */
export function sanitizeToSlug(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD') // decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // strip accent marks
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumerics with hyphen
    .replace(/^-+|-+$/g, ''); // strip leading/trailing hyphens
}

/**
 * Extracts a stable, short alphanumeric suffix from an advertisement ID.
 * Example: 'ad_938fa82k4' -> 'a82k4', 'mock_ad_demo' -> 'demo'
 */
export function getStableIdSuffix(adId: string): string {
  if (!adId || typeof adId !== 'string') return '';
  const clean = adId.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.length <= 5) return clean;
  return clean.slice(-5);
}

/**
 * Generates a base slug from an ad's title and location.
 * Example: title="Used Honda City 2019", location="Delhi" -> 'used-honda-city-2019-delhi'
 */
export function generateBaseSlug(title: string, location?: string): string {
  const cleanTitle = sanitizeToSlug(title);
  const cleanLoc = location ? sanitizeToSlug(location) : '';
  
  if (cleanTitle && cleanLoc && !cleanTitle.includes(cleanLoc)) {
    return `${cleanTitle}-${cleanLoc}`;
  }
  return cleanTitle || 'ad';
}

export interface SlugCandidate {
  ad_id: string;
  title: string;
  location?: string;
}

/**
 * Computes unique, stable slugs for an array of advertisements.
 * If two advertisements have the exact same title & location, the first maintains the clean slug
 * and subsequent matching ones receive a unique stable suffix derived from their ad_id.
 * 
 * Example:
 * /ad/used-honda-city-delhi
 * /ad/used-honda-city-delhi-a82k4
 */
export function computeAdSlugs<T extends SlugCandidate>(ads: T[]): Map<string, string> {
  const slugMap = new Map<string, string>();
  const baseCount = new Map<string, number>();

  // Pass 1: count base slug frequencies
  for (const ad of ads) {
    const base = generateBaseSlug(ad.title, ad.location);
    baseCount.set(base, (baseCount.get(base) || 0) + 1);
  }

  // Pass 2: assign slugs, adding stable suffix for duplicates
  const seenBases = new Set<string>();
  for (const ad of ads) {
    const base = generateBaseSlug(ad.title, ad.location);
    const totalCount = baseCount.get(base) || 0;

    if (totalCount <= 1) {
      slugMap.set(ad.ad_id, base);
    } else {
      if (!seenBases.has(base)) {
        // First occurrence keeps the base slug
        seenBases.add(base);
        slugMap.set(ad.ad_id, base);
      } else {
        // Duplicate: append unique stable suffix derived from ad_id
        const suffix = getStableIdSuffix(ad.ad_id);
        const uniqueSlug = `${base}-${suffix}`;
        slugMap.set(ad.ad_id, uniqueSlug);
      }
    }
  }

  return slugMap;
}

/**
 * Generates a standalone slug for a single advertisement.
 * If isDuplicate is true or disambiguateWithId is provided, attaches the stable ID suffix.
 */
export function generateAdSlug(title: string, location?: string, adId?: string, isDuplicate = false): string {
  const base = generateBaseSlug(title, location);
  if (isDuplicate && adId) {
    const suffix = getStableIdSuffix(adId);
    return `${base}-${suffix}`;
  }
  return base;
}
