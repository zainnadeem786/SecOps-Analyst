"use client";

import Link from "next/link";
import { BellDot, ChevronDown, Check, Loader2, Lock, Plus, RadioTower, Search, UserCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGuestShellState } from "@/hooks/useGuestShellState";
import { listCases } from "@/lib/platform-api";
import type { CaseSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function isInvestigationRoute(pathname: string) {
  return pathname === "/investigations" || pathname.startsWith("/cases/");
}

export function CommandBar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, logout } = useAuth();
  const { isReady: isGuestReady, usageCount: guestUsageCount, activeCaseId: activeGuestCaseId } = useGuestShellState();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const caseMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearchValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!user) {
      setCases([]);
      setIsLoadingCases(false);
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
    if (!isInvestigationRoute(pathname)) {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchValue.trim();
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextUrl, { scroll: false });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [pathname, router, searchParams, searchValue]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (caseMenuRef.current && !caseMenuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isMenuOpen]);

  const isShellReady = isGuestReady && !isLoading;
  const currentCaseId = pathname.startsWith("/cases/") ? pathname.split("/")[2] ?? "" : "";
  const activeCaseLabel = useMemo(() => {
    if (currentCaseId) {
      return cases.find((item) => item.id === currentCaseId)?.name ?? "Current case";
    }
    if (pathname === "/investigations") {
      return "Active investigation";
    }
    return "No case selected";
  }, [cases, currentCaseId, pathname]);

  const caseSwitcherLabel = !isShellReady
    ? "Loading workspace"
    : user
      ? activeCaseLabel
      : activeGuestCaseId
        ? "Guest investigation active"
        : "Login to switch cases";

  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-[#07101c]/96 backdrop-blur">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:items-center">
            <div ref={caseMenuRef} className="relative hidden xl:block xl:w-[280px] xl:min-w-[280px]">
              <button
                type="button"
                disabled={!isShellReady || !user}
                onClick={() => user && isShellReady && setIsMenuOpen((current) => !current)}
                className={cn(
                  "flex h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left transition",
                  isShellReady && user
                    ? "border-white/10 bg-[#0d1726] hover:border-white/20 hover:bg-[#101c2e]"
                    : "cursor-not-allowed border-white/8 bg-[#0d1726] opacity-80",
                )}
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Case switcher</p>
                  <p className="truncate text-sm font-medium text-white">{caseSwitcherLabel}</p>
                </div>
                {!isShellReady || isLoadingCases ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>

              {isShellReady && user && isMenuOpen ? (
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1422] shadow-[0_18px_48px_rgba(2,6,23,0.36)]">
                  <div className="border-b border-white/8 px-4 py-3">
                    <p className="text-sm font-semibold text-white">Switch investigation</p>
                    <p className="mt-1 text-xs text-slate-400">Jump between saved cases or open the main investigation workspace.</p>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        router.push("/investigations");
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.04]"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">Active investigation</p>
                        <p className="mt-1 text-xs text-slate-500">Upload and triage the current incident snapshot.</p>
                      </div>
                      {pathname === "/investigations" ? <Check className="h-4 w-4 text-sky-200" /> : null}
                    </button>
                    {cases.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          router.push(`/cases/${item.id}`);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.04]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.session_count} sessions | latest risk {item.latest_risk_score}</p>
                        </div>
                        {item.id === currentCaseId ? <Check className="h-4 w-4 text-sky-200" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                disabled={!isInvestigationRoute(pathname)}
                placeholder={isInvestigationRoute(pathname) ? "Search case or session evidence: ip:203.0.113.10 status:401 endpoint:/login" : "Search is available in investigation views"}
                className="h-12 rounded-2xl border-white/10 bg-[#0d1726] pl-11 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1726] px-3 py-2 text-xs text-slate-300">
              <BellDot className="h-3.5 w-3.5 text-emerald-300" />
              {pathname === "/live-monitor" ? "Live stream console" : "Workspace ready"}
            </div>
            <Button asChild variant="secondary" className="rounded-full">
              <Link href="/investigations">
                <Plus className="h-4 w-4" />
                New investigation
              </Link>
            </Button>
            <Button asChild variant="secondary" className="rounded-full">
              <Link href="/live-monitor">
                <RadioTower className="h-4 w-4" />
                Live monitor
              </Link>
            </Button>
            {isShellReady ? (
              user ? (
                <>
                  <div className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-white/10 bg-[#0d1726] px-4 py-2 text-sm text-slate-200">
                    <UserCircle2 className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <Button variant="ghost" className="rounded-full text-slate-300 hover:text-white" onClick={() => void logout()}>
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1726] px-3 py-2 text-xs text-slate-400">
                    <Lock className="h-3.5 w-3.5" />
                    Guest mode | {Math.max(0, 3 - guestUsageCount)} analyses left
                  </div>
                  <Button asChild className="rounded-full">
                    <Link href="/login">Login</Link>
                  </Button>
                </>
              )
            ) : (
              <div className="h-11 w-[220px] animate-pulse rounded-full bg-white/[0.04]" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
