import { AlertTriangle, BrainCircuit, Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIExplanation, AnalysisStage, UploadStatus } from "@/lib/types";
import { describeAnalysisStage, formatAnalysisStage, riskTone } from "@/lib/utils";

interface AIAnalysisProps {
  analysis: AIExplanation | null;
  status: UploadStatus;
  analysisStage: AnalysisStage;
  error: string | null;
}

export function AIAnalysis({ analysis, status, analysisStage, error }: AIAnalysisProps) {
  const isLoading = status === "running";
  const title = analysis
    ? analysis.source === "fallback"
      ? "Fallback Analysis"
      : "AI Analysis (Live)"
    : "AI Analysis";
  const description = analysis
    ? analysis.source === "fallback"
      ? "Live AI was unavailable, so the dashboard is showing the heuristic summary instead."
      : "Detection findings summarized by the local Ollama model."
    : "This featured section highlights the most important investigation guidance from the latest upload.";

  return (
    <Card className="overflow-hidden border-violet-400/20 bg-gradient-to-br from-violet-950/85 via-indigo-950/80 to-sky-950/75">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6 text-slate-300">{description}</CardDescription>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-violet-100">
            <BrainCircuit className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-slate-100">
              <Loader2 className="h-4 w-4 animate-spin text-violet-200" />
              <div>
                <p className="font-medium">{formatAnalysisStage(analysisStage)}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{describeAnalysisStage(analysisStage)}</p>
              </div>
            </div>
            <Skeleton className="h-24 w-full bg-white/10" />
            <Skeleton className="h-20 w-full bg-white/10" />
            <Skeleton className="h-20 w-full bg-white/10" />
          </div>
        ) : analysis ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={riskTone(analysis.risk_level)} variant="outline">
                {analysis.risk_level} risk
              </Badge>
              <Badge variant={analysis.source === "fallback" ? "secondary" : "success"}>
                {analysis.source === "fallback" ? "Fallback Analysis" : "AI Analysis (Live)"}
              </Badge>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_280px]">
              <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                  <ShieldCheck className="h-4 w-4" />
                  Explanation
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-100">{analysis.explanation}</p>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">Risk level</p>
                <p className="mt-4 text-3xl font-semibold text-white">{analysis.risk_level}</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Use this label to prioritize follow-up actions and decide whether the result can remain heuristic in hosted environments.
                </p>
              </section>
            </div>

            <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">Recommended action</div>
              <p className="mt-4 text-sm leading-7 text-slate-100">{analysis.recommended_action}</p>
            </section>

            {analysis.warning ? (
              <div className="flex items-start gap-3 rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{analysis.warning}</span>
              </div>
            ) : null}
          </>
        ) : status === "error" ? (
          <div className="flex items-start gap-3 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-5 text-sm leading-6 text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">AI analysis did not complete.</p>
              <p className="mt-2 text-rose-200">{error ?? "The request ended before the backend returned a usable response."}</p>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.04] px-5 py-12 text-center text-sm leading-7 text-slate-300">
            Upload a supported log file to populate the live or fallback analyst summary.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
