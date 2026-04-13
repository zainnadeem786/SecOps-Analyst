import { Activity, Radar, ShieldAlert, Siren } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { UploadResponse } from "@/lib/types";
import { cn, countHighSeverity, countUniqueIps } from "@/lib/utils";

interface SummaryCardsProps {
  result: UploadResponse | null;
  isLoading: boolean;
}

export function SummaryCards({ result, isLoading }: SummaryCardsProps) {
  const events = result?.events ?? [];
  const detections = result?.detections ?? [];
  const metrics = [
    { label: "Total Events", value: events.length, icon: Activity, tone: "text-sky-200" },
    { label: "Detections", value: detections.length, icon: Siren, tone: "text-violet-200" },
    {
      label: "High Severity",
      value: countHighSeverity(detections.map((detection) => detection.severity)),
      icon: ShieldAlert,
      tone: "text-rose-200",
    },
    { label: "Unique IPs", value: countUniqueIps(events), icon: Radar, tone: "text-emerald-200" },
  ];

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Analysis snapshot</p>
          <p className="mt-2 text-sm text-slate-300">Operational metrics from the latest completed upload.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{metric.label}</p>
                  <metric.icon className={cn("h-4 w-4", metric.tone)} />
                </div>
                <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
