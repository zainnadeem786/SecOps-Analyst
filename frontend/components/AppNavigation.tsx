"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Loader2, LogOut, Search, Shield, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCases } from "@/lib/platform-api";
import type { CaseSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, logout } = useAuth();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isCaseMenuOpen, setIsCaseMenuOpen] = useState(false);
  const caseMenuRef = useRef<HTMLDivElement | null>(null);
  const isInvestigationRoute = pathname === "/" || pathname.startsWith("/cases/");
  const links = user
    ? [
      { href: "/", label: "Dashboard" },
      { href: "/cases", label: "Cases" },
      { href: "/rules", label: "Rules" },
      { href: "/executive", label: "Executive" },
    ]
    : [{ href: "/", label: "Dashboard" }];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setSearchValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!user) {
      setCases([]);
      return;
    }

    let cancelled = false;
    setIsLoadingCases(true);
    void (async () => {
      try {
        const response = await listCases();
        if (!cancelled) {
          setCases(response);
        }
      } catch {
        if (!cancelled) {
          setCases([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCases(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!isInvestigationRoute) {
      return;
    }

    const timer = window.setTimeout(() => {
      const currentQuery = searchParams.get("q") ?? "";
      if (currentQuery === searchValue.trim()) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (searchValue.trim()) {
        params.set("q", searchValue.trim());
      } else {
        params.delete("q");
      }

      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextUrl, { scroll: false });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isInvestigationRoute, pathname, router, searchParams, searchValue]);

  useEffect(() => {
    setIsCaseMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isCaseMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (caseMenuRef.current && !caseMenuRef.current.contains(event.target as Node)) {
        setIsCaseMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isCaseMenuOpen]);

  const activeCaseId = pathname.startsWith("/cases/") ? pathname.split("/")[2] ?? "" : "";
  const activeCaseLabel = activeCaseId
    ? (cases.find((item) => item.id === activeCaseId)?.name ?? "Current case workspace")
    : "Quick investigation dashboard";
  const navPillClass = "rounded-full border px-4 py-2 text-sm font-medium transition";
  const showAuthenticatedUi = isMounted && !isLoading && Boolean(user);
  const visibleLinks = showAuthenticatedUi ? links : [{ href: "/", label: "Dashboard" }];

  return (
    <header className="relative z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1560px] px-4 py-3 sm:px-6 lg:px-8">
        <div className="glass-panel rounded-[26px] border border-white/10 px-4 py-3 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 2xl:max-w-[460px]">
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-2.5 text-cyan-100 shadow-[0_10px_24px_rgba(14,165,233,0.1)]">
                  <Shield className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">SecOps Analyst</p>
                  <p className="mt-1 text-sm font-semibold text-slate-50 sm:text-base">Analyst workspace</p>
                  <p className="mt-1 max-w-md text-sm leading-5 text-slate-400">Investigate suspicious activity and pivot across cases.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 2xl:min-w-[560px] 2xl:items-end">
                <nav className="flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-slate-950/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  {visibleLinks.map((link) => {
                    const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          navPillClass,
                          isActive
                            ? "border-sky-300/30 bg-gradient-to-r from-sky-500/20 to-cyan-400/10 text-sky-50 shadow-[0_8px_22px_rgba(14,165,233,0.18)]"
                            : "border-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white",
                        )}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </nav>

                <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
                  {!isMounted || isLoading ? (
                    <>
                      <div className="h-10 w-[180px] animate-pulse rounded-full border border-white/10 bg-white/[0.03]" />
                      <div className="h-10 w-[118px] animate-pulse rounded-full border border-white/10 bg-white/[0.03]" />
                    </>
                  ) : showAuthenticatedUi ? (
                    <>
                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200">
                        <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
                        <span className="block max-w-[220px] truncate">{user.email}</span>
                      </div>
                      <Button variant="secondary" className="rounded-full px-4" onClick={() => void logout()}>
                        <LogOut className="h-4 w-4" />
                        Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className={cn(
                          navPillClass,
                          pathname === "/login"
                            ? "border-sky-300/30 bg-gradient-to-r from-sky-500/20 to-cyan-400/10 text-sky-50"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white",
                        )}
                      >
                        Login
                      </Link>
                      <Link
                        href="/register"
                        className={cn(
                          navPillClass,
                          pathname === "/register"
                            ? "border-sky-300/30 bg-gradient-to-r from-sky-500/20 to-cyan-400/10 text-sky-50"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white",
                        )}
                      >
                        Register
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Global search</p>
                    <p className="mt-1 text-sm text-slate-400">Filter evidence with structured pivots for IPs, status codes, and endpoints.</p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium",
                      isInvestigationRoute
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                        : "border-white/10 bg-white/[0.04] text-slate-400",
                    )}
                  >
                    {isInvestigationRoute ? "Investigation search active" : "Available in investigation views"}
                  </span>
                </div>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    disabled={!isInvestigationRoute}
                    placeholder={isInvestigationRoute ? "Search: ip:203.0.113.10 status:401 endpoint:/login" : "Search is enabled in investigation views"}
                    className="h-12 rounded-2xl border-white/10 bg-slate-950/45 pl-11 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Case switcher</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {showAuthenticatedUi
                        ? "Move between investigations from one command-style workspace."
                        : "Sign in to unlock persistent case switching and saved investigation history."}
                    </p>
                  </div>
                  {showAuthenticatedUi && isLoadingCases ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-400" /> : null}
                </div>

                {!isMounted || isLoading ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3">
                    <div className="h-4 w-28 animate-pulse rounded-full bg-white/[0.06]" />
                    <div className="mt-3 h-5 w-52 animate-pulse rounded-full bg-white/[0.08]" />
                  </div>
                ) : showAuthenticatedUi ? (
                  <div ref={caseMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCaseMenuOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-2.5 text-left transition hover:border-white/20 hover:bg-slate-950/70"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Workflow className="h-4 w-4 shrink-0 text-cyan-100" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Active workspace</p>
                          <p className="truncate text-sm font-semibold text-slate-100">{activeCaseLabel}</p>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                          isCaseMenuOpen ? "rotate-180 text-slate-200" : "",
                        )}
                      />
                    </button>

                    {isCaseMenuOpen ? (
                      <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/96 shadow-[0_24px_60px_rgba(2,6,23,0.55)] sm:left-auto sm:right-0 sm:w-[340px]">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-100">Switch investigation</p>
                          <p className="mt-1 text-xs text-slate-400">Choose a case or jump back to the quick investigation dashboard.</p>
                        </div>
                        <div className="max-h-[320px] overflow-y-auto p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCaseMenuOpen(false);
                              router.push("/");
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-100">Quick investigation dashboard</p>
                              <p className="mt-1 text-xs text-slate-500">Upload and analyze a fresh incident snapshot.</p>
                            </div>
                            {!activeCaseId ? <Check className="h-4 w-4 shrink-0 text-cyan-200" /> : null}
                          </button>

                          {cases.length ? (
                            cases.map((item) => {
                              const isActive = item.id === activeCaseId;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setIsCaseMenuOpen(false);
                                    router.push(`/cases/${item.id}`);
                                  }}
                                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-100">{item.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.session_count} session{item.session_count === 1 ? "" : "s"} | latest risk {item.latest_risk_score}
                                    </p>
                                  </div>
                                  {isActive ? <Check className="h-4 w-4 shrink-0 text-cyan-200" /> : null}
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-4 text-sm text-slate-400">No saved cases yet. Upload an investigation to create one.</div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Workflow className="h-4 w-4 shrink-0 text-slate-300" />
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Guest workspace</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          Quick analysis is available now. Persistent case switching appears after login.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
