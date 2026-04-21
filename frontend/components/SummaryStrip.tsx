import { ShieldAlert, ShieldCheck, Siren, Sparkles, Waves, Workflow } from "lucide-react";

import type { IncidentRiskLevel } from "@/lib/types";
import { cn, riskTone } from "@/lib/utils";

interface SummaryStripProps {
  riskScore: number;
  riskLevel: IncidentRiskLevel;
  campaignCount: number;
  highSeverityCount: number;
  suspiciousIpCount: number;
  recommendedAction: string;
}

export function SummaryStrip({
  riskScore,
  riskLevel,
  campaignCount,
  highSeverityCount,
  suspiciousIpCount,
  recommendedAction,
}: SummaryStripProps) {
  const metrics = [
    { label: "Incident risk", value: String(riskScore), note: riskLevel, icon: ShieldCheck, accent: riskTone(riskLevel) },
    { label: "Campaigns", value: String(campaignCount), note: "Correlated storylines", icon: Workflow },
    { label: "High severity", value: String(highSeverityCount), note: "High + critical findings", icon: ShieldAlert },
    { label: "Suspicious IPs", value: String(suspiciousIpCount), note: "Distinct attacker sources", icon: Siren },
  ];

  return (
    <section className="rounded-[24px] border border-white/8 bg-[#0b1422] shadow-[0_14px_36px_rgba(2,6,23,0.18)]">
      <div className="grid gap-3 border-b border-white/8 px-5 py-4 sm:grid-cols-2 2xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(300px,1.08fr)]">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[18px] border border-white/8 bg-[#0f1828] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{metric.label}</p>
              <metric.icon className="h-4 w-4 text-sky-200" />
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <p className="text-3xl font-semibold text-white">{metric.value}</p>
              {"accent" in metric && metric.accent ? (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", metric.accent)}>{metric.note}</span>
              ) : (
                <span className="pb-1 text-sm text-slate-400">{metric.note}</span>
              )}
            </div>
          </div>
        ))}
        <div className="rounded-[18px] border border-sky-400/12 bg-[#0f1828] px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            <Sparkles className="h-4 w-4 text-sky-200" />
            Primary recommended action
          </div>
          <p className="mt-3 max-w-[52ch] text-sm leading-7 text-slate-100">{recommendedAction}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Waves className="h-3.5 w-3.5" />
            Analyst-focused triage strip
          </div>
        </div>
      </div>
    </section>
  );
}
