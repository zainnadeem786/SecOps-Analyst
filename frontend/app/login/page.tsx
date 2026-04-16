"use client";

import { Suspense } from "react";
import Link from "next/link";

import { AuthFormCard } from "@/components/AuthFormCard";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_18%),radial-gradient(circle_at_right,_rgba(59,130,246,0.18),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#09101f_48%,_#030712_100%)] px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Secure access</p>
          <h1 className="mt-3 font-heading text-4xl font-semibold text-white">SOC analyst login</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Sign in to unlock persistent cases, controlled sharing, rules management, and executive reporting.
          </p>
        </div>
        <Suspense fallback={null}>
          <AuthFormCard mode="login" />
        </Suspense>
        <p className="text-center text-sm text-slate-300">
          Need an account?{" "}
          <Link className="text-sky-200 transition hover:text-white" href="/register">
            Register here
          </Link>
        </p>
      </div>
    </main>
  );
}
