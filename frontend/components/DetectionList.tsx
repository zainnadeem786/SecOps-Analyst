import { AlertTriangle, Siren, TerminalSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Detection } from "@/lib/types";
import { formatDetectionLabel, severityTone } from "@/lib/utils";

interface DetectionListProps {
  detections: Detection[];
  isLoading: boolean;
  hasResult: boolean;
}

export function DetectionList({ detections, isLoading, hasResult }: DetectionListProps) {
  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Detections</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Investigation-ready findings grouped by suspicious behavior, severity, and source IP.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-violet-200">
            <Siren className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/40 p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))
        ) : detections.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            {hasResult ? "No detections matched the current rules for this upload." : "Upload a log file to populate the detections list."}
          </div>
        ) : (
          detections.map((detection) => (
            <article
              key={`${detection.type}-${detection.source_ip}`}
              className="rounded-3xl border border-white/10 bg-slate-950/35 p-5 transition duration-200 hover:border-white/20"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {formatDetectionLabel(detection.type)}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{detection.source_ip}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{detection.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={severityTone(detection.severity)} variant="outline">
                    {detection.severity}
                  </Badge>
                  <Badge variant="outline">Count {detection.count}</Badge>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <TerminalSquare className="h-4 w-4" />
                  Evidence
                </div>
                {detection.evidence.length > 0 ? (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {detection.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <AlertTriangle className="h-4 w-4" />
                    No compact evidence snippet was attached to this detection.
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}
