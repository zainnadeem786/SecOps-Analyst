"use client";

import { useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  Loader2,
  ShieldAlert,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { AnalysisStage, UploadStatus } from "@/lib/types";
import { MAX_UPLOAD_SIZE_BYTES, type UploadFormValues, uploadFormSchema } from "@/lib/validations";
import { cn, describeAnalysisStage, formatAnalysisStage } from "@/lib/utils";

interface UploadFormProps {
  onUpload: (file: File) => Promise<void>;
  status: UploadStatus;
  analysisStage: AnalysisStage;
  uploadProgress: number;
  error: string | null;
  lastUploadedFile: string | null;
}

const stageItems = [
  {
    key: "uploading",
    label: "Uploading",
    description: "Transfer the file to the API.",
    icon: UploadCloud,
  },
  {
    key: "parsing",
    label: "Parsing logs",
    description: "Normalize web access lines.",
    icon: FileSearch,
  },
  {
    key: "detecting",
    label: "Detecting threats",
    description: "Run rule-based detections.",
    icon: ShieldAlert,
  },
  {
    key: "ai",
    label: "Analyzing with AI",
    description: "Summarize detections only.",
    icon: BrainCircuit,
  },
] as const satisfies ReadonlyArray<{
  key: Exclude<AnalysisStage, "idle">;
  label: string;
  description: string;
  icon: typeof UploadCloud;
}>;

const stageOrder = stageItems.map((stage) => stage.key);

type StepState = "upcoming" | "active" | "complete" | "error";

export function UploadForm({
  onUpload,
  status,
  analysisStage,
  uploadProgress,
  error,
  lastUploadedFile,
}: UploadFormProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
  });

  const selectedFile = useWatch({ control: form.control, name: "file" });
  const activeStageIndex = stageOrder.indexOf(analysisStage as Exclude<AnalysisStage, "idle">);
  const showUploadProgress = status === "running" && analysisStage === "uploading";
  const statusVariant = status === "error"
    ? "destructive"
    : status === "success"
      ? "success"
      : status === "running"
        ? "secondary"
        : "outline";
  const statusLabel = status === "running"
    ? formatAnalysisStage(analysisStage)
    : status === "success"
      ? "Analysis complete"
      : status === "error"
        ? "Attention needed"
        : "Ready";
  const statusDescription = status === "success"
    ? "Results are ready below. Upload another file whenever you want to refresh the investigation view."
    : error ?? describeAnalysisStage(analysisStage);

  async function handleSubmit(values: UploadFormValues) {
    await onUpload(values.file);
  }

  function applyFile(file: File | undefined) {
    if (!file) {
      return;
    }

    form.setValue("file", file, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  function getStepState(stepKey: Exclude<AnalysisStage, "idle">): StepState {
    const stepIndex = stageOrder.indexOf(stepKey);

    if (status === "success") {
      return "complete";
    }
    if (status === "error") {
      if (activeStageIndex === -1) {
        return "upcoming";
      }
      if (stepIndex < activeStageIndex) {
        return "complete";
      }
      if (stepIndex === activeStageIndex) {
        return "error";
      }
      return "upcoming";
    }
    if (activeStageIndex === -1) {
      return "upcoming";
    }
    if (stepIndex < activeStageIndex) {
      return "complete";
    }
    if (stepIndex === activeStageIndex) {
      return "active";
    }
    return "upcoming";
  }

  return (
    <Card className="overflow-hidden border-white/10 bg-slate-950/55">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Upload and analyze</CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6 text-slate-300">
              Validate a `.log` or `.txt` file, send it through the FastAPI pipeline, and keep the analyst workflow focused on meaningful stages instead of misleading instant-complete progress.
            </CardDescription>
          </div>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_340px]">
          <form className="space-y-5" onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="space-y-3">
              <Label htmlFor={inputId}>Log file</Label>
              <div
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  applyFile(event.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "rounded-3xl border border-dashed bg-slate-950/40 p-5 transition-all duration-200",
                  isDragging ? "border-sky-300/80 bg-sky-500/10 shadow-[0_0_0_1px_rgba(125,211,252,0.28)]" : "border-white/10 hover:border-white/20",
                )}
              >
                <div className="space-y-5 rounded-[1.4rem] bg-white/[0.03] p-5 text-sm text-slate-300">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <p className="font-medium text-slate-100">Drag and drop a supported log file</p>
                      <p className="max-w-xl leading-6 text-slate-400">
                        Maximum upload size: {(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB. Frontend validation runs before upload and the backend enforces the same limits again.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sky-200">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
                      <UploadCloud className="h-4 w-4" />
                      Choose file
                    </Button>
                    <Input
                      id={inputId}
                      ref={inputRef}
                      type="file"
                      accept=".log,.txt,text/plain"
                      className="hidden"
                      onChange={(event) => applyFile(event.target.files?.[0])}
                    />
                    <div className="flex-1 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                      {selectedFile ? `${selectedFile.name} | ${(selectedFile.size / 1024).toFixed(1)} KB` : "No file selected yet"}
                    </div>
                  </div>
                </div>
              </div>
              {form.formState.errors.file ? (
                <p className="text-sm text-rose-300">{form.formState.errors.file.message}</p>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Latest file</p>
              <p className="mt-2 font-medium text-slate-100">{lastUploadedFile ?? "No upload completed yet"}</p>
            </div>

            <Button className="w-full" type="submit" disabled={status === "running"}>
              {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {status === "running" ? "Analyzing logs..." : "Analyze uploaded log"}
            </Button>
          </form>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Analysis pipeline</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{statusDescription}</p>
              </div>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>

            <ol className="mt-6 space-y-3">
              {stageItems.map((stage) => {
                const stepState = getStepState(stage.key);
                const Icon = stage.icon;
                const isActive = stepState === "active";
                const isComplete = stepState === "complete";
                const isError = stepState === "error";

                return (
                  <li
                    key={stage.key}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                      isComplete && "border-emerald-400/20 bg-emerald-500/10",
                      isActive && "border-violet-400/25 bg-violet-500/10",
                      isError && "border-rose-400/20 bg-rose-500/10",
                      stepState === "upcoming" && "border-white/10 bg-slate-950/30",
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border",
                      isComplete && "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
                      isActive && "border-violet-400/30 bg-violet-500/15 text-violet-100",
                      isError && "border-rose-400/30 bg-rose-500/15 text-rose-100",
                      stepState === "upcoming" && "border-white/10 bg-white/[0.04] text-slate-400",
                    )}>
                      {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className={cn("h-4 w-4", isActive && status === "running" && "animate-pulse")} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-100">{stage.label}</p>
                        <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                          {isComplete ? "Done" : isActive ? "Active" : isError ? "Stopped" : "Queued"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{stage.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
                <span>{showUploadProgress ? `Uploading ${uploadProgress}%` : formatAnalysisStage(analysisStage)}</span>
                <span>{showUploadProgress ? "Byte progress" : status === "running" ? "Backend work in progress" : "Idle"}</span>
              </div>
              <Progress value={showUploadProgress ? Math.max(uploadProgress, 2) : undefined} />
              <p className="text-xs leading-5 text-slate-500">
                {showUploadProgress
                  ? "Real transfer progress is shown only while the browser is still sending the file."
                  : "After upload completes, the dashboard advances through parser, detector, and AI stages until the API returns."}
              </p>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
