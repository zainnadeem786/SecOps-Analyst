"use client";

import Link from "next/link";
import { Activity, FolderKanban, Gauge, KeyRound, Lock, RadioTower, SearchCheck, Settings2, Shield } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof SearchCheck;
  requiresAuth?: boolean;
  description: string;
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    icon: Gauge,
    description: "Operational summary and recent activity.",
  },
  {
    href: "/investigations",
    label: "Investigations",
    icon: SearchCheck,
    description: "Primary triage and investigation workspace.",
  },
  {
    href: "/cases",
    label: "Cases",
    icon: FolderKanban,
    requiresAuth: true,
    description: "Persistent investigations and session history.",
  },
  {
    href: "/live-monitor",
    label: "Live Monitor",
    icon: RadioTower,
    description: "Stream logs and monitor live detections.",
  },
  {
    href: "/executive",
    label: "Executive",
    icon: Activity,
    requiresAuth: true,
    description: "Cross-case metrics and risk trends.",
  },
  {
    href: "/rules",
    label: "Rules",
    icon: Shield,
    requiresAuth: true,
    description: "Detection tuning and threshold management.",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings2,
    requiresAuth: true,
    description: "API keys, display, and workspace defaults.",
  },
];

interface SidebarNavProps {
  pathname: string;
}

export function SidebarNav({ pathname }: SidebarNavProps) {
  const { user, isLoading } = useAuth();

  return (
    <aside className="hidden border-l border-white/8 bg-[#08111c] xl:flex xl:min-h-screen xl:flex-col">
      <div className="scrollbar-hidden sticky top-0 flex h-screen flex-col gap-5 overflow-y-auto px-4 py-4">
        <div className="rounded-[22px] border border-white/10 bg-[#0d1726] px-4 py-4 shadow-[0_12px_30px_rgba(2,6,23,0.22)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-sky-400/15 bg-sky-400/8 p-2.5 text-sky-100">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">SecOps Analyst</p>
              <p className="mt-1 text-sm font-semibold text-white">Investigation workspace</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Analyst-first workspace for log triage, campaign analysis, risk review, and response.
          </p>
        </div>

        <div className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const isLocked = item.requiresAuth && !user;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={isLocked ? "/login" : item.href}
                className={cn(
                  "group flex items-start gap-3 rounded-[20px] border px-3.5 py-3 transition",
                  isActive
                    ? "border-sky-400/20 bg-sky-400/10 text-white"
                    : "border-transparent bg-transparent text-slate-300 hover:border-white/8 hover:bg-white/[0.03] hover:text-white",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 rounded-2xl border p-2 transition",
                    isActive
                      ? "border-sky-400/20 bg-sky-400/10 text-sky-100"
                      : "border-white/8 bg-white/[0.03] text-slate-400 group-hover:text-slate-200",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    {isLocked ? (
                      <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        <Lock className="mr-1 h-3 w-3" />
                        Locked
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto rounded-[20px] border border-white/10 bg-[#0d1726] px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Workspace mode</p>
          {isLoading ? (
            <div className="mt-3 h-11 animate-pulse rounded-2xl bg-white/[0.04]" />
          ) : user ? (
            <>
              <p className="mt-3 text-sm font-medium text-white">Authenticated analyst</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Case history, sharing, rules, executive metrics, and settings are enabled.</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm font-medium text-white">Guest investigation</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Overview, Investigations, and Live Monitor remain available. Sign in for saved cases and settings.</p>
            </>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <KeyRound className="h-3.5 w-3.5" />
            API-key ingestion remains backend-compatible.
          </div>
        </div>
      </div>
    </aside>
  );
}
