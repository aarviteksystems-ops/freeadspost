import { Link } from "react-router";
import type { AdItem } from "~/services/api";

interface AdCardProps {
  ad: AdItem;
  onSelect?: (ad: AdItem) => void;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Recently";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

export function AdCard({ ad, onSelect }: AdCardProps) {
  return (
    <article
      className={`group relative bg-white dark:bg-slate-900 border rounded-lg overflow-hidden transition-shadow duration-150 flex flex-col justify-between hover:shadow-md ${
        ad.is_sponsored
          ? "border-amber-400 dark:border-amber-700/80 ring-1 ring-amber-400/40"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      {/* Top Media / Thumbnail Section */}
      <div className="relative bg-slate-100 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 h-44 overflow-hidden flex items-center justify-center">
        {/* Sponsored Banner Tag Overlay */}
        {ad.is_sponsored && (
          <div className="absolute top-2 left-2 z-10">
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-500 text-slate-950 uppercase tracking-wider shadow-sm">
              <span>★</span>
              <span>SPONSORED</span>
            </span>
          </div>
        )}

        {/* Category Pill Overlay */}
        <div className="absolute top-2 right-2 z-10">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900/80 text-white backdrop-blur-xs">
            {ad.category}
          </span>
        </div>

        {ad.image_url ? (
          <img
            src={ad.image_url}
            alt={ad.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
              const parent = (e.target as HTMLElement).parentElement;
              if (parent) {
                const placeholder = document.createElement("div");
                placeholder.className = "flex flex-col items-center justify-center text-slate-400 text-xs py-8";
                placeholder.innerHTML = "<span class='text-2xl mb-1'>🏷️</span><span>Verified Listing</span>";
                parent.appendChild(placeholder);
              }
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 select-none">
            <span className="text-3xl mb-1">📢</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Classified Notice</span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          {/* Ad Title */}
          <h3
            className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors"
            title={ad.title}
          >
            <Link to={`/ad/${ad.ad_id}`} className="hover:underline">
              {ad.title}
            </Link>
          </h3>

          {/* Description Snippet */}
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
            {ad.description}
          </p>
        </div>

        {/* Location, Date, and Contact Preference */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 font-medium truncate max-w-[170px]" title={ad.location}>
              <span className="text-slate-400">📍</span>
              <span className="truncate">{ad.location}</span>
            </span>
            <span className="text-[11px] shrink-0 text-slate-400">
              {formatDate(ad.approved_at || ad.created_at)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Contact: <span className="text-slate-700 dark:text-slate-300 uppercase font-bold">{ad.contact_preference}</span>
            </span>

            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(ad)}
                className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                <span>Details</span>
                <span>→</span>
              </button>
            ) : (
              <Link
                to={`/ad/${ad.ad_id}`}
                className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                <span>Details</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
