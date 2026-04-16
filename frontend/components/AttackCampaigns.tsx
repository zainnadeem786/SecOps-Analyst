import { AlertTriangle, ArrowRight, Network, Radar, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttackCampaign, CampaignEventSummary, CampaignPhase } from "@/lib/types";
import { cn, formatTimestamp, riskTone, severityTone } from "@/lib/utils";

interface AttackCampaignsProps {
  campaigns: AttackCampaign[];
  isLoading: boolean;
  hasResult: boolean;
}

const phaseIconMap: Record<string, typeof Radar> = {
  Reconnaissance: Radar,
  Scanning: Network,
  "Credential Attacks": ShieldAlert,
  "Lateral Movement Hint": ArrowRight,
};

export function AttackCampaigns({ campaigns, isLoading, hasResult }: AttackCampaignsProps) {
  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Attack campaigns</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Correlated suspicious activity grouped into attacker storylines so investigators can review behavior by campaign instead of isolated detections.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
            <Network className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))
        ) : campaigns.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            {hasResult ? "No attack campaigns were correlated for this upload." : "Correlated attack campaigns will appear here after analysis."}
          </div>
        ) : (
          campaigns.map((campaign) => {
            const populatedPhases = campaign.phases.filter((phase) => phase.events.length > 0);
            const previewEvents = buildPreviewEvents(populatedPhases);

            return (
              <article
                key={`${campaign.attacker_ip}-${campaign.campaign_name}`}
                className="rounded-3xl border border-white/10 bg-slate-950/35 p-5 transition duration-200 hover:border-white/20 hover:bg-slate-900/45"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{campaign.attacker_ip}</Badge>
                      <Badge className={cn(riskTone(campaign.risk_level), "border")} variant="outline">
                        Risk {campaign.risk_level} ({campaign.risk_score})
                      </Badge>
                      <Badge className={cn(severityTone(campaign.severity), "border")} variant="outline">
                        {campaign.severity}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{campaign.campaign_name}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {campaign.timeline.length} correlated timeline step(s) and {populatedPhases.length} populated phase(s) were linked to this attacker.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {populatedPhases.map((phase) => (
                      <PhaseBadge key={`${campaign.attacker_ip}-${phase.phase}`} phase={phase} />
                    ))}
                  </div>

                  {previewEvents.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Campaign highlights</p>
                      {previewEvents.map((event) => (
                        <div
                          key={`${campaign.attacker_ip}-${event.timestamp}-${event.endpoint}-${event.detection_type}-${event.title}`}
                          className="rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>{formatTimestamp(event.timestamp)}</span>
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-slate-300">
                              {event.endpoint}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-100">{event.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-300">{event.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function PhaseBadge({ phase }: { phase: CampaignPhase }) {
  const Icon = phaseIconMap[phase.phase] ?? AlertTriangle;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-200">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span>{phase.phase}</span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{phase.events.length}</span>
    </div>
  );
}

function buildPreviewEvents(phases: CampaignPhase[]): CampaignEventSummary[] {
  const seen = new Set<string>();
  const previewEvents: CampaignEventSummary[] = [];

  for (const phase of phases) {
    for (const event of phase.events) {
      const eventKey = [event.timestamp, event.endpoint, event.detection_type, event.title].join("|");
      if (seen.has(eventKey)) {
        continue;
      }

      seen.add(eventKey);
      previewEvents.push(event);
      break;
    }

    if (previewEvents.length >= 3) {
      break;
    }
  }

  return previewEvents;
}
