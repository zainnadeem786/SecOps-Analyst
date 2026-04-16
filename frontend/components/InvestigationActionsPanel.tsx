"use client";

import { Copy, ShieldBan, TerminalSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UploadResponse } from "@/lib/types";
import { getStrongestSignal } from "@/lib/utils";

interface InvestigationActionsPanelProps {
  result: UploadResponse | null;
  hasResult: boolean;
}

export function InvestigationActionsPanel({ result, hasResult }: InvestigationActionsPanelProps) {
  const topIp =
    result?.attack_campaigns[0]?.attacker_ip ??
    result?.detections[0]?.source_ip ??
    null;
  const query = topIp ? `ip:${topIp}` : "";

  async function copyValue(value: string, label: string) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`, {
        description: value,
      });
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <CardTitle>Investigation actions</CardTitle>
        <CardDescription className="mt-2 leading-6 text-slate-300">
          Analyst next steps, rapid containment commands, and reusable investigation pivots for the current snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasResult ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            Upload logs to begin investigation
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Analyst next steps</p>
              <div className="mt-4 space-y-3">
                {(result?.ai_analysis.next_steps ?? []).map((step, index) => (
                  <div key={`${index}-${step}`} className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm leading-6 text-slate-200">
                    {step}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Fast actions</p>
              <div className="mt-4 grid gap-3">
                <Button type="button" variant="secondary" onClick={() => void copyValue(topIp ? `ufw deny from ${topIp}` : "", "Firewall rule")}>
                  <ShieldBan className="h-4 w-4" />
                  Copy firewall rule
                </Button>
                <Button type="button" variant="secondary" onClick={() => void copyValue(topIp ? `iptables -A INPUT -s ${topIp} -j DROP` : "", "Block IP command")}>
                  <TerminalSquare className="h-4 w-4" />
                  Copy block IP command
                </Button>
                <Button type="button" variant="secondary" onClick={() => void copyValue(query, "Investigation query")}>
                  <Copy className="h-4 w-4" />
                  Copy investigation query
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Strongest signal</p>
              <p className="mt-3 text-sm leading-7 text-slate-200">{getStrongestSignal(result?.detections ?? [])}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
