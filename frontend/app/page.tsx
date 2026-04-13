"use client";

import { useEffect, useRef, useState } from "react";

import { AIAnalysis } from "@/components/AIAnalysis";
import { DetectionList } from "@/components/DetectionList";
import { LogsTable } from "@/components/LogsTable";
import { UploadForm } from "@/components/UploadForm";
import { Badge } from "@/components/ui/badge";
import { uploadLog } from "@/lib/api";
import type { AnalysisStage, DashboardState, UploadResponse } from "@/lib/types";
import { AlertTriangle, BrainCircuit, ShieldCheck } from "lucide-react";
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
  const [dashboardState, setDashboardState] = useState<DashboardState>(initialState);
  const stageTimersRef = useRef<number[]>([]);

  function clearStageTimers() {
    stageTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    stageTimersRef.current = [];
  }

  useEffect(() => clearStageTimers, []);

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

  const result: UploadResponse | null = dashboardState.result;
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
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
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
          result={result}
        />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
          <AIAnalysis
            analysis={result?.ai_analysis ?? null}
            status={dashboardState.status}
            analysisStage={dashboardState.analysisStage}
            error={dashboardState.error}
          />
          <DetectionList
            detections={result?.detections ?? []}
            isLoading={dashboardState.status === "running"}
            hasResult={Boolean(result)}
          />
        </section>

        <LogsTable
          events={result?.events ?? []}
          isLoading={dashboardState.status === "running"}
          hasResult={Boolean(result)}
        />
      </div>
    </main>
  );
}
