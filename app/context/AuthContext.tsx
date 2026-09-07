import React, { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser, loginUser, logoutUser, type UserProfile } from "~/services/api";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; code?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = "freeadspost_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session from localStorage on mount
  useEffect(() => {
    async function initAuth() {
      if (typeof window === "undefined") {
        setIsLoading(false);
        return;
      }

      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await getCurrentUser(storedToken);
        if (res.success && res.data) {
          setUser(res.data);
          setToken(storedToken);
        } else {
          // Token is invalid or expired
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setUser(null);
          setToken(null);
        }
      } catch (e) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  // Listen for cross-tab storage changes (e.g. logout or login in another tab)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) {
        if (!e.newValue) {
          // Token was removed in another tab -> sync logout immediately
          setToken(null);
          setUser(null);
        } else if (e.newValue !== token) {
          // Token was updated in another tab -> re-fetch current user
          const newTokenVal = e.newValue;
          setToken(newTokenVal);
          getCurrentUser(newTokenVal)
            .then((res) => {
              if (res.success && res.data) {
                setUser(res.data);
              } else {
                localStorage.removeItem(TOKEN_STORAGE_KEY);
                setToken(null);
                setUser(null);
              }
            })
            .catch(() => {
              localStorage.removeItem(TOKEN_STORAGE_KEY);
              setToken(null);
              setUser(null);
            });
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const res = await loginUser({ email, password });
      if (res.success && res.data) {
        const newToken = res.data.token;
        const loggedInUser = res.data.user;

        localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
        setToken(newToken);
        setUser(loggedInUser);
        return { success: true };
      }

      return {
        success: false,
        error: res.error?.message || "Invalid credentials.",
        code: res.error?.code || "INVALID_CREDENTIALS"
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "An unexpected error occurred during login.",
        code: "NETWORK_ERROR"
      };
    }
  };

  const logout = async () => {
    if (token) {
      try {
        await logoutUser(token);
      } catch (e) {
        // Continue clearing local state even if network call fails
      }
    }

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  const refreshSession = async () => {
    if (!token) return;
    try {
      const res = await getCurrentUser(token);
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        await logout();
      }
    } catch (e) {
      // Ignore transient errors
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
