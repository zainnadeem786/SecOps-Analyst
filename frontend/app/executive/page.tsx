"use client";

import { useEffect, useState } from "react";
import { Globe2, Loader2, Radar, ShieldAlert, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_18%),radial-gradient(circle_at_right,_rgba(59,130,246,0.18),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#09101f_48%,_#030712_100%)] pb-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <RequireAuth>
          <Card className="glass-panel rounded-3xl border-white/10 bg-slate-950/55">
            <CardHeader>
              <CardTitle>Executive security view</CardTitle>
              <CardDescription className="mt-2 max-w-3xl leading-6 text-slate-300">
                Tenant-scoped portfolio metrics for incident volume, average risk, attacker geography, and risk trend over time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingSummary ? (
                <div className="rounded-3xl border border-white/10 bg-slate-950/35 px-5 py-10 text-center text-sm text-slate-400">
                  <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                  Loading executive metrics...
                </div>
              ) : summary ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <MetricCard icon={ShieldAlert} label="Total incidents" value={String(summary.total_incidents)} note="User-owned cases" />
                    <MetricCard icon={Radar} label="Total sessions" value={String(summary.total_sessions)} note="Persisted uploads" />
                    <MetricCard icon={TrendingUp} label="Average risk" value={summary.average_risk_score.toFixed(1)} note="Across all sessions" />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <Card className="rounded-3xl border-white/10 bg-slate-950/35">
                      <CardHeader>
                        <CardTitle className="text-lg">Top attacker countries</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {summary.top_attacker_countries.length === 0 ? (
                          <p className="text-sm text-slate-400">No GeoIP-enriched detections are available yet.</p>
                        ) : summary.top_attacker_countries.map((item) => (
                          <div key={item.country} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Globe2 className="h-4 w-4 text-sky-200" />
                              <span className="text-sm text-slate-100">{item.country}</span>
                            </div>
                            <span className="text-sm font-semibold text-white">{item.count}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="rounded-3xl border-white/10 bg-slate-950/35">
                      <CardHeader>
                        <CardTitle className="text-lg">Risk trend</CardTitle>
                        <CardDescription className="text-slate-300">
                          Daily average session risk for the authenticated workspace.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
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
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm text-slate-400">
                  No executive metrics are available yet.
                </div>
              )}
            </CardContent>
          </Card>
        </RequireAuth>
      </div>
    </main>
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
