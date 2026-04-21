"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Eye, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { AnalystWorkspace } from "@/components/AnalystWorkspace";
import { CaseSessions } from "@/components/CaseSessions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSharedCase } from "@/lib/platform-api";
import type { SharedCaseView } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

export default function SharedCasePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const [sharedView, setSharedView] = useState<SharedCaseView | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedSnapshot = useMemo(() => {
    const session = sharedView?.case.sessions.find((item) => item.id === selectedSessionId) ?? sharedView?.case.sessions.at(-1);
    return session?.snapshot ?? null;
  }, [selectedSessionId, sharedView]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await getSharedCase(token);
        if (cancelled) {
          return;
        }
        setSharedView(response);
        setSelectedSessionId(response.case.sessions.at(-1)?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          toast.error("Shared case could not be loaded", {
            description: error instanceof Error ? error.message : "Unexpected backend response.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_18%),radial-gradient(circle_at_right,_rgba(59,130,246,0.18),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#09101f_48%,_#030712_100%)] pb-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card className="glass-panel rounded-3xl border-white/10 bg-slate-950/55">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>{sharedView?.case.name ?? "Shared investigation"}</CardTitle>
                <CardDescription className="mt-2 max-w-3xl leading-6 text-slate-300">
                  Read-only investigation snapshot shared securely for review. Uploads, live mode, editing, and tenant management are intentionally disabled in this view.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Read only
                </Badge>
                {sharedView ? <Badge variant="outline">Expires {formatTimestamp(sharedView.expires_at)}</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="rounded-3xl border border-white/10 bg-slate-950/35 px-5 py-10 text-center text-sm text-slate-400">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                Loading shared investigation...
              </div>
            ) : !sharedView ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
                The shared case could not be loaded. The link may be invalid or expired.
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <CaseSessions
                  sessions={sharedView.case.sessions}
                  selectedSessionId={selectedSessionId}
                  onSelect={setSelectedSessionId}
                />
                <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
                      <Share2 className="h-5 w-5" />
                    </div>
                    <div className="space-y-2 text-sm leading-6 text-slate-300">
                      <p>This view exposes only the sanitized case snapshot and saved session history.</p>
                      <p>Ownership, guest identifiers, authentication details, and write actions are intentionally excluded.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Suspense fallback={null}>
          <AnalystWorkspace
            result={selectedSnapshot}
            status={isLoading ? "running" : selectedSnapshot ? "success" : "idle"}
            analysisStage="ai"
            error={null}
            isExporting={false}
            onDownload={() => undefined}
            enableSearch={false}
            canDownload={false}
          />
        </Suspense>
      </div>
    </main>
  );
}
