"use client";

import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Card className="glass-panel rounded-3xl border-white/10 bg-slate-950/55">
        <CardContent className="px-6 py-10 text-center text-sm text-slate-300">
          Loading your authenticated workspace...
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="glass-panel rounded-3xl border-white/10 bg-slate-950/55">
        <CardHeader>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription className="mt-2 leading-6 text-slate-300">
            This area is available only to authenticated users. Sign in to access persistent investigations, rules management, sharing, and executive reporting.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:text-white" href="/login">
            Login
          </Link>
          <Link className="rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 transition hover:border-sky-300/40" href="/register">
            Register
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
