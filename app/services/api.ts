/**
 * FreeAds Post - Client API Service
 * 
 * Communicates with the Google Apps Script Web App API backend.
 */

import { computeAdSlugs, generateAdSlug } from '../utils/slug';

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string | null;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: any;
  } | null;
  timestamp: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  company_name?: string;
  password: string;
}

export interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  company_name?: string;
  email_verified: boolean;
  account_status: string;
  role: string;
  membership_status: string;
  last_login?: string;
  days_inactive?: number;
  inactivity_status?: 'ACTIVE' | 'WARNING' | 'INACTIVE';
  last_active_date?: string;
  created_at: string;
  updated_at?: string;
}

let API_BASE_URL = '';
try {
  API_BASE_URL = import.meta.env.VITE_GAS_API_URL || '';
} catch {
  API_BASE_URL = '';
}

const MOCK_STORAGE_KEY_USER = 'freeadspost_mock_user';
const MOCK_STORAGE_KEY_ADS = 'freeadspost_mock_ads';
const MOCK_STORAGE_KEY_LOGGED_IN_USERS = 'freeadspost_mock_logged_in_users';

function getStoredMockLoggedInUsers(): string[] {
  if (typeof window === 'undefined') return ['usr_other_1', 'usr_other_2', 'usr_other_3', 'usr_other_4', 'usr_other_5'];
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY_LOGGED_IN_USERS);
    if (!raw) {
      const hasAuth = !!(localStorage.getItem('freeadspost_token') || localStorage.getItem('freeadspost_auth_token'));
      const initial = ['usr_other_1', 'usr_other_2', 'usr_other_3', 'usr_other_4', 'usr_other_5'];
      if (hasAuth) initial.push('usr_demo');
      localStorage.setItem(MOCK_STORAGE_KEY_LOGGED_IN_USERS, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (e) {
    return ['usr_other_1', 'usr_other_2', 'usr_other_3', 'usr_other_4', 'usr_other_5'];
  }
}

function setStoredMockLoggedInUsers(users: string[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MOCK_STORAGE_KEY_LOGGED_IN_USERS, JSON.stringify(users));
  }
}

function getInitialMockAds(): Advertisement[] {
  return [
    {
      ad_id: 'mock_ad_1',
      user_id: 'usr_other_1',
      title: 'Vintage 1974 Fender Stratocaster Sunburst',
      category: 'Services',
      description: 'All original 1974 Stratocaster with hard case and vintage strap. Excellent condition, newly set up with fresh strings.',
      image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      location: 'Mumbai, Maharashtra',
      contact_preference: 'BOTH',
      status: 'APPROVED',
      is_sponsored: true,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      ad_id: 'mock_ad_2',
      user_id: 'usr_other_2',
      title: 'Modern Full-Stack React & Node Web Development',
      category: 'Services',
      description: 'Experienced software engineer available for building custom web applications, dashboards, and automated workflows.',
      image_url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80',
      location: 'Bengaluru, Karnataka',
      contact_preference: 'EMAIL',
      status: 'APPROVED',
      is_sponsored: true,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      ad_id: 'mock_ad_3',
      user_id: 'usr_other_1',
      title: '2022 Tesla Model 3 Long Range AWD',
      category: 'Vehicles',
      description: 'Clean title, single owner, under 25k miles with full self driving computer, white interior, and dual motor AWD.',
      image_url: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=600&q=80',
      location: 'Delhi NCR',
      contact_preference: 'PHONE',
      status: 'APPROVED',
      is_sponsored: false,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      ad_id: 'mock_ad_4',
      user_id: 'usr_other_2',
      title: 'Downtown Loft Apartment with Skyline View',
      category: 'Real Estate',
      description: 'Spacious high-ceiling 1BR loft apartment in vibrant downtown area with hardwood floors, modern kitchen and parking.',
      image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=600&q=80',
      location: 'Hyderabad, Telangana',
      contact_preference: 'EMAIL',
      status: 'APPROVED',
      is_sponsored: false,
      created_at: new Date(Date.now() - 172800000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      ad_id: 'mock_ad_5',
      user_id: 'usr_other_3',
      title: 'Senior Frontend Engineer (Remote, Full-Time)',
      category: 'Jobs',
      description: 'Fast-growing tech startup seeking an exceptional Senior Frontend Engineer proficient with React, TypeScript, and modern CSS.',
      image_url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80',
      location: 'Pune, Maharashtra',
      contact_preference: 'EMAIL',
      status: 'APPROVED',
      is_sponsored: false,
      created_at: new Date(Date.now() - 259200000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      ad_id: 'mock_ad_6',
      user_id: 'usr_other_4',
      title: 'Apple MacBook Pro 16-inch M3 Max 36GB RAM',
      category: 'Electronics',
      description: 'Like-new condition space black MacBook Pro. Includes original MagSafe charger, box, and AppleCare coverage.',
      image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
      location: 'Chennai, Tamil Nadu',
      contact_preference: 'BOTH',
      status: 'APPROVED',
      is_sponsored: false,
      created_at: new Date(Date.now() - 345600000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      ad_id: 'mock_ad_7',
      user_id: 'usr_other_5',
      title: 'Custom Solid Oak Dining Table & Chairs',
      category: 'Buy & Sell',
      description: 'Handmade 8-person solid oak dining table with matching bench and four upholstered chairs. Natural satin finish.',
      image_url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=600&q=80',
      location: 'Kolkata, West Bengal',
      contact_preference: 'PHONE',
      status: 'APPROVED',
      is_sponsored: false,
      created_at: new Date(Date.now() - 432000000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      ad_id: 'mock_ad_demo',
      user_id: 'usr_demo',
      title: 'Commercial Studio Photography & Visual Branding',
      category: 'Services',
      description: 'Award-winning commercial photographer available for product shoots, brand campaigns, and architectural portfolios.',
      image_url: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=600&q=80',
      location: 'Mumbai, Maharashtra',
      contact_preference: 'BOTH',
      status: 'APPROVED',
      is_sponsored: true,
      created_at: new Date(Date.now() - 1800000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    }
  ];
}

let nodeMockAds: Advertisement[] | null = null;

export function getStoredMockAds(): Advertisement[] {
  if (typeof window === 'undefined') {
    if (!nodeMockAds) {
      nodeMockAds = getInitialMockAds();
    }
    return nodeMockAds;
  }
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY_ADS);
    if (!raw) {
      const initial = getInitialMockAds();
      localStorage.setItem(MOCK_STORAGE_KEY_ADS, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (e) {
    return getInitialMockAds();
  }
}

/**
 * Handles mock responses for local dev when VITE_GAS_API_URL is unset.
 */
function handleLocalMock<T = any>(action: string, payload: Record<string, any>, token?: string): ApiResponse<T> {
  const timestamp = new Date().toISOString();

  // 1. Auth check for protected actions
  const protectedActions = ['my-ads', 'create-ad', 'update-ad', 'hide-ad', 'resubmit-ad', 'delete-ad', 'current-user', 'dashboard-summary', 'admin/verify-status', 'admin/overview'];
  if (protectedActions.includes(action) && !token) {
    return {
      success: false,
      statusCode: 401,
      message: 'Authentication is required to perform this action.',
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Authentication is required to perform this action.' },
      timestamp
    };
  }

  // 2. Action Handlers
  if (action === 'login') {
    const email = payload.email || 'user@example.com';
    const isAdmin = email.includes('admin');
    const userId = 'usr_demo';
    
    // Mark user as logged in in mock session store
    const loggedIn = getStoredMockLoggedInUsers();
    if (!loggedIn.includes(userId)) {
      loggedIn.push(userId);
      setStoredMockLoggedInUsers(loggedIn);
    }

    const mockUser: UserProfile = {
      user_id: userId,
      name: isAdmin ? 'Admin User' : 'Demo Member',
      email: email,
      phone: '+1 555-0199',
      email_verified: true,
      account_status: 'ACTIVE',
      role: isAdmin ? 'ADMIN' : 'USER',
      membership_status: 'ACTIVE',
      last_login: timestamp,
      created_at: new Date(Date.now() - 30 * 86400000).toISOString()
    };
    return {
      success: true,
      statusCode: 200,
      message: 'Login successful.',
      data: { token: 'mock-session-token-' + Date.now(), user: mockUser } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'logout') {
    // Invalidate mock session and mark user as logged out
    const loggedIn = getStoredMockLoggedInUsers().filter(id => id !== 'usr_demo');
    setStoredMockLoggedInUsers(loggedIn);
    return {
      success: true,
      statusCode: 200,
      message: 'Logged out successfully.',
      data: null,
      error: null,
      timestamp
    };
  }

  if (action === 'register') {
    const mockUser: UserProfile = {
      user_id: 'usr_mock_reg_' + Date.now(),
      name: payload.name || 'New Member',
      email: payload.email || 'new@example.com',
      phone: payload.phone || '+1 555-0123',
      email_verified: false,
      account_status: 'PENDING_VERIFICATION',
      role: 'USER',
      membership_status: 'FREE',
      created_at: timestamp
    };
    return {
      success: true,
      statusCode: 201,
      message: 'Registration successful. A verification link has been sent to your email.',
      data: { user: mockUser } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'verify-email') {
    return {
      success: true,
      statusCode: 200,
      message: 'Email successfully verified. You may now log in.',
      data: { verified: true, email: 'verified@example.com' } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'current-user') {
    return {
      success: true,
      statusCode: 200,
      message: null,
      data: {
        user_id: 'usr_mock_1',
        name: 'Demo Member',
        email: 'user@example.com',
        phone: '+1 555-0199',
        email_verified: true,
        account_status: 'ACTIVE',
        role: 'USER',
        membership_status: 'ACTIVE',
        last_login: timestamp,
        created_at: new Date(Date.now() - 30 * 86400000).toISOString()
      } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'dashboard-summary') {
    return {
      success: true,
      statusCode: 200,
      message: null,
      data: {
        user: {
          user_id: 'usr_mock_1',
          name: 'Demo Member',
          email: 'user@example.com',
          phone: '+1 555-0199',
          email_verified: true,
          account_status: 'ACTIVE',
          role: 'USER',
          membership_status: 'ACTIVE',
          last_login: timestamp,
          created_at: new Date(Date.now() - 30 * 86400000).toISOString()
        },
        counts: { total: 3, pending: 1, approved: 2, rejected: 0 }
      } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'ads') {
    const allAds = getStoredMockAds();
    const slugMap = computeAdSlugs(allAds);
    // Approved ads are publicly browsable without requiring seller login
    let eligible = allAds.filter(a => a.status === 'APPROVED');

    // Distinct locations
    const locSet: Record<string, boolean> = {};
    eligible.forEach(a => { if (a.location) locSet[a.location.trim()] = true; });
    const locations = Object.keys(locSet).sort();

    // Filters
    const search = String(payload.search || '').trim().toLowerCase();
    const title = String(payload.title || '').trim().toLowerCase();
    const desc = String(payload.description || '').trim().toLowerCase();
    const loc = String(payload.location || '').trim().toLowerCase();
    const cat = String(payload.category || '').trim();

    if (cat && cat.toUpperCase() !== 'ALL') {
      const normCat = cat.toLowerCase().replace(/[\s/&]+/g, '-');
      eligible = eligible.filter(a => {
        const aNorm = (a.category || '').toLowerCase().replace(/[\s/&]+/g, '-');
        return aNorm === normCat || (a.category && a.category.toLowerCase() === cat.toLowerCase());
      });
    }
    if (loc && loc.toUpperCase() !== 'ALL') {
      eligible = eligible.filter(a => a.location.toLowerCase().includes(loc));
    }
    if (title) {
      eligible = eligible.filter(a => a.title.toLowerCase().includes(title));
    }
    if (desc) {
      eligible = eligible.filter(a => a.description.toLowerCase().includes(desc));
    }
    if (search) {
      eligible = eligible.filter(a =>
        a.title.toLowerCase().includes(search) ||
        a.description.toLowerCase().includes(search) ||
        a.location.toLowerCase().includes(search)
      );
    }

    // Sort
    const sort = String(payload.sort || payload.sort_by || 'sponsored_first').toLowerCase();
    eligible.sort((a, b) => {
      const aTime = new Date(a.approved_at || a.created_at || 0).getTime();
      const bTime = new Date(b.approved_at || b.created_at || 0).getTime();
      if (sort === 'oldest') return aTime - bTime;
      if (sort === 'newest') return bTime - aTime;
      if (a.is_sponsored && !b.is_sponsored) return -1;
      if (!a.is_sponsored && b.is_sponsored) return 1;
      return bTime - aTime;
    });

    // Pagination
    const page = Math.max(1, parseInt(payload.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(payload.limit, 10) || 12));
    const total = eligible.length;
    const total_pages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = eligible.slice(startIndex, startIndex + limit);
    const has_more = startIndex + limit < total;

    // Sanitize contact info based on token presence
    const hasValidAuth = Boolean(token);
    const sanitized = paginated.map(ad => {
      const clean = { ...ad };
      clean.slug = slugMap.get(clean.ad_id) || generateAdSlug(clean.title, clean.location, clean.ad_id);
      const pref = (clean.contact_preference || 'EMAIL').toUpperCase();
      const sellerName = clean.user_id === 'usr_demo' ? 'Demo Member' : 'Verified Seller';
      clean.seller = { name: sellerName };
      clean.contact_available = true;
      clean.contact_locked = !hasValidAuth;

      if (hasValidAuth) {
        clean.contact = { preference: pref };
        if (pref === 'PHONE' || pref === 'BOTH') {
          clean.seller.phone = '+91 98765 43210';
          clean.contact.phone = '+91 98765 43210';
        }
        if (pref === 'EMAIL' || pref === 'BOTH') {
          clean.seller.email = 'seller@example.com';
          clean.contact.email = 'seller@example.com';
        }
      } else {
        delete clean.seller.phone;
        delete clean.seller.email;
        delete (clean.seller as any).whatsapp;
        delete clean.contact;
        delete clean.user_id;
        delete (clean as any).user_email;
        delete (clean as any).user_phone;
        delete clean.rejection_reason;
        delete (clean as any).token;
        delete (clean as any).password_hash;
        delete (clean as any).session_id;
      }
      return clean;
    });

    return {
      success: true,
      statusCode: 200,
      message: null,
      data: {
        ads: sanitized,
        total,
        page,
        limit,
        total_pages,
        has_more,
        locations
      } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'ad') {
    const allAds = getStoredMockAds();
    const slugMap = computeAdSlugs(allAds);
    const identifier = String(payload.slug || payload.ad_id || payload.id || '').trim();

    const rawAd = allAds.find(a => 
      a.ad_id === identifier || 
      (slugMap.get(a.ad_id) === identifier) || 
      a.slug === identifier
    );
    if (!rawAd) {
      return {
        success: false,
        statusCode: 404,
        message: 'Advertisement not found.',
        data: null,
        error: { code: 'NOT_FOUND', message: 'Advertisement not found.' },
        timestamp
      };
    }

    const isOwner = token && (rawAd.user_id === 'usr_demo');
    const isAdmin = token && token.includes('admin');

    // Dynamic visibility check: must be APPROVED for visitors; unapproved only visible to owner/admin
    if (rawAd.status !== 'APPROVED') {
      if (!isOwner && !isAdmin) {
        return {
          success: false,
          statusCode: 404,
          message: 'Advertisement not found.',
          data: null,
          error: { code: 'NOT_FOUND', message: 'Advertisement not found.' },
          timestamp
        };
      }
    }

    const hasValidAuth = Boolean(token);
    const clean = { ...rawAd };
    clean.slug = slugMap.get(clean.ad_id) || generateAdSlug(clean.title, clean.location, clean.ad_id);
    const pref = (clean.contact_preference || 'EMAIL').toUpperCase();
    const sellerName = clean.user_id === 'usr_demo' ? 'Demo Member' : 'Verified Seller';
    clean.seller = { name: sellerName };
    clean.contact_available = true;
    clean.contact_locked = !hasValidAuth;

    if (hasValidAuth) {
      clean.contact = { preference: pref };
      if (pref === 'PHONE' || pref === 'BOTH') {
        clean.seller.phone = '+91 98765 43210';
        clean.contact.phone = '+91 98765 43210';
      }
      if (pref === 'EMAIL' || pref === 'BOTH') {
        clean.seller.email = 'seller@example.com';
        clean.contact.email = 'seller@example.com';
      }
    } else {
      delete clean.seller.phone;
      delete clean.seller.email;
      delete (clean.seller as any).whatsapp;
      delete clean.contact;
      delete clean.user_id;
      delete (clean as any).user_email;
      delete (clean as any).user_phone;
      delete clean.rejection_reason;
      delete (clean as any).token;
      delete (clean as any).password_hash;
      delete (clean as any).session_id;
    }

    return {
      success: true,
      statusCode: 200,
      message: null,
      data: { ad: clean } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'my-ads') {
    const allAds = getStoredMockAds();
    const myAds = allAds.filter(a => a.user_id === 'usr_demo');
    return {
      success: true,
      statusCode: 200,
      message: null,
      data: { ads: myAds, total: myAds.length } as any,
      error: null,
      timestamp
    };
  }

    if (action === 'create-ad') {
    const newAd: Advertisement = {
      ad_id: 'mock_ad_' + Date.now(),
      user_id: 'usr_demo',
      title: payload.title,
      category: payload.category,
      description: payload.description,
      location: payload.location,
      contact_preference: payload.contact_preference,
      image_url: payload.image_url || '',
      status: 'PENDING',
      is_sponsored: false,
      created_at: timestamp,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    };
    const current = getStoredMockAds();
    current.unshift(newAd);
    if (typeof window !== 'undefined') {
      localStorage.setItem(MOCK_STORAGE_KEY_ADS, JSON.stringify(current));
    }
    return {
      success: true,
      statusCode: 201,
      message: 'Your advertisement has been submitted and is awaiting admin approval.',
      data: { ad: newAd } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'membership/plans') {
    return {
      success: true,
      statusCode: 200,
      message: null,
      data: {
        plans: [
          {
            plan_id: 'FREE',
            name: 'Free Membership',
            price: 0,
            currency: 'USD',
            interval: 'lifetime',
            duration_days: 0,
            is_sponsored_eligible: false,
            description: 'Standard free membership for all registered users.',
            features: [
              'Submit classified ads for moderation',
              'Browse all approved member advertisements',
              'Manage your ads from user dashboard',
              'Basic standard ad visibility'
            ]
          },
          {
            plan_id: 'PREMIUM_MONTHLY',
            name: 'Premium Monthly',
            price: 19.99,
            currency: 'USD',
            interval: 'month',
            duration_days: 30,
            is_sponsored_eligible: true,
            description: 'Monthly premium tier unlocking priority sponsored ad placements.',
            features: [
              'All Free Membership benefits',
              'Eligible for priority SPONSORED placement',
              'Featured at the top of category & search feeds',
              'Prominent SPONSORED badge for higher trust',
              '30-day active duration with auto-expiry'
            ]
          },
          {
            plan_id: 'PREMIUM_YEARLY',
            name: 'Premium Yearly',
            price: 199.99,
            currency: 'USD',
            interval: 'year',
            duration_days: 365,
            is_sponsored_eligible: true,
            description: 'Full-year premium status with maximum exposure and 2 months savings.',
            features: [
              'All Premium Monthly benefits',
              'Year-round SPONSORED placement eligibility',
              'Best overall value ($16.66/month equivalent)',
              'Priority administrative support',
              '365-day active duration with auto-expiry'
            ]
          }
        ]
      } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'membership') {
    const mockMem: AdminMembershipItem = {
      membership_id: 'mem_mock_1',
      user_id: 'usr_demo',
      plan: 'PREMIUM_MONTHLY',
      amount: 19.99,
      currency: 'USD',
      payment_id: '',
      payment_provider: '',
      start_date: new Date(Date.now() - 5 * 86400000).toISOString(),
      expiry_date: new Date(Date.now() + 25 * 86400000).toISOString(),
      status: 'ACTIVE',
      created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    };
    return {
      success: true,
      statusCode: 200,
      message: null,
      data: {
        membership: mockMem,
        plan: 'PREMIUM_MONTHLY',
        status: 'ACTIVE',
        is_eligible_for_sponsorship: true
      } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'membership/cancel') {
    return {
      success: true,
      statusCode: 200,
      message: 'Membership has been cancelled.',
      data: {
        membership: {
          membership_id: payload.membership_id || 'mem_mock_1',
          user_id: 'usr_demo',
          plan: 'PREMIUM_MONTHLY',
          amount: 19.99,
          currency: 'USD',
          payment_id: '',
          payment_provider: '',
          start_date: new Date(Date.now() - 5 * 86400000).toISOString(),
          expiry_date: new Date().toISOString(),
          status: 'CANCELLED',
          created_at: new Date(Date.now() - 5 * 86400000).toISOString()
        }
      } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'admin/sponsor-ad') {
    const allAds = getStoredMockAds();
    const ad = allAds.find(a => a.ad_id === payload.ad_id);
    if (!ad) {
      return {
        success: false,
        statusCode: 404,
        message: 'Advertisement not found.',
        data: null,
        error: { code: 'NOT_FOUND', message: 'Advertisement not found.' },
        timestamp
      };
    }
    ad.is_sponsored = true;
    ad.sponsored_until = new Date(Date.now() + (payload.duration_days || 7) * 86400000).toISOString();
    if (typeof window !== 'undefined') {
      localStorage.setItem(MOCK_STORAGE_KEY_ADS, JSON.stringify(allAds));
    }
    return {
      success: true,
      statusCode: 200,
      message: 'Advertisement has been granted sponsored priority placement.',
      data: { ad } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'admin/revoke-sponsor-ad') {
    const allAds = getStoredMockAds();
    const ad = allAds.find(a => a.ad_id === payload.ad_id);
    if (!ad) {
      return {
        success: false,
        statusCode: 404,
        message: 'Advertisement not found.',
        data: null,
        error: { code: 'NOT_FOUND', message: 'Advertisement not found.' },
        timestamp
      };
    }
    ad.is_sponsored = false;
    ad.sponsored_until = '';
    if (typeof window !== 'undefined') {
      localStorage.setItem(MOCK_STORAGE_KEY_ADS, JSON.stringify(allAds));
    }
    return {
      success: true,
      statusCode: 200,
      message: 'Advertisement sponsorship has been revoked.',
      data: { ad } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'reactivate-ad' || action === 'ad/reactivate') {
    const allAds = getStoredMockAds();
    const ad = allAds.find(a => a.ad_id === payload.ad_id);
    if (!ad) {
      return {
        success: false,
        statusCode: 404,
        message: 'Advertisement not found.',
        data: null,
        error: { code: 'NOT_FOUND', message: 'Advertisement not found.' },
        timestamp
      };
    }
    if (ad.status !== 'HIDDEN') {
      return {
        success: false,
        statusCode: 400,
        message: `Only HIDDEN advertisements can be reactivated. Current status is '${ad.status}'.`,
        data: null,
        error: { code: 'INVALID_STATE', message: 'Only HIDDEN advertisements can be reactivated.' },
        timestamp
      };
    }
    ad.status = 'PENDING';
    ad.updated_at = timestamp;
    if (typeof window !== 'undefined') {
      localStorage.setItem(MOCK_STORAGE_KEY_ADS, JSON.stringify(allAds));
    }
    return {
      success: true,
      statusCode: 200,
      message: 'Advertisement reactivation requested. An administrator will review and approve your listing.',
      data: { ad } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'admin/process-inactivity') {
    return {
      success: true,
      statusCode: 200,
      message: 'Inactivity evaluation completed.',
      data: {
        timestamp,
        thresholds: { warning_days: 60, hide_days: 90 },
        total_users: 12,
        active_users: 10,
        warning_users: 1,
        inactive_users: 1,
        warnings_sent: 1,
        ads_hidden: 1
      } as any,
      error: null,
      timestamp
    };
  }

  if (action === 'admin/inactive-users') {
    const mockUsers: UserProfile[] = [
      {
        user_id: 'usr_mock_inact_1',
        name: 'Dormant Seller',
        email: 'dormant@example.com',
        phone: '+1 555-444-3322',
        email_verified: true,
        account_status: 'ACTIVE',
        role: 'USER',
        membership_status: 'FREE',
        last_login: new Date(Date.now() - 95 * 86400000).toISOString(),
        days_inactive: 95,
        inactivity_status: 'INACTIVE',
        last_active_date: new Date(Date.now() - 95 * 86400000).toISOString(),
        created_at: new Date(Date.now() - 120 * 86400000).toISOString()
      },
      {
        user_id: 'usr_mock_warn_1',
        name: 'Warning Seller',
        email: 'warning@example.com',
        phone: '+1 555-444-3311',
        email_verified: true,
        account_status: 'ACTIVE',
        role: 'USER',
        membership_status: 'FREE',
        last_login: new Date(Date.now() - 65 * 86400000).toISOString(),
        days_inactive: 65,
        inactivity_status: 'WARNING',
        last_active_date: new Date(Date.now() - 65 * 86400000).toISOString(),
        created_at: new Date(Date.now() - 80 * 86400000).toISOString()
      }
    ];
    return {
      success: true,
      statusCode: 200,
      message: null,
      data: { users: mockUsers, total: mockUsers.length } as any,
      error: null,
      timestamp
    };
  }

  // Generic success fallback
  return {
    success: true,
    statusCode: 200,
    message: 'Action handled in mock mode.',
    data: {} as any,
    error: null,
    timestamp
  };
}

/**
 * Dispatches a POST request to the Google Apps Script Web App.
 */
export async function apiRequest<T = any>(action: string, payload: Record<string, any> = {}, token?: string): Promise<ApiResponse<T>> {
  // If API_BASE_URL is not configured, seamlessly handle locally via mock
  if (!API_BASE_URL) {
    return handleLocalMock<T>(action, payload, token);
  }

  const requestBody = {
    action: action,
    token: token || null,
    ...payload
  };

  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        // text/plain avoids CORS preflight OPTIONS which GAS doesn't handle natively
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    });

    const data: ApiResponse<T> = await response.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: null,
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err.message || 'Unable to connect to FreeAds Post API. Please check your internet connection.'
      },
      timestamp: new Date().toISOString()
    };
  }
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Registers a new user account.
 */
export async function registerUser(payload: RegisterPayload): Promise<ApiResponse<{ user: UserProfile; message?: string }>> {
  return apiRequest('register', payload);
}

/**
 * Verifies an account email using the one-time token.
 */
export async function verifyEmail(token: string): Promise<ApiResponse<{ verified: boolean; email: string; user?: UserProfile }>> {
  return apiRequest('verify-email', { token });
}

/**
 * Authenticates user credentials and returns session token.
 */
export async function loginUser(payload: LoginPayload): Promise<ApiResponse<{ token: string; user: UserProfile }>> {
  return apiRequest('login', payload);
}

/**
 * Invalidates current session token.
 */
export async function logoutUser(token: string): Promise<ApiResponse<null>> {
  return apiRequest('logout', {}, token);
}

export interface DashboardSummary {
  user: UserProfile;
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
}

/**
 * Fetches the currently authenticated user profile.
 */
export async function getCurrentUser(token: string): Promise<ApiResponse<UserProfile>> {
  return apiRequest('current-user', {}, token);
}

/**
 * Fetches the user dashboard summary including calculated ad counts.
 */
export async function getDashboardSummary(token: string): Promise<ApiResponse<DashboardSummary>> {
  return apiRequest('dashboard-summary', {}, token);
}

export interface CreateAdPayload {
  title: string;
  category: string;
  description: string;
  image_url?: string;
  location: string;
  contact_preference: 'EMAIL' | 'PHONE' | 'BOTH';
}

export interface SellerInfo {
  name: string;
  phone?: string;
  email?: string;
}

export interface AdContactDetails {
  preference: 'EMAIL' | 'PHONE' | 'BOTH' | string;
  phone?: string;
  email?: string;
}

export interface AdItem {
  ad_id: string;
  user_id?: string;
  title: string;
  category: string;
  description: string;
  image_url: string;
  location: string;
  price?: string | number | null;
  contact_preference: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN' | 'EXPIRED' | 'DELETED';
  rejection_reason?: string;
  is_sponsored: boolean;
  sponsored_until?: string;
  created_at: string;
  updated_at?: string;
  approved_at?: string;
  expires_at: string;
  user_name?: string;
  user_email?: string;
  seller?: SellerInfo;
  contact?: AdContactDetails;
  contact_available?: boolean;
  contact_locked?: boolean;
  slug?: string;
}

export type Advertisement = AdItem;

/**
 * Creates a new advertisement with status PENDING.
 */
export async function createAd(payload: CreateAdPayload, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('create-ad', payload, token);
}

export interface UpdateAdPayload {
  ad_id: string;
  title: string;
  category: string;
  description: string;
  image_url?: string;
  location: string;
  contact_preference: 'EMAIL' | 'PHONE' | 'BOTH';
}

/**
 * Fetches all advertisements belonging to the authenticated user.
 */
export async function getMyAds(token: string): Promise<ApiResponse<{ ads: AdItem[]; total: number }>> {
  return apiRequest('my-ads', {}, token);
}

/**
 * Updates an advertisement owned by the authenticated user, resetting status to PENDING.
 */
export async function updateAd(payload: UpdateAdPayload, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('update-ad', payload, token);
}

/**
 * Hides an APPROVED advertisement.
 */
export async function hideAd(adId: string, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('hide-ad', { ad_id: adId }, token);
}

/**
 * Resubmits a REJECTED advertisement for admin review.
 */
export async function resubmitAd(adId: string, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('resubmit-ad', { ad_id: adId }, token);
}

/**
 * Deletes an advertisement owned by the authenticated user.
 */
export async function deleteAd(adId: string, token: string): Promise<ApiResponse<{ ad_id: string; status: string; message: string }>> {
  return apiRequest('delete-ad', { ad_id: adId }, token);
}

// --- Administrator API Types & Functions ---

export interface AdminStats {
  total_users: number;
  verified_users: number;
  active_users: number;
  pending_ads: number;
  approved_ads: number;
  rejected_ads: number;
  sponsored_ads: number;
  active_memberships: number;
}

export interface AdminOverviewData {
  stats: AdminStats;
  recent_pending_ads: AdItem[];
  admin: {
    email: string;
    name: string;
  };
}

export interface AdminMembershipItem {
  membership_id: string;
  user_id: string;
  plan: string;
  amount?: number;
  currency?: string;
  payment_id?: string;
  payment_provider?: string;
  start_date: string;
  expiry_date: string;
  status: string;
  created_at: string;
}

export interface MembershipPlan {
  plan_id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  duration_days: number;
  is_sponsored_eligible: boolean;
  features: string[];
  description: string;
}

export interface AdminLogItem {
  log_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
  metadata: string;
}

export interface AdminSettingItem {
  setting: string;
  value: string;
  description: string;
}

/**
 * Checks if the current session belongs to an active administrator in the Admins sheet.
 */
export async function adminVerifyStatus(token: string): Promise<ApiResponse<{ is_admin: boolean; email: string; name: string }>> {
  return apiRequest('admin/verify-status', {}, token);
}

/**
 * Retrieves the 8 platform statistics and admin overview.
 */
export async function adminGetOverview(token: string): Promise<ApiResponse<AdminOverviewData>> {
  return apiRequest('admin/overview', {}, token);
}

/**
 * Retrieves all platform users.
 */
export async function adminGetUsers(token: string): Promise<ApiResponse<{ users: UserProfile[]; total: number }>> {
  return apiRequest('admin/users', {}, token);
}

/**
 * Retrieves platform advertisements, optionally filtered by status.
 */
export async function adminGetAds(statusFilter: string, token: string): Promise<ApiResponse<{ ads: AdItem[]; total: number; filter: string }>> {
  return apiRequest('admin/ads', { status: statusFilter }, token);
}

/**
 * Approves a PENDING advertisement.
 */
export async function adminApproveAd(adId: string, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('admin/approve-ad', { ad_id: adId }, token);
}

/**
 * Rejects a PENDING advertisement with a mandatory reason.
 */
export async function adminRejectAd(adId: string, reason: string, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('admin/reject-ad', { ad_id: adId, rejection_reason: reason }, token);
}

/**
 * Administratively deletes an advertisement.
 */
export async function adminDeleteAd(adId: string, token: string): Promise<ApiResponse<{ ad_id: string; status: string; message: string }>> {
  return apiRequest('admin/delete-ad', { ad_id: adId }, token);
}

/**
 * Retrieves all memberships.
 */
export async function adminGetMemberships(token: string): Promise<ApiResponse<{ memberships: AdminMembershipItem[]; total: number }>> {
  return apiRequest('admin/memberships', {}, token);
}

/**
 * Retrieves platform audit logs.
 */
export async function adminGetActivityLogs(limit: number = 100, token: string): Promise<ApiResponse<{ logs: AdminLogItem[]; total: number }>> {
  return apiRequest('admin/logs', { limit: limit }, token);
}

/**
 * Retrieves system settings from the Settings sheet.
 */
export async function adminGetSettings(token: string): Promise<ApiResponse<{ settings: AdminSettingItem[] }>> {
  return apiRequest('admin/settings', {}, token);
}

/**
 * Updates a system setting in the Settings sheet.
 */
export async function adminUpdateSetting(key: string, value: string, token: string): Promise<ApiResponse<{ setting: string; value: string }>> {
  return apiRequest('admin/update-setting', { setting: key, value: value }, token);
}

/**
 * Administratively edits an advertisement.
 */
export async function adminEditAd(payload: UpdateAdPayload, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('admin/edit-ad', payload, token);
}

export interface PublicAdsOptions {
  category?: string;
  location?: string;
  search?: string;
  title?: string;
  description?: string;
  sort_by?: 'sponsored_first' | 'newest' | 'oldest';
  page?: number;
  limit?: number;
}

export interface PublicAdsData {
  ads: AdItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_more: boolean;
  locations?: string[];
}

/**
 * Retrieves public advertisements for visitors and members (strictly APPROVED and non-expired).
 * Contact information is strictly protected on the server side and withheld from unverified visitors.
 */
export async function getPublicAds(options?: PublicAdsOptions, token?: string): Promise<ApiResponse<PublicAdsData>> {
  return apiRequest('ads', options || {}, token);
}

/**
 * Retrieves a single public advertisement by slug or ID.
 * Returns ad details with basic seller information.
 * Contact details (phone, email) are shielded unless authenticated and verified.
 */
export async function getPublicAd(identifier: string, token?: string): Promise<ApiResponse<{ ad: AdItem }>> {
  return apiRequest('ad', { slug: identifier, ad_id: identifier }, token);
}

export interface UserMembershipData {
  membership: AdminMembershipItem | null;
  plan: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PENDING' | string;
  is_eligible_for_sponsorship: boolean;
}

/**
 * Retrieves the current user's membership details and sponsorship eligibility.
 */
export async function getMembership(token: string): Promise<ApiResponse<UserMembershipData>> {
  return apiRequest('membership', {}, token);
}

/**
 * Cancels a user membership.
 */
export async function cancelMembership(membershipId: string, token: string): Promise<ApiResponse<{ membership: AdminMembershipItem }>> {
  return apiRequest('membership/cancel', { membership_id: membershipId }, token);
}

/**
 * Admin action: Assigns or renews a user membership.
 */
export async function adminAssignMembership(payload: { user_id: string; plan: string; duration_days?: number; status?: string }, token: string): Promise<ApiResponse<{ membership: AdminMembershipItem; message: string }>> {
  return apiRequest('admin/membership/assign', payload, token);
}

/**
 * Admin action: Assigns sponsorship priority to an approved ad owned by an eligible member.
 */
export async function adminSponsorAd(payload: { ad_id: string; duration_days?: number }, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('admin/sponsor-ad', payload, token);
}

/**
 * Admin action: Revokes sponsorship from an ad.
 */
export async function adminRevokeSponsorAd(adId: string, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('admin/revoke-sponsor-ad', { ad_id: adId }, token);
}

/**
 * Retrieves public membership plans configured in Settings.
 */
export async function getMembershipPlans(): Promise<ApiResponse<{ plans: MembershipPlan[] }>> {
  return apiRequest('membership/plans', {});
}

/**
 * Safe Reactivation Workflow: Submits a HIDDEN ad for admin review (HIDDEN -> PENDING).
 */
export async function reactivateAd(adId: string, token: string): Promise<ApiResponse<{ ad: AdItem; message: string }>> {
  return apiRequest('reactivate-ad', { ad_id: adId }, token);
}

/**
 * Admin action: Executes automated user inactivity scan and pauses approved ads of inactive users.
 */
export async function adminProcessInactivity(token: string): Promise<ApiResponse<{
  timestamp: string;
  thresholds: { warning_days: number; hide_days: number };
  total_users: number;
  active_users: number;
  warning_users: number;
  inactive_users: number;
  warnings_sent: number;
  ads_hidden: number;
}>> {
  return apiRequest('admin/process-inactivity', {}, token);
}

/**
 * Admin action: Retrieves inactive users with inactivity metrics.
 */
export async function adminGetInactiveUsers(token: string): Promise<ApiResponse<{ users: UserProfile[]; total: number }>> {
  return apiRequest('admin/inactive-users', {}, token);
}



