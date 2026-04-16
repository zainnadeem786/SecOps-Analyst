"use client";

import { Activity } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RiskTrendPoint } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

export function RiskTrendChart({ points }: { points: RiskTrendPoint[] }) {
  const maxScore = Math.max(...points.map((point) => point.risk_score), 1);

  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Risk trend</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Session-by-session incident scores for this investigation case.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
            <Activity className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            Risk trend data will appear after the case contains saved sessions.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-3 overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/30 px-4 py-5">
              {points.map((point) => (
                <div key={point.session_id} className="flex min-w-[80px] flex-1 flex-col items-center gap-3">
                  <div className="flex h-48 w-full items-end rounded-2xl bg-white/[0.03] px-2 py-2">
                    <div
                      className="w-full rounded-xl bg-gradient-to-t from-sky-500 via-cyan-400 to-emerald-300 transition-[height] duration-300"
                      style={{ height: `${Math.max(8, (point.risk_score / maxScore) * 100)}%` }}
                    />
                  </div>
                  <div className="text-center text-xs leading-5 text-slate-400">
                    <p className="font-semibold text-slate-100">{point.risk_score}</p>
                    <p>{point.filename}</p>
                    <p>{formatTimestamp(point.uploaded_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
