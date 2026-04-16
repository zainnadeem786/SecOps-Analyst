"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Copy, FolderKanban, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/AuthProvider";
import { CaseSessions } from "@/components/CaseSessions";
import { InvestigationWorkspace } from "@/components/InvestigationWorkspace";
import { LiveModePanel } from "@/components/LiveModePanel";
import { RequireAuth } from "@/components/RequireAuth";
import { RepeatedAttackers } from "@/components/RepeatedAttackers";
import { RiskTrendChart } from "@/components/RiskTrendChart";
import { UploadForm } from "@/components/UploadForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadIncidentReport } from "@/lib/api";
import { createShareLink, getCaseDetail, uploadLogToCase } from "@/lib/platform-api";
import type { AnalysisStage, CaseDetail, DashboardState, UploadResponse } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

const initialState: DashboardState = {
  status: "idle",
  analysisStage: "idle",
  uploadProgress: 0,
  error: null,
  result: null,
  lastUploadedFile: null,
};

export default function CaseDetailPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const params = useParams<{ id: string }>();
  const caseId = typeof params?.id === "string" ? params.id : "";
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [dashboardState, setDashboardState] = useState<DashboardState>(initialState);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<UploadResponse | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const stageTimersRef = useRef<number[]>([]);

  const selectedSnapshot = useMemo(() => {
    if (liveSnapshot) {
      return liveSnapshot;
    }
    const session = caseDetail?.sessions.find((item) => item.id === selectedSessionId) ?? caseDetail?.sessions.at(-1);
    return session?.snapshot ?? null;
  }, [caseDetail, liveSnapshot, selectedSessionId]);

  const loadCase = useCallback(async () => {
    if (!caseId) {
      return;
    }

    try {
      const detail = await getCaseDetail(caseId);
      setCaseDetail(detail);
      setSelectedSessionId((current) => current ?? detail.sessions.at(-1)?.id ?? null);
      setDashboardState((current) => ({
        ...current,
        result: current.result ?? detail.sessions.at(-1)?.snapshot ?? null,
      }));
    } catch (error) {
      toast.error("Case could not be loaded", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    }
  }, [caseId]);

  useEffect(() => {
    if (!isAuthLoading && user) {
      void loadCase();
    }
    return () => {
      stageTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [isAuthLoading, loadCase, user]);

  function moveToStage(stage: AnalysisStage) {
    setDashboardState((current) => (
      current.status !== "running"
        ? current
        : { ...current, analysisStage: stage }
    ));
  }

  function beginBackendStages() {
    stageTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    moveToStage("parsing");
    stageTimersRef.current = [
      window.setTimeout(() => moveToStage("detecting"), 800),
      window.setTimeout(() => moveToStage("ai"), 2200),
    ];
  }

  async function handleUpload(file: File) {
    setLiveSnapshot(null);
    setDashboardState({
      status: "running",
      analysisStage: "uploading",
      uploadProgress: 100,
      error: null,
      result: selectedSnapshot,
      lastUploadedFile: file.name,
    });
    beginBackendStages();

    try {
      const result = await uploadLogToCase(caseId, file);
      setDashboardState({
        status: "success",
        analysisStage: "ai",
        uploadProgress: 100,
        error: null,
        result,
        lastUploadedFile: file.name,
      });
      setLiveSnapshot(result);
      if (result.session?.id) {
        setSelectedSessionId(result.session.id);
      }
      await loadCase();
    } catch (error) {
      setDashboardState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed unexpectedly.",
      }));
    }
  }

  function handleLiveSnapshot(snapshot: UploadResponse) {
    setLiveSnapshot(snapshot);
    setDashboardState((current) => ({
      ...current,
      status: "success",
      analysisStage: "ai",
      error: null,
      result: snapshot,
      lastUploadedFile: snapshot.session?.filename ?? current.lastUploadedFile,
    }));

    if (snapshot.session?.id) {
      setSelectedSessionId(snapshot.session.id);
      void loadCase();
    }
  }

  async function handleDownload() {
    if (!selectedSnapshot) {
      return;
    }

    setIsExporting(true);
    try {
      const blob = await downloadIncidentReport(selectedSnapshot);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${selectedSnapshot.session?.filename?.replace(/\.[^.]+$/, "") || "case"}-report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleShareCase() {
    if (!caseDetail) {
      return;
    }

    setIsSharing(true);
    try {
      const response = await createShareLink(caseDetail.id);
      const shareUrl = `${window.location.origin}/share/${response.token}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      toast.success("Share link created", {
        description: "A read-only investigation link was copied to your clipboard.",
      });
    } catch (error) {
      toast.error("Share link could not be created", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    } finally {
      setIsSharing(false);
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
                  <CardTitle>{caseDetail?.name ?? "Investigation case"}</CardTitle>
                  <CardDescription className="mt-2 max-w-3xl leading-6 text-slate-300">
                    Persistent case workspace with saved sessions, risk trend, repeated attacker tracking, and live investigation support.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{caseDetail?.sessions.length ?? 0} sessions</Badge>
                  {caseDetail ? <Badge variant="outline">Created {formatTimestamp(caseDetail.created_at)}</Badge> : null}
                  <Button variant="secondary" onClick={() => void handleShareCase()} disabled={isSharing || !caseDetail}>
                    {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    {isSharing ? "Creating link..." : "Share case"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <CaseSessions
                sessions={caseDetail?.sessions ?? []}
                selectedSessionId={selectedSessionId}
                onSelect={(sessionId) => {
                  setSelectedSessionId(sessionId);
                  setLiveSnapshot(null);
                }}
              />
              <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <div className="space-y-2 text-sm leading-6 text-slate-300">
                    <p>Select any saved session to load its snapshot into the workspace below.</p>
                    <p>New uploads and live sessions attach directly to this case and refresh the history after persistence.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <RiskTrendChart points={caseDetail?.risk_trend ?? []} />
            <RepeatedAttackers attackers={caseDetail?.repeated_attackers ?? []} />
          </div>

          <UploadForm
            onUpload={handleUpload}
            status={dashboardState.status}
            analysisStage={dashboardState.analysisStage}
            uploadProgress={dashboardState.uploadProgress}
            error={dashboardState.error}
            lastUploadedFile={dashboardState.lastUploadedFile}
          />

          <LiveModePanel
            caseId={caseId}
            onSnapshot={handleLiveSnapshot}
          />

          <Suspense fallback={null}>
            <InvestigationWorkspace
              result={selectedSnapshot}
              status={dashboardState.status === "running" ? "running" : selectedSnapshot ? "success" : "idle"}
              analysisStage={dashboardState.analysisStage}
              error={dashboardState.error}
              isExporting={isExporting}
              onDownload={handleDownload}
            />
          </Suspense>
        </RequireAuth>
      </div>
    </main>
  );
}
