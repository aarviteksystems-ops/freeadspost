// ─── TYPES ────────────────────────────────────────────────────
export interface Ad {
  id: string;
  title: string;
  category: string;
  condition: string;
  description: string;
  price: string;
  priceType: string;
  city: string;
  state: string;
  phone?: string;
  email?: string;
  name?: string;
  image: string;
  images?: string[];
  postedAt: string;
  sellerId?: string;
  status?: "published" | "paused" | "sold";
  sellerAvailable?: boolean;
  seller?: { id: string; name: string; companyName?: string; phone?: string; email?: string };
}

export interface Category {
  slug: string;
  label: string;
  icon: string;
  color: string;
  desc: string;
}

import { getToken } from "./auth";

// ─── DATA LAYER (API) ─────────────────────────────────────────

export async function getAds(): Promise<Ad[]> {
  try {
    const res = await fetch("/api/ads");
    if (!res.ok) throw new Error("Failed to fetch ads");
    return await res.json();
  } catch (error) {
    console.error("Error fetching ads from server:", error);
    return [];
  }
}

export async function saveAd(ad: Omit<Ad, "id" | "postedAt">): Promise<Ad | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch("/api/ads", {
      method: "POST",
      headers,
      body: JSON.stringify(ad),
    });
    if (!res.ok) throw new Error("Failed to create ad on server");
    return await res.json();
  } catch (error) {
    console.error("Error saving ad to server:", error);
    return null;
  }
}

export async function getMyAds(): Promise<Ad[]> {
  try {
    const token = getToken();
    if (!token) return [];
    const res = await fetch("/api/my-ads", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getAdById(id: string): Promise<Ad | null> {
  try {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/ads/${id}`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Error fetching ad detail from server:", error);
    return null;
  }
}

export async function deleteAd(id: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/ads/${id}`, {
      method: "DELETE",
      headers,
    });
    return res.ok;
  } catch (error) {
    console.error("Error deleting ad from server:", error);
    return false;
  }
}

// ─── CATEGORIES CONFIG ────────────────────────────────────────
export const CATEGORIES: Category[] = [
  { slug: 'real-estate', label: 'Real Estate',  icon: '🏠', color: '#3b82f6', desc: 'Homes, Flats, Plots, PG' },
  { slug: 'vehicles',    label: 'Vehicles',      icon: '🚗', color: '#f59e0b', desc: 'Cars, Bikes, Trucks, Autos' },
  { slug: 'jobs',        label: 'Jobs',           icon: '💼', color: '#10b981', desc: 'Full-time, Part-time, Freelance' },
  { slug: 'electronics', label: 'Electronics',   icon: '📱', color: '#8b5cf6', desc: 'Phones, Laptops, TVs, Cameras' },
  { slug: 'furniture',   label: 'Furniture',     icon: '🛋️', color: '#f97316', desc: 'Sofas, Beds, Tables, Chairs' },
  { slug: 'fashion',     label: 'Fashion',       icon: '👗', color: '#ec4899', desc: 'Clothes, Shoes, Bags, Accessories' },
  { slug: 'services',    label: 'Services',      icon: '🔧', color: '#06b6d4', desc: 'Repair, Cleaning, Tutoring' },
  { slug: 'education',   label: 'Education',     icon: '📚', color: '#6366f1', desc: 'Courses, Books, Tutors' },
  { slug: 'pets',        label: 'Pets',           icon: '🐾', color: '#14b8a6', desc: 'Dogs, Cats, Birds, Accessories' },
  { slug: 'others',      label: 'Others',        icon: '📦', color: '#64748b', desc: 'Anything else' },
];
