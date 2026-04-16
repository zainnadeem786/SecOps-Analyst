"use client";

import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UploadSessionDetail } from "@/lib/types";
import { cn, formatTimestamp, riskTone } from "@/lib/utils";

interface CaseSessionsProps {
  sessions: UploadSessionDetail[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

export function CaseSessions({ sessions, selectedSessionId, onSelect }: CaseSessionsProps) {
  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Saved sessions</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Historical uploads stored in this investigation case. Select one to load the workspace snapshot.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
            <History className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            No saved sessions are available for this case yet.
          </div>
        ) : (
          sessions.map((session) => {
            const isSelected = selectedSessionId === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className={cn(
                  "w-full rounded-3xl border p-4 text-left transition",
                  isSelected
                    ? "border-sky-300/30 bg-sky-500/10"
                    : "border-white/10 bg-slate-950/35 hover:border-white/20 hover:bg-slate-900/45",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{session.filename}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                      <span>{formatTimestamp(session.uploaded_at)}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {session.source_type === "live_stream" ? "Live stream" : "Upload"}
                      </span>
                    </div>
                  </div>
                  <Badge className={cn(riskTone(session.snapshot.risk_assessment.risk_level), "border")} variant="outline">
                    Risk {session.risk_score}
                  </Badge>
                </div>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
