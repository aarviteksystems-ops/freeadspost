import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "~/context/AuthContext";
import { getMembershipPlans, type MembershipPlan } from "~/services/api";

export function meta() {
  return [
    { title: "Membership Plans & Priority Placement - FreeAds Post" },
    {
      name: "description",
      content:
        "Explore Free and Premium membership plans on FreeAds Post. Learn about priority sponsored advertisement benefits, duration, and automatic expiry.",
    },
  ];
}

const DEFAULT_PLANS: MembershipPlan[] = [
  {
    plan_id: "FREE",
    name: "Standard Member",
    price: 0,
    currency: "INR",
    interval: "lifetime",
    duration_days: 0,
    is_sponsored_eligible: false,
    description: "Free access for every registered community member in India.",
    features: [
      "Submit classified ads for moderation",
      "Browse all approved member listings",
      "Manage listings from user dashboard",
      "Standard organic search placement",
      "Direct email/phone inquiries",
    ],
  },
  {
    plan_id: "PREMIUM_MONTHLY",
    name: "Growth Monthly",
    price: 499,
    currency: "INR",
    interval: "month",
    duration_days: 30,
    is_sponsored_eligible: true,
    description: "Maximum visibility with top priority sponsored ad placements for 30 days.",
    features: [
      "All Standard Member benefits",
      "Eligible for priority ★ SPONSORED placement",
      "Ranked at the top of category feeds and search",
      "Prominent amber SPONSORED badge",
      "30-day active cycle with automated expiry safeguards",
      "Priority administrative review queue",
    ],
  },
  {
    plan_id: "PREMIUM_YEARLY",
    name: "Enterprise Annual",
    price: 4999,
    currency: "INR",
    interval: "year",
    duration_days: 365,
    is_sponsored_eligible: true,
    description: "Best value for high-volume Indian dealers, agencies, and businesses.",
    features: [
      "All Growth Monthly benefits",
      "365 days of continuous priority eligibility",
      "Save ~17% compared to monthly renewal",
      "Continuous priority placement across all campaigns",
      "Dedicated account verification badge",
      "Expedited same-day administrative moderation",
    ],
  },
];

export default function MembershipPage() {
  const { isAuthenticated } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>(DEFAULT_PLANS);
  const [, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getMembershipPlans()
      .then((res) => {
        if (isMounted && res.success && res.data?.plans && res.data.plans.length > 0) {
          setPlans(res.data.plans);
        }
      })
      .catch((err) => {
        console.warn("Could not load dynamic membership plans, using defaults:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-slate-900 text-white border-b border-slate-800 py-12 sm:py-16 px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="inline-block px-3 py-1 rounded-md text-xs font-bold bg-slate-800 text-amber-400 border border-slate-700 uppercase tracking-wide">
              Transparent Membership Architecture
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Choose the Right Plan for Maximum Exposure
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Boost your classified listings with top-of-page sponsored placement, verified seller trust, and direct buyer inquiries.
            </p>
          </div>
        </section>

        {/* Development Notice */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-5">
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg p-4 shadow-sm flex items-start gap-3">
            <span className="text-xl shrink-0">ℹ️</span>
            <div className="space-y-0.5 text-xs">
              <h2 className="font-bold text-amber-950 dark:text-amber-200">
                Payment Gateway Integration in Development
              </h2>
              <p className="text-amber-900 dark:text-amber-300 leading-relaxed">
                Automated UPI and netbanking checkout are scheduled for an upcoming release. In accordance with platform integrity policies, <strong>we do not simulate or pretend payment transactions succeed</strong>. Premium tiers and sponsored placements are presently provisioned administratively.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Membership Tiers</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Select the tier that matches your advertisement frequency and sales goals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {plans.map((plan) => {
              const isPopular = plan.plan_id === "PREMIUM_MONTHLY";
              const isYearly = plan.plan_id === "PREMIUM_YEARLY";

              return (
                <div
                  key={plan.plan_id}
                  className={`relative flex flex-col rounded-lg bg-white dark:bg-slate-900 border shadow-sm ${
                    isPopular
                      ? "border-amber-500 dark:border-amber-500 ring-1 ring-amber-500/30"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded shadow-sm">
                      Most Popular
                    </div>
                  )}

                  {isYearly && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded shadow-sm">
                      Best Value — 2 Months Free
                    </div>
                  )}

                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {plan.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 min-h-[32px]">
                        {plan.description}
                      </p>
                    </div>

                    <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                          {plan.price === 0 ? "₹0" : `₹${plan.price}`}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {plan.price === 0 ? "forever" : `/${plan.interval}`}
                        </span>
                      </div>
                      <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                        {plan.duration_days > 0 ? `${plan.duration_days} days active duration` : "Lifetime standard access"}
                      </div>
                    </div>

                    <div className="space-y-2 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Included Features
                      </p>
                      <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        {plan.features?.map((feat, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-emerald-500 font-bold shrink-0">✓</span>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2">
                      {plan.price === 0 ? (
                        isAuthenticated ? (
                          <div className="text-center py-2 px-3 rounded font-semibold text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Included by Default
                          </div>
                        ) : (
                          <Link
                            to="/register"
                            className="block text-center py-2 px-3 rounded font-bold text-xs bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
                          >
                            Sign Up Free
                          </Link>
                        )
                      ) : isAuthenticated ? (
                        <div className="space-y-1 text-center">
                          <Link
                            to="/dashboard"
                            className={`block py-2 px-3 rounded font-bold text-xs transition-colors ${
                              isPopular
                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700"
                            }`}
                          >
                            Check Status on Dashboard
                          </Link>
                          <p className="text-[10px] text-slate-400">
                            Provisioned via administrative moderation
                          </p>
                        </div>
                      ) : (
                        <Link
                          to="/login"
                          className="block text-center py-2 px-3 rounded font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                        >
                          Sign In to Inquire
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Benefits Section */}
        <section className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wide">
                Why Upgrade to Sponsored?
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1">
                Priority Sponsored Listing Benefits
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-2xl">🏆</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Top Priority Placement
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  All active sponsored advertisements are ranked at the top of category feeds and keyword search results ahead of regular listings.
                </p>
              </div>

              <div className="p-5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-2xl">⭐</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Distinctive SPONSORED Badge
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Your ad card features an amber badge, highlighted outline, and premium visual treatment that captures immediate buyer interest.
                </p>
              </div>

              <div className="p-5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-2xl">📈</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Direct Buyer Inquiries
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Members browsing the authenticated ads feed give priority to verified sponsored posters, generating significantly more direct inquiries.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
