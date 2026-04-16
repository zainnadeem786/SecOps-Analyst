"use client";

import { Suspense } from "react";
import Link from "next/link";

import { AuthFormCard } from "@/components/AuthFormCard";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_18%),radial-gradient(circle_at_right,_rgba(59,130,246,0.18),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#09101f_48%,_#030712_100%)] px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Create workspace</p>
          <h1 className="mt-3 font-heading text-4xl font-semibold text-white">Register your SOC account</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Create a secure account to keep isolated investigations, share cases safely, and continue any guest work you already started.
          </p>
        </div>
        <Suspense fallback={null}>
          <AuthFormCard mode="register" />
        </Suspense>
        <p className="text-center text-sm text-slate-300">
          Already have an account?{" "}
          <Link className="text-sky-200 transition hover:text-white" href="/login">
            Login here
          </Link>
        </p>
      </div>
    </main>
  );
}
