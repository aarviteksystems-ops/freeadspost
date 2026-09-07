import React from "react";
import { Link } from "react-router";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "~/context/AuthContext";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading } = useAuth();

  return (
    <ProtectedRoute>
      {isLoading ? null : user?.role === "ADMIN" ? (
        children
      ) : (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Access Restricted
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mb-6">
            You do not have administrative privileges to view this page. If you believe this is an error, please contact your administrator.
          </p>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      )}
    </ProtectedRoute>
  );
}
