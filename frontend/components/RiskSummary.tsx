import { Download, Loader2, ShieldCheck, Siren } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { UploadResponse } from "@/lib/types";
import { countSuspiciousIps, getStrongestSignal, riskTone } from "@/lib/utils";

interface RiskSummaryProps {
  result: UploadResponse | null;
  isLoading: boolean;
  hasResult: boolean;
  isDownloading: boolean;
  onDownload: () => void;
  canDownload?: boolean;
}

export function RiskSummary({
  result,
  isLoading,
  hasResult,
  isDownloading,
  onDownload,
  canDownload = true,
}: RiskSummaryProps) {
  const riskAssessment = result?.risk_assessment ?? { risk_score: 0, risk_level: "Low" as const };
  const detections = result?.detections ?? [];
  const campaigns = result?.attack_campaigns ?? [];
  const suspiciousIps = countSuspiciousIps(detections);
  const strongestSignal = getStrongestSignal(detections);

  return (
    <Card className="overflow-hidden border-sky-400/20 bg-gradient-to-br from-slate-950/95 via-sky-950/85 to-cyan-950/75 shadow-[0_24px_80px_rgba(14,165,233,0.16)]">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Risk summary</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Canonical scoring for the current incident, ready for investigation handoff and report export.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-sky-100">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full bg-white/10" />
            <Skeleton className="h-24 w-full bg-white/10" />
            <Skeleton className="h-11 w-full bg-white/10" />
          </div>
        ) : !hasResult ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.05] px-5 py-10 text-center text-sm leading-7 text-slate-300">
            Upload logs to begin investigation
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_112px] lg:items-center">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Overall risk</p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <p className="text-4xl font-semibold text-white sm:text-5xl">{riskAssessment.risk_score}</p>
                    <span className={`rounded-full px-3 py-1 text-sm font-medium ${riskTone(riskAssessment.risk_level)}`}>
                      {riskAssessment.risk_level}
                    </span>
                  </div>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">
                    Canonical incident score synthesized from detections, campaign correlation, and attack sequencing.
                  </p>
                </div>
                <div className="flex justify-start lg:justify-end">
                  <RiskGauge value={riskAssessment.risk_score} />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard icon={Siren} label="Suspicious IPs" value={String(suspiciousIps)} />
              <MetricCard icon={ShieldCheck} label="Campaigns" value={String(campaigns.length)} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Strongest signal</p>
              <p className="mt-3 text-sm leading-7 text-slate-100">{strongestSignal}</p>
            </div>

            {canDownload ? (
              <Button className="w-full" onClick={onDownload} disabled={isDownloading || !hasResult}>
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isDownloading ? "Generating report..." : "Download Incident Report"}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RiskGauge({ value }: { value: number }) {
  return (
    <div
      className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full transition-all duration-700"
      style={{
        background: `conic-gradient(
          from 220deg,
          rgb(16 185 129) 0deg,
          rgb(250 204 21) ${Math.max(value - 25, 0) * 2.4}deg,
          rgb(248 113 113) ${Math.min(value, 100) * 3.6}deg,
          rgba(255,255,255,0.08) ${Math.min(value, 100) * 3.6}deg
        )`,
      }}
    >
      <div className="absolute inset-[7px] rounded-full bg-slate-950/95" />
      <div className="relative text-center">
        <p className="text-[30px] font-semibold leading-none text-white">{value}</p>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Risk</p>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-sky-100" />
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}
