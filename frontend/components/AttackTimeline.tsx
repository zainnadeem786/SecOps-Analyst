"use client";

import { Crosshair, Radar, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttackCampaign, AttackTimelineItem } from "@/lib/types";
import { cn, formatTimestamp, severityTone } from "@/lib/utils";

interface AttackTimelineProps {
  timeline: AttackTimelineItem[];
  campaigns: AttackCampaign[];
  isLoading: boolean;
  hasResult: boolean;
}

const timelineSkeletonItems = Array.from({ length: 4 });
const phaseIcons = {
  recon: Crosshair,
  scan: Radar,
  attack: ShieldAlert,
  impact: Sparkles,
} as const;

export function AttackTimeline({ timeline, campaigns, isLoading, hasResult }: AttackTimelineProps) {
  const buckets = buildFlowBuckets(campaigns, timeline);
  const [activeBucket, setActiveBucket] = useState<string>(buckets.find((bucket) => bucket.count > 0)?.id ?? "recon");
  const selectedBucket = buckets.find((bucket) => bucket.id === activeBucket && bucket.count > 0)
    ?? buckets.find((bucket) => bucket.count > 0)
    ?? buckets[0];

  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Attack timeline</CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6 text-slate-300">
              A phased attack flow built from correlated campaigns so investigators can move from reconnaissance through impact without reading a long vertical evidence list.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-rose-200">
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-5">
            <div className="grid gap-3 xl:grid-cols-4">
              {timelineSkeletonItems.map((_, index) => (
                <div key={index} className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
                  <Skeleton className="h-16 w-full rounded-2xl" />
                </div>
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        ) : buckets.every((bucket) => bucket.count === 0) ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            {hasResult ? "No suspicious activity detected" : "Upload logs to begin investigation"}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 xl:grid-cols-4">
              {buckets.map((bucket, index) => {
                const Icon = phaseIcons[bucket.id as keyof typeof phaseIcons];
                const isActive = bucket.id === activeBucket;
                return (
                  <button
                    key={bucket.id}
                    type="button"
                    onClick={() => setActiveBucket(bucket.id)}
                    className={cn(
                      "relative rounded-3xl border p-5 text-left transition",
                      isActive
                        ? "border-cyan-300/30 bg-cyan-500/10 shadow-[0_16px_60px_rgba(34,211,238,0.12)]"
                        : "border-white/10 bg-slate-950/35 hover:border-white/20 hover:bg-slate-900/45",
                    )}
                  >
                    {index < buckets.length - 1 ? (
                      <span className="pointer-events-none absolute -right-2 top-1/2 hidden h-px w-4 bg-white/10 xl:block" />
                    ) : null}
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-cyan-100">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-3xl font-semibold text-white">{bucket.count}</span>
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{bucket.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {bucket.count > 0 ? `${bucket.count} mapped event${bucket.count === 1 ? "" : "s"} in this phase.` : "No mapped activity in this phase."}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Selected phase</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">{selectedBucket.label}</h3>
                </div>
                <Badge className="border border-white/10 bg-white/[0.04] text-slate-200" variant="outline">
                  {selectedBucket.count} event{selectedBucket.count === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="mt-5 grid gap-4">
                {selectedBucket.items.slice(0, 6).map((item) => (
                  <article key={`${selectedBucket.id}-${item.ip}-${item.timestamp}-${item.title}`} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                          <time dateTime={item.timestamp}>{formatTimestamp(item.timestamp)}</time>
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-400">
                            {item.ip}
                          </span>
                        </div>
                        <h4 className="mt-3 text-base font-semibold text-white">{item.title}</h4>
                        <p className="mt-2 text-sm leading-7 text-slate-300">{item.description}</p>
                      </div>
                      <Badge className={cn(severityTone(item.severity), "shrink-0")} variant="outline">
                        {item.severity}
                      </Badge>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type FlowItem = {
  timestamp: string;
  title: string;
  description: string;
  severity: AttackTimelineItem["severity"];
  ip: string;
};

function buildFlowBuckets(campaigns: AttackCampaign[], timeline: AttackTimelineItem[]) {
  const buckets = {
    recon: { id: "recon", label: "Recon", count: 0, items: [] as FlowItem[] },
    scan: { id: "scan", label: "Scan", count: 0, items: [] as FlowItem[] },
    attack: { id: "attack", label: "Attack", count: 0, items: [] as FlowItem[] },
    impact: { id: "impact", label: "Impact", count: 0, items: [] as FlowItem[] },
  };

  campaigns.forEach((campaign) => {
    campaign.phases.forEach((phase) => {
      const bucket = phaseToBucket(phase.phase);
      if (!bucket) {
        return;
      }
      phase.events.forEach((event) => {
        buckets[bucket].items.push({
          timestamp: event.timestamp,
          title: event.title,
          description: event.description,
          severity: campaign.severity,
          ip: campaign.attacker_ip,
        });
      });
    });
  });

  if (campaigns.length === 0) {
    timeline.forEach((item) => {
      const bucket = detectionTypeToBucket(item.type);
      buckets[bucket].items.push({
        timestamp: item.timestamp,
        title: item.title,
        description: item.description,
        severity: item.severity,
        ip: item.ip,
      });
    });
  }

  return Object.values(buckets).map((bucket) => ({
    ...bucket,
    count: bucket.items.length,
    items: bucket.items.sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
  }));
}

function phaseToBucket(phase: string): "recon" | "scan" | "attack" | "impact" | null {
  if (phase === "Reconnaissance") {
    return "recon";
  }
  if (phase === "Scanning") {
    return "scan";
  }
  if (phase === "Credential Attacks" || phase === "Exploitation" || phase === "Lateral Movement Hint") {
    return "attack";
  }
  if (phase === "Impact") {
    return "impact";
  }
  return null;
}

function detectionTypeToBucket(type: string): "recon" | "scan" | "attack" | "impact" {
  if (type === "multi_endpoint_probe") {
    return "recon";
  }
  if (type === "scanning_fuzzing" || type === "suspicious_user_agent") {
    return "scan";
  }
  if (type === "account_compromise_suspected") {
    return "impact";
  }
  return "attack";
}
