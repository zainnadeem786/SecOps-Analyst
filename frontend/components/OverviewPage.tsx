"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, FolderKanban, Globe2, Lock, RadioTower, SearchCheck, Shield, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { PanelSection } from "@/components/PanelSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGuestShellState } from "@/hooks/useGuestShellState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveGuestCaseId, setActiveGuestCaseId } from "@/lib/guest";
import { getCaseDetail, listCases } from "@/lib/platform-api";
import type { CaseDetail, CaseSummary } from "@/lib/types";
import { formatTimestamp, riskTone } from "@/lib/utils";

type Shortcut = {
  href: string;
  label: string;
  description: string;
  icon: typeof SearchCheck;
  locked?: boolean;
};

export function OverviewPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isReady: isGuestReady, usageCount: guestUsageCount } = useGuestShellState();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [activeGuestCase, setActiveGuestCase] = useState<CaseDetail | null>(null);
  const [isLoadingCases, setIsLoadingCases] = useState(true);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let cancelled = false;

    if (user) {
      void (async () => {
        try {
          const response = await listCases();
          if (!cancelled) {
            setCases(response);
            setActiveGuestCase(null);
          }
        } catch (error) {
          if (!cancelled) {
            toast.error("Recent investigations could not be loaded", {
              description: error instanceof Error ? error.message : "Unexpected backend response.",
            });
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
    }

    const guestCaseId = getActiveGuestCaseId();
    if (!guestCaseId) {
      setCases([]);
      setActiveGuestCase(null);
      setIsLoadingCases(false);
      return;
    }

    void (async () => {
      try {
        const detail = await getCaseDetail(guestCaseId);
        if (!cancelled) {
          setActiveGuestCase(detail);
        }
      } catch {
        if (!cancelled) {
          setActiveGuestCase(null);
          setActiveGuestCaseId(null);
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
  }, [isAuthLoading, user]);

  const guestRemaining = Math.max(0, 3 - guestUsageCount);
  const sessionTotal = useMemo(() => cases.reduce((total, item) => total + item.session_count, 0), [cases]);
  const highestRisk = useMemo(() => cases.reduce((highest, item) => Math.max(highest, item.latest_risk_score), 0), [cases]);
  const repeatedAttackerCases = useMemo(() => cases.reduce((total, item) => total + item.repeated_attacker_count, 0), [cases]);
  const currentGuestRisk = activeGuestCase?.sessions.at(-1)?.risk_score ?? 0;

  const shortcuts: Shortcut[] = [
    {
      href: "/investigations",
      label: "Investigations",
      description: "Upload logs, triage detections, and drive the active SOC workflow.",
      icon: SearchCheck,
    },
    {
      href: "/live-monitor",
      label: "Live Monitor",
      description: "Stream events over WebSocket and inspect live detections in-session.",
      icon: RadioTower,
    },
    {
      href: "/cases",
      label: "Cases",
      description: "Review saved investigations, recent sessions, and repeat attackers.",
      icon: FolderKanban,
      locked: !user,
    },
    {
      href: "/executive",
      label: "Executive",
      description: "Cross-case risk, trend, and attacker-country metrics for stakeholders.",
      icon: Activity,
      locked: !user,
    },
    {
      href: "/rules",
      label: "Rules",
      description: "Tune thresholds, signatures, and correlation windows without backend edits.",
      icon: Shield,
      locked: !user,
    },
  ];

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        eyebrow="Overview"
        title="SOC investigation command center"
        description="A compact analyst overview for access mode, current investigation posture, and the fastest route into detections, live monitoring, saved cases, and executive reporting."
        actions={(
          <>
            <Badge variant={user ? "success" : "secondary"}>{user ? "Authenticated analyst" : "Guest mode"}</Badge>
            {!user ? <Badge variant="outline">{isGuestReady ? `${guestRemaining} guest analyses remaining` : "Loading guest quota"}</Badge> : null}
            <Button asChild>
              <Link href="/investigations">Open investigations</Link>
            </Button>
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricTile
          label={user ? "Persistent cases" : "Guest access"}
          value={user ? String(cases.length) : isGuestReady ? `${guestRemaining}/3` : "—"}
          note={user ? "Saved investigations" : isGuestReady ? "Analyses remaining" : "Loading quota"}
          icon={ShieldCheck}
        />
        <MetricTile
          label={user ? "Tracked sessions" : "Active guest case"}
          value={user ? String(sessionTotal) : activeGuestCase ? String(activeGuestCase.sessions.length) : "0"}
          note={user ? "Uploads and live sessions" : activeGuestCase?.name ?? "No active case"}
          icon={FolderKanban}
        />
        <MetricTile
          label="Highest risk"
          value={user ? String(highestRisk) : String(currentGuestRisk)}
          note={user ? "Latest case snapshot" : "Current guest snapshot"}
          icon={TrendingUp}
          tone={riskTone((user ? highestRisk : currentGuestRisk) > 70 ? "High" : (user ? highestRisk : currentGuestRisk) > 30 ? "Medium" : "Low")}
        />
        <MetricTile
          label="Geo coverage"
          value={user ? String(repeatedAttackerCases) : String(activeGuestCase?.repeated_attackers.length ?? 0)}
          note={user ? "Repeat-attacker appearances" : "Repeat attacker sources"}
          icon={Globe2}
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <PanelSection
          title="Workspace entry points"
          description="Move directly into the workspace best suited for triage, persistence, monitoring, or executive review."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.locked ? "/login" : shortcut.href}
                className="rounded-[20px] border border-white/8 bg-[#0f1828] px-5 py-5 transition hover:border-white/15 hover:bg-[#111c2d]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="rounded-2xl border border-white/8 bg-[#0b1422] p-3 text-sky-100">
                    <shortcut.icon className="h-5 w-5" />
                  </div>
                  {shortcut.locked ? (
                    <Badge variant="outline" className="border-white/10 text-slate-400">
                      <Lock className="mr-1 h-3.5 w-3.5" />
                      Login required
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-4 text-base font-semibold text-white">{shortcut.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{shortcut.description}</p>
              </Link>
            ))}
          </div>
        </PanelSection>

        <PanelSection
          title="Access context"
          description="Current mode, retention model, and what this workspace can do right now."
        >
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Current mode</p>
              <p className="mt-3 text-base font-semibold text-white">{user ? "Authenticated analyst workspace" : "Guest investigation workspace"}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {user
                  ? "Case history, sharing, executive reporting, rules management, and settings are available from the shell."
                  : "Guests can use Overview, Investigations, and Live Monitor. Sign in to unlock persistent case inventory, executive metrics, rules, and settings."}
              </p>
            </div>

            {!user ? (
              <div className="rounded-[20px] border border-amber-400/10 bg-amber-400/5 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">Guest policy</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {!isGuestReady
                    ? "Guest access limits are loading from this browser session."
                    : guestRemaining > 0
                    ? `You can still analyze ${guestRemaining} log ${guestRemaining === 1 ? "file" : "files"} before login is required.`
                    : "The free analysis limit has been reached. Login to continue working with the platform."}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild variant="secondary">
                    <Link href="/login">Login</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/register">Register</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </PanelSection>
      </div>

      <PanelSection
        title={user ? "Recent investigations" : "Guest investigation state"}
        description={user
          ? "Saved cases sorted by newest first, with session volume and the latest risk snapshot."
          : "Continue the current guest-owned investigation from the main workspace without losing context."}
        actions={user ? <Badge variant="outline">{cases.length} cases</Badge> : activeGuestCase ? <Badge variant="outline">{activeGuestCase.sessions.length} sessions</Badge> : null}
      >
        {isLoadingCases ? (
          <LoadingState label={user ? "Loading recent cases" : "Loading guest investigation"} />
        ) : user ? (
          cases.length === 0 ? (
            <EmptyState
              title="No persistent cases exist yet"
              description="Create or upload an investigation from the workspace to populate this overview."
            />
          ) : (
            <div className="overflow-hidden rounded-[20px] border border-white/8">
              <Table>
                <TableHeader className="bg-[#0f1828]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Case</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Latest risk</TableHead>
                    <TableHead>Recent activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.slice(0, 8).map((item) => (
                    <TableRow key={item.id} className="bg-[#0b1422]">
                      <TableCell>
                        <Link href={`/cases/${item.id}`} className="font-medium text-white transition hover:text-sky-200">
                          {item.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-400">{formatTimestamp(item.created_at)}</TableCell>
                      <TableCell>{item.session_count}</TableCell>
                      <TableCell>
                        <Badge className={riskTone(item.latest_risk_score > 70 ? "High" : item.latest_risk_score > 30 ? "Medium" : "Low")} variant="outline">
                          {item.latest_risk_score}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400">{item.latest_uploaded_at ? formatTimestamp(item.latest_uploaded_at) : "No sessions yet"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : activeGuestCase ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Active guest investigation</p>
              <p className="mt-3 text-xl font-semibold text-white">{activeGuestCase.name}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Last session: {activeGuestCase.sessions.at(-1)?.filename ?? "No session uploaded yet"} | Created {formatTimestamp(activeGuestCase.created_at)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline">{activeGuestCase.sessions.length} sessions</Badge>
                <Badge variant="outline">{activeGuestCase.repeated_attackers.length} repeat attackers</Badge>
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Next step</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Jump back into the main investigation workspace to continue upload analysis, search the current case, or export the current report snapshot.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link href="/investigations">Continue investigating</Link>
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No guest investigation is active"
            description="Open Investigations to upload a log file, stream live data, or start your first guest analysis session."
          />
        )}
      </PanelSection>
    </div>
  );
}

function MetricTile({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof ShieldCheck;
  tone?: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-[#0b1422] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-sky-200" />
      </div>
      <div className="mt-4 flex items-end gap-3">
        <p className="text-3xl font-semibold text-white">{value}</p>
        {tone ? <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>Priority</span> : null}
      </div>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}
