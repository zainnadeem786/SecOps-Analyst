"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { InvestigationWorkspace } from "@/components/InvestigationWorkspace";
import { LiveModePanel } from "@/components/LiveModePanel";
import { UploadForm } from "@/components/UploadForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadIncidentReport, uploadLog } from "@/lib/api";
import {
  getActiveGuestCaseId,
  getGuestUsageCount,
  incrementGuestUsage,
  setActiveGuestCaseId,
} from "@/lib/guest";
import { ApiError } from "@/lib/http";
import { getCaseDetail } from "@/lib/platform-api";
import type { AnalysisStage, CaseReference, DashboardState, UploadResponse } from "@/lib/types";
import { AlertTriangle, BrainCircuit, Lock, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

const initialState: DashboardState = {
  status: "idle",
  analysisStage: "idle",
  uploadProgress: 0,
  error: null,
  result: null,
  lastUploadedFile: null,
};

export default function Page() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [dashboardState, setDashboardState] = useState<DashboardState>(initialState);
  const [isExporting, setIsExporting] = useState(false);
  const [activeGuestCase, setActiveGuestCase] = useState<CaseReference | null>(null);
  const [guestUsageCount, setGuestUsageCount] = useState(0);
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const stageTimersRef = useRef<number[]>([]);

  function clearStageTimers() {
    stageTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    stageTimersRef.current = [];
  }

  useEffect(() => clearStageTimers, []);

  useEffect(() => {
    setGuestUsageCount(getGuestUsageCount());
  }, []);

  useEffect(() => {
    if (isAuthLoading || user || dashboardState.status === "running") {
      return;
    }

    const storedCaseId = getActiveGuestCaseId();
    if (!storedCaseId) {
      setActiveGuestCase(null);
      return;
    }

    const currentCaseId = dashboardState.result?.case?.id;
    if (currentCaseId === storedCaseId && dashboardState.result?.case) {
      setActiveGuestCase(dashboardState.result.case);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const detail = await getCaseDetail(storedCaseId);
        if (cancelled) {
          return;
        }

        const caseReference: CaseReference = {
          id: detail.id,
          name: detail.name,
          created_at: detail.created_at,
        };
        const latestSnapshot = detail.sessions.at(-1)?.snapshot ?? null;

        setActiveGuestCase(caseReference);
        setDashboardState((current) => (
          current.result
            ? current
            : {
              ...current,
              status: latestSnapshot ? "success" : "idle",
              analysisStage: latestSnapshot ? "ai" : "idle",
              uploadProgress: latestSnapshot ? 100 : 0,
              error: null,
              result: latestSnapshot,
              lastUploadedFile: latestSnapshot?.session?.filename ?? current.lastUploadedFile,
            }
        ));
      } catch {
        if (cancelled) {
          return;
        }
        setActiveGuestCase(null);
        setActiveGuestCaseId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardState.result?.case, dashboardState.result?.case?.id, dashboardState.status, isAuthLoading, user]);

  function moveToStage(stage: AnalysisStage) {
    setDashboardState((current) => {
      if (current.status !== "running") {
        return current;
      }

      return {
        ...current,
        analysisStage: stage,
      };
    });
  }

  function beginBackendStages() {
    clearStageTimers();
    moveToStage("parsing");

    stageTimersRef.current = [
      window.setTimeout(() => moveToStage("detecting"), 800),
      window.setTimeout(() => moveToStage("ai"), 2200),
    ];
  }

  async function handleUpload(file: File) {
    clearStageTimers();
    setDashboardState({
      status: "running",
      analysisStage: "uploading",
      uploadProgress: 0,
      error: null,
      result: null,
      lastUploadedFile: file.name,
    });

    const toastId = toast.loading("Uploading log file...");

    try {
      const result = await uploadLog(file, {
        caseId: user ? undefined : (activeGuestCase?.id ?? undefined),
        onUploadProgress: (progress) => {
          setDashboardState((current) => {
            if (current.status !== "running") {
              return current;
            }

            return {
              ...current,
              uploadProgress: progress,
            };
          });
        },
        onUploadComplete: () => {
          toast.loading("File uploaded. Running parser, detections, and AI analysis...", {
            id: toastId,
          });
          beginBackendStages();
        },
      });

      clearStageTimers();
      setDashboardState({
        status: "success",
        analysisStage: "ai",
        uploadProgress: 100,
        error: null,
        result,
        lastUploadedFile: file.name,
      });

      if (!user) {
        if (result.case) {
          setActiveGuestCase(result.case);
          setActiveGuestCaseId(result.case.id);
        }
        setGuestUsageCount(incrementGuestUsage(result.session?.id));
      }

      if (result.ai_analysis.source === "fallback") {
        toast.warning("Fallback analysis returned", {
          id: toastId,
          description: result.ai_analysis.warning ?? "Ollama was unavailable, so the dashboard is showing the heuristic explanation.",
        });
      } else {
        toast.success("Live AI analysis completed", {
          id: toastId,
          description: `${result.events.length} events parsed and ${result.detections.length} detections generated.`,
        });
      }
    } catch (error) {
      clearStageTimers();
      const message = error instanceof Error ? error.message : "The upload failed unexpectedly.";
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        setGuestUsageCount(3);
        setIsAuthPromptOpen(true);
      }
      setDashboardState((current) => ({
        ...current,
        status: "error",
        error: message,
      }));

      toast.error(message.includes("timed out") ? "AI analysis timed out" : "Upload failed", {
        id: toastId,
        description: message,
      });
    }
  }

  async function handleDownloadReport() {
    if (!dashboardState.result) {
      return;
    }

    setIsExporting(true);

    try {
      const blob = await downloadIncidentReport(dashboardState.result);
      const filename = (dashboardState.lastUploadedFile ?? "incident").replace(/\.[^.]+$/, "") || "incident";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${filename}-report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      toast.success("Incident report downloaded", {
        description: "The current investigation snapshot was exported as a PDF.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The incident report could not be generated.";
      toast.error("Report export failed", {
        description: message,
      });
    } finally {
      setIsExporting(false);
    }
  }

  function handleLiveSnapshot(snapshot: UploadResponse) {
    if (!user) {
      if (snapshot.case) {
        setActiveGuestCase(snapshot.case);
        setActiveGuestCaseId(snapshot.case.id);
      }
      if (snapshot.session?.id) {
        setGuestUsageCount(incrementGuestUsage(snapshot.session.id));
      }
    }

    setDashboardState((current) => ({
      ...current,
      status: "success",
      analysisStage: "ai",
      uploadProgress: 100,
      error: null,
      result: snapshot,
      lastUploadedFile: snapshot.session?.filename ?? snapshot.case?.name ?? current.lastUploadedFile,
    }));
  }

  function handleLiveCaseReady(caseReference: CaseReference) {
    if (!user) {
      setActiveGuestCase(caseReference);
      setActiveGuestCaseId(caseReference.id);
    }

    setDashboardState((current) => ({
      ...current,
      result: current.result
        ? {
          ...current.result,
          case: caseReference,
        }
        : current.result,
    }));
  }

  const result: UploadResponse | null = dashboardState.result;
  const guestRemaining = Math.max(0, 3 - guestUsageCount);
  const headerTone = dashboardState.status === "error"
    ? "destructive"
    : dashboardState.status === "running"
      ? "secondary"
      : result?.ai_analysis.source === "fallback"
        ? "secondary"
        : result
          ? "success"
          : "outline";
  const headerLabel = dashboardState.status === "running"
    ? "Analyzing"
    : dashboardState.status === "error"
      ? "Attention needed"
      : result?.ai_analysis.source === "fallback"
        ? "Fallback ready"
        : result
          ? "Live AI ready"
          : "Ready";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_18%),radial-gradient(circle_at_right,_rgba(59,130,246,0.18),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#09101f_48%,_#030712_100%)] pb-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="glass-panel flex flex-col gap-5 rounded-3xl px-6 py-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              SOC dashboard
            </div>
            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                AI Log Analyzer
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Review parsed access logs, prioritize suspicious detections, and surface live or fallback AI guidance in a cleaner SecOps workflow that is ready for local use and cloud deployment.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <Badge variant={headerTone}>{headerLabel}</Badge>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-slate-200">
                <BrainCircuit className="h-4 w-4 text-violet-200" />
                {result?.ai_analysis.source === "fallback" ? "Fallback remains cloud-safe" : "Local Ollama path enabled"}
              </div>
            </div>
            {dashboardState.error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{dashboardState.error}</span>
              </div>
            ) : null}
          </div>
        </header>

        <UploadForm
          onUpload={handleUpload}
          status={dashboardState.status}
          analysisStage={dashboardState.analysisStage}
          uploadProgress={dashboardState.uploadProgress}
          error={dashboardState.error}
          lastUploadedFile={dashboardState.lastUploadedFile}
        />

        {!user && !isAuthLoading ? (
          <Card className="border-white/10 bg-slate-950/55">
            <CardContent className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={guestRemaining === 0 ? "destructive" : "secondary"}>
                    Guest mode
                  </Badge>
                  <Badge variant="outline">
                    {guestUsageCount} used, {guestRemaining} remaining
                  </Badge>
                  {activeGuestCase ? <Badge variant="outline">Active case: {activeGuestCase.name}</Badge> : null}
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  Guests can analyze up to 3 logs and continue one active investigation case from this dashboard. Sign in to unlock saved case lists, sharing, rules management, and the executive view.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="secondary">
                  <Link href="/login">
                    <UserRound className="h-4 w-4" />
                    Login
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/register">
                    <ShieldCheck className="h-4 w-4" />
                    Register
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <LiveModePanel
          caseId={user ? undefined : (activeGuestCase?.id ?? undefined)}
          onSnapshot={handleLiveSnapshot}
          onCaseReady={handleLiveCaseReady}
          onAuthRequired={() => {
            setGuestUsageCount(3);
            setIsAuthPromptOpen(true);
          }}
        />

        <Suspense fallback={null}>
          <InvestigationWorkspace
            result={result}
            status={dashboardState.status}
            analysisStage={dashboardState.analysisStage}
            error={dashboardState.error}
            isExporting={isExporting}
            onDownload={handleDownloadReport}
          />
        </Suspense>
      </div>

      {isAuthPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <Card className="w-full max-w-lg border-rose-400/20 bg-slate-950/95 shadow-[0_30px_120px_rgba(15,23,42,0.8)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-rose-200">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Free usage limit reached</CardTitle>
                  <CardDescription className="mt-1 text-slate-300">
                    Please login to continue using the platform.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-slate-300">
                Guest mode is limited to 3 successful analyses. Create an account or sign in to keep working with persistent cases, sharing, configurable rules, and executive reporting.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="flex-1">
                  <Link href="/login" className="w-full">
                    <UserRound className="h-4 w-4" />
                    Login
                  </Link>
                </Button>
                <Button asChild className="flex-1" variant="secondary">
                  <Link href="/register" className="w-full">
                    <ShieldCheck className="h-4 w-4" />
                    Register
                  </Link>
                </Button>
              </div>
              <Button className="w-full" variant="ghost" onClick={() => setIsAuthPromptOpen(false)}>
                Continue browsing
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
