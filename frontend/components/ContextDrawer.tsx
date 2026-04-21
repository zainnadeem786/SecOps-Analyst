"use client";

import { Copy, Globe2, ShieldBan, TerminalSquare, X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AttackCampaign, AttackTimelineItem, Detection, GeoLocation, ParsedEvent, SessionReference, UploadResponse } from "@/lib/types";
import { cn, formatDetectionLabel, formatTimestamp, riskTone, severityTone, statusCodeTone } from "@/lib/utils";

export type WorkspaceMarkerDetail = {
  country: string;
  ips: string[];
  averageRisk: number;
  attackCount: number;
  label: string;
  geo: GeoLocation;
};

export type WorkspaceSelection =
  | { kind: "detection"; item: Detection; session: SessionReference | null; timestamp?: string | null; endpointSummary?: string | null; campaigns: string[] }
  | { kind: "event"; item: ParsedEvent; session: SessionReference | null; detections: Detection[] }
  | { kind: "campaign"; item: AttackCampaign; session: SessionReference | null }
  | { kind: "timeline"; item: AttackTimelineItem; session: SessionReference | null }
  | { kind: "geo"; item: WorkspaceMarkerDetail; session: SessionReference | null };

interface ContextDrawerProps {
  result: UploadResponse | null;
  selection: WorkspaceSelection | null;
  onClose: () => void;
}

export function ContextDrawer({ result, selection, onClose }: ContextDrawerProps) {
  const topIp = useMemo(() => {
    if (selection) {
      if (selection.kind === "geo") {
        return selection.item.ips[0] ?? null;
      }
      if ("source_ip" in selection.item) {
        return selection.item.source_ip;
      }
      if ("attacker_ip" in selection.item) {
        return selection.item.attacker_ip;
      }
      if ("ip" in selection.item) {
        return selection.item.ip;
      }
    }

    return result?.attack_campaigns[0]?.attacker_ip ?? result?.detections[0]?.source_ip ?? null;
  }, [result, selection]);

  async function copyValue(value: string, label: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`, { description: value });
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  const content = selection ? renderSelection(selection) : renderDefault(result, topIp);

  return (
    <>
      <aside className="hidden 2xl:flex 2xl:min-h-[720px] 2xl:flex-col 2xl:rounded-[24px] 2xl:border 2xl:border-white/8 2xl:bg-[#0b1422] 2xl:shadow-[0_14px_36px_rgba(2,6,23,0.18)]">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Context drawer</p>
            <p className="mt-1 text-sm font-medium text-white">{selection ? content.title : "Analyst context"}</p>
          </div>
          {selection ? (
            <Button variant="ghost" className="rounded-full text-slate-400 hover:text-white" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <DrawerContent result={result} selection={selection} content={content} topIp={topIp} onCopy={copyValue} />
        </div>
      </aside>

      {selection ? (
        <div className="fixed inset-0 z-40 bg-slate-950/70 px-4 py-6 backdrop-blur-sm 2xl:hidden">
          <div className="mx-auto flex h-full max-w-lg flex-col rounded-[24px] border border-white/8 bg-[#0b1422] shadow-[0_20px_60px_rgba(2,6,23,0.36)]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Context drawer</p>
                <p className="mt-1 text-sm font-medium text-white">{content.title}</p>
              </div>
              <Button variant="ghost" className="rounded-full text-slate-400 hover:text-white" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <DrawerContent result={result} selection={selection} content={content} topIp={topIp} onCopy={copyValue} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DrawerContent({
  result,
  selection,
  content,
  topIp,
  onCopy,
}: {
  result: UploadResponse | null;
  selection: WorkspaceSelection | null;
  content: { title: string; summary: ReactNode; details?: ReactNode };
  topIp: string | null;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  const investigationQuery = topIp ? `ip:${topIp}` : "";

  return (
    <div className="space-y-5">
      <section className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
        {content.summary}
      </section>

      {content.details ? (
        <section className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
          {content.details}
        </section>
      ) : null}

      <section className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">AI next steps</p>
        <div className="mt-3 space-y-2">
          {(result?.ai_analysis.next_steps ?? []).map((step) => (
            <div key={step} className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3 text-sm leading-6 text-slate-200">
              {step}
            </div>
          ))}
          {(result?.ai_analysis.next_steps ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">No AI next steps are available for this snapshot.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Containment actions</p>
        <div className="mt-3 grid gap-2">
          <Button type="button" variant="secondary" onClick={() => void onCopy(topIp ? `ufw deny from ${topIp}` : "", "Firewall rule")}>
            <ShieldBan className="h-4 w-4" />
            Copy firewall rule
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onCopy(topIp ? `iptables -A INPUT -s ${topIp} -j DROP` : "", "Block IP command")}>
            <TerminalSquare className="h-4 w-4" />
            Copy block IP command
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onCopy(investigationQuery, "Investigation query")}>
            <Copy className="h-4 w-4" />
            Copy investigation query
          </Button>
        </div>
      </section>

      <section className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Session metadata</p>
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          <MetadataRow label="Case" value={result?.case?.name ?? "Unsaved investigation"} />
          <MetadataRow label="Session" value={selection?.session?.filename ?? result?.session?.filename ?? "Current snapshot"} />
          <MetadataRow label="Captured" value={selection?.session?.uploaded_at ? formatTimestamp(selection.session.uploaded_at) : (result?.session?.uploaded_at ? formatTimestamp(result.session.uploaded_at) : "Current session")} />
          <MetadataRow label="Risk" value={`${result?.risk_assessment.risk_score ?? 0} | ${result?.risk_assessment.risk_level ?? "Low"}`} />
        </div>
      </section>
    </div>
  );
}

function renderDefault(result: UploadResponse | null, topIp: string | null) {
  return {
    title: "Analyst context",
    summary: (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Investigation narrative</p>
        <p className="mt-3 text-sm leading-7 text-slate-100">
          {result?.ai_analysis.explanation ?? "Select a detection, campaign, event, or timeline item to inspect evidence and response context."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("border", riskTone(result?.risk_assessment.risk_level ?? "Low"))}>
            {result?.risk_assessment.risk_level ?? "Low"} risk
          </Badge>
          <Badge variant="outline">{result?.attack_campaigns.length ?? 0} campaigns</Badge>
          {topIp ? <Badge variant="outline">{topIp}</Badge> : null}
        </div>
      </>
    ),
    details: result ? (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Recommended action</p>
        <p className="mt-3 text-sm leading-7 text-slate-300">{result.ai_analysis.recommended_action}</p>
      </>
    ) : undefined,
  };
}

function renderSelection(selection: WorkspaceSelection) {
  if (selection.kind === "detection") {
    return {
      title: "Detection detail",
      summary: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("border", severityTone(selection.item.severity))}>{selection.item.severity}</Badge>
            <Badge variant="outline">{formatDetectionLabel(selection.item.type)}</Badge>
            <Badge variant="outline">{selection.item.source_ip}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-100">{selection.item.description}</p>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            <MetadataRow label="Endpoint" value={selection.endpointSummary ?? "Not derived"} />
            <MetadataRow label="Timestamp" value={selection.timestamp ? formatTimestamp(selection.timestamp) : "Not derived"} />
            <MetadataRow label="Evidence items" value={String(selection.item.evidence.length)} />
            <MetadataRow label="Campaigns" value={selection.campaigns.length ? selection.campaigns.join(", ") : "No campaign link"} />
          </div>
        </>
      ),
      details: (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Evidence preview</p>
          <div className="mt-3 space-y-2">
            {selection.item.evidence.map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </>
      ),
    };
  }

  if (selection.kind === "event") {
    return {
      title: "Raw event detail",
      summary: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selection.item.ip}</Badge>
            <Badge variant="outline" className={statusCodeTone(selection.item.status_code)}>{selection.item.status_code}</Badge>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            <MetadataRow label="Endpoint" value={selection.item.endpoint} />
            <MetadataRow label="Timestamp" value={formatTimestamp(selection.item.timestamp)} />
            <MetadataRow label="Related detections" value={String(selection.detections.length)} />
          </div>
        </>
      ),
      details: (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Related detections</p>
          <div className="mt-3 space-y-2">
            {selection.detections.length ? selection.detections.map((item) => (
              <div key={`${item.type}-${item.source_ip}`} className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3 text-sm text-slate-200">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={severityTone(item.severity)}>{item.severity}</Badge>
                  <span>{formatDetectionLabel(item.type)}</span>
                </div>
                <p className="mt-2 text-slate-400">{item.description}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No related detections matched this event.</p>}
          </div>
        </>
      ),
    };
  }

  if (selection.kind === "campaign") {
    const evidenceCount = selection.item.phases.reduce((total, phase) => total + phase.events.length, 0);
    return {
      title: "Campaign detail",
      summary: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selection.item.attacker_ip}</Badge>
            <Badge variant="outline" className={cn("border", riskTone(selection.item.risk_level))}>
              {selection.item.risk_level} risk {selection.item.risk_score}
            </Badge>
            <Badge variant="outline" className={severityTone(selection.item.severity)}>{selection.item.severity}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-100">{selection.item.campaign_name}</p>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            <MetadataRow label="Phases" value={selection.item.phases.filter((phase) => phase.events.length > 0).map((phase) => phase.phase).join(", ")} />
            <MetadataRow label="Timeline steps" value={String(selection.item.timeline.length)} />
            <MetadataRow label="Evidence items" value={String(evidenceCount)} />
          </div>
        </>
      ),
      details: (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Phase breakdown</p>
          <div className="mt-3 space-y-3">
            {selection.item.phases.filter((phase) => phase.events.length > 0).map((phase) => (
              <div key={phase.phase} className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3">
                <p className="text-sm font-medium text-white">{phase.phase}</p>
                <p className="mt-1 text-xs text-slate-500">{phase.events.length} mapped event{phase.events.length === 1 ? "" : "s"}</p>
                <div className="mt-3 space-y-2">
                  {phase.events.slice(0, 4).map((event) => (
                    <div key={`${event.timestamp}-${event.endpoint}-${event.title}`} className="rounded-2xl border border-white/8 bg-[#101b2b] px-3 py-3 text-sm text-slate-200">
                      <p className="font-medium text-white">{event.title}</p>
                      <p className="mt-1 text-slate-400">{event.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ),
    };
  }

  if (selection.kind === "timeline") {
    return {
      title: "Timeline event detail",
      summary: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selection.item.ip}</Badge>
            <Badge variant="outline" className={severityTone(selection.item.severity)}>{selection.item.severity}</Badge>
            <Badge variant="outline">{formatDetectionLabel(selection.item.type)}</Badge>
          </div>
          <p className="mt-3 text-sm font-medium text-white">{selection.item.title}</p>
          <p className="mt-2 text-sm leading-7 text-slate-300">{selection.item.description}</p>
        </>
      ),
      details: (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Chronology</p>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <MetadataRow label="Timestamp" value={formatTimestamp(selection.item.timestamp)} />
            <MetadataRow label="Source IP" value={selection.item.ip} />
            <MetadataRow label="Classification" value={formatDetectionLabel(selection.item.type)} />
          </div>
        </>
      ),
    };
  }

  return {
    title: "Geo enrichment",
    summary: (
      <>
        <div className="flex items-center gap-2 text-sky-100">
          <Globe2 className="h-4 w-4" />
          <span className="text-sm font-medium text-white">{selection.item.country}</span>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-300">
          <MetadataRow label="Attack paths" value={String(selection.item.attackCount)} />
          <MetadataRow label="Average risk" value={String(selection.item.averageRisk)} />
          <MetadataRow label="IPs" value={selection.item.ips.join(", ")} />
          <MetadataRow label="Coordinates" value={`${selection.item.geo.lat}, ${selection.item.geo.lon}`} />
        </div>
      </>
    ),
    details: (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Marker label</p>
        <p className="mt-3 text-sm leading-7 text-slate-300">{selection.item.label}</p>
      </>
    ),
  };
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[minmax(96px,auto)_minmax(0,1fr)] sm:items-start sm:gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="break-words text-left text-slate-200 sm:text-right">{value}</span>
    </div>
  );
}
