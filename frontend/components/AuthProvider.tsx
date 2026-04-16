"use client";

import { createContext, startTransition, useContext, useEffect, useState } from "react";

import { resetGuestIdentity } from "@/lib/guest";
import { ApiError } from "@/lib/http";
import { getCurrentUser, logoutUser } from "@/lib/platform-api";
import type { AuthenticatedUser } from "@/lib/types";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshSession() {
    try {
      const response = await getCurrentUser();
      startTransition(() => {
        setUser(response.user);
        setIsLoading(false);
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.error(error);
      }
      startTransition(() => {
        setUser(null);
        setIsLoading(false);
      });
    }
  }

  async function logout() {
    await logoutUser().catch(() => undefined);
    resetGuestIdentity();
    startTransition(() => {
      setUser(null);
      setIsLoading(false);
    });
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, refreshSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
