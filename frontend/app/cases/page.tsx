"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderSearch, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createCase, listCases } from "@/lib/platform-api";
import type { CaseSummary } from "@/lib/types";
import { formatTimestamp, riskTone } from "@/lib/utils";

export default function CasesPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    if (!user) {
      setIsLoadingCases(false);
      return;
    }
    void loadCases();
  }, [isAuthLoading, user]);

  async function loadCases() {
    try {
      setCases(await listCases());
    } catch (error) {
      toast.error("Cases could not be loaded", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    } finally {
      setIsLoadingCases(false);
    }
  }

  async function handleCreateCase() {
    setIsCreating(true);
    try {
      const created = await createCase();
      window.location.href = `/cases/${created.id}`;
    } catch (error) {
      toast.error("Case creation failed", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_18%),radial-gradient(circle_at_right,_rgba(59,130,246,0.18),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#09101f_48%,_#030712_100%)] pb-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <RequireAuth>
          <Card className="glass-panel rounded-3xl border-white/10 bg-slate-950/55">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Investigation cases</CardTitle>
                  <CardDescription className="mt-2 max-w-3xl leading-6 text-slate-300">
                    Persistent investigation sessions grouped into cases so analysts can revisit uploads, compare risk over time, and continue work without starting from scratch.
                  </CardDescription>
                </div>
                <Button onClick={handleCreateCase} disabled={isCreating}>
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isCreating ? "Creating case..." : "Create case"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingCases ? (
                <div className="rounded-3xl border border-white/10 bg-slate-950/35 px-5 py-10 text-center text-sm text-slate-400">
                  Loading saved investigations...
                </div>
              ) : cases.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
                  No persistent cases exist yet. Upload a log on the dashboard or create an empty case to begin.
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {cases.map((item) => (
                    <Link
                      key={item.id}
                      href={`/cases/${item.id}`}
                      className="rounded-3xl border border-white/10 bg-slate-950/35 p-5 transition hover:border-white/20 hover:bg-slate-900/45"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold text-white">{item.name}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{formatTimestamp(item.created_at)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
                          <FolderSearch className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <Badge variant="outline">{item.session_count} sessions</Badge>
                        <Badge className={riskTone(item.latest_risk_score > 70 ? "High" : item.latest_risk_score > 30 ? "Medium" : "Low")} variant="outline">
                          Risk {item.latest_risk_score}
                        </Badge>
                        <Badge variant="outline">{item.repeated_attacker_count} repeat attackers</Badge>
                      </div>

                      {item.latest_uploaded_at ? (
                        <p className="mt-4 text-sm text-slate-400">
                          Latest session: {formatTimestamp(item.latest_uploaded_at)}
                        </p>
                      ) : null}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </RequireAuth>
      </div>
    </main>
  );
}
