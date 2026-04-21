"use client";

import { useEffect, useState } from "react";
import { Globe2, Radar, ShieldAlert, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { PanelSection } from "@/components/PanelSection";
import { RequireAuth } from "@/components/RequireAuth";
import { getExecutiveSummary } from "@/lib/platform-api";
import type { ExecutiveSummary } from "@/lib/types";

export default function ExecutivePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    if (!user) {
      setIsLoadingSummary(false);
      return;
    }
    void loadSummary();
  }, [isAuthLoading, user]);

  async function loadSummary() {
    try {
      setSummary(await getExecutiveSummary());
    } catch (error) {
      toast.error("Executive summary could not be loaded", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    } finally {
      setIsLoadingSummary(false);
    }
  }

  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Executive"
          title="Executive security view"
          description="Tenant-scoped portfolio metrics for incident volume, average risk, attacker geography, and trend movement across saved sessions."
        />

        {isLoadingSummary ? (
          <LoadingState label="Loading executive metrics" />
        ) : summary ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard icon={ShieldAlert} label="Total incidents" value={String(summary.total_incidents)} note="User-owned cases" />
              <MetricCard icon={Radar} label="Total sessions" value={String(summary.total_sessions)} note="Persisted uploads" />
              <MetricCard icon={TrendingUp} label="Average risk" value={summary.average_risk_score.toFixed(1)} note="Across all sessions" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <PanelSection title="Top attacker countries" description="Most common GeoIP origins across saved investigation data.">
                <div className="space-y-3">
                  {summary.top_attacker_countries.length === 0 ? (
                    <p className="text-sm text-slate-400">No GeoIP-enriched detections are available yet.</p>
                  ) : summary.top_attacker_countries.map((item) => (
                    <div key={item.country} className="flex items-center justify-between rounded-[18px] border border-white/8 bg-[#0f1828] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Globe2 className="h-4 w-4 text-sky-200" />
                        <span className="text-sm text-slate-100">{item.country}</span>
                      </div>
                      <span className="text-sm font-semibold text-white">{item.count}</span>
                    </div>
                  ))}
                </div>
              </PanelSection>

              <PanelSection title="Risk trend" description="Daily average session risk for the authenticated workspace.">
                <div className="space-y-4">
                  {summary.risk_trend.length === 0 ? (
                    <p className="text-sm text-slate-400">No trend data is available yet.</p>
                  ) : summary.risk_trend.map((point) => (
                    <div key={point.day} className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-300">
                        <span>{point.day}</span>
                        <span>{point.average_risk_score.toFixed(1)} average risk across {point.session_count} session(s)</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300"
                          style={{ width: `${Math.max(6, point.average_risk_score)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </PanelSection>
            </div>
          </>
        ) : (
          <EmptyState title="No executive metrics are available yet" description="Create or upload investigations so the executive view has portfolio data to display." />
        )}
      </div>
    </RequireAuth>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof ShieldAlert;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-sky-200" />
      </div>
      <p className="mt-4 text-4xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}
