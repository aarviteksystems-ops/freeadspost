export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  companyName?: string;
  availabilityStatus?: "available" | "away";
  lastActiveAt?: string | null;
}

const TOKEN_KEY = "freeadspost_auth_token";
const USER_KEY = "freeadspost_auth_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function setUser(user: User): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event("auth-change"));
  }
}

export async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || "Login failed" };

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    window.dispatchEvent(new Event("auth-change"));
    return { success: true };
  } catch {
    return { success: false, error: "Network error, please try again." };
  }
}

export async function register(payload: {
  name: string;
  email: string;
  phone: string;
  companyName?: string;
  password: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || "Registration failed" };

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    window.dispatchEvent(new Event("auth-change"));
    return { success: true };
  } catch {
    return { success: false, error: "Network error, please try again." };
  }
}

export async function pingActivity(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch("/api/activity", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) setUser(data.user);
    }
  } catch {
    // Availability is best-effort; don't interrupt the seller.
  }
}

export async function setAvailability(available: boolean): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/availability", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ available }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.user) setUser(data.user);
    return true;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch("/api/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Continue local logout even if the API is unavailable.
    }
  }
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("auth-change"));
}
