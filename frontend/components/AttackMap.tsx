"use client";

import dynamic from "next/dynamic";
import { Globe2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttackCampaign, Detection } from "@/lib/types";

const AttackMapInner = dynamic(
  () => import("@/components/AttackMapInner").then((module) => module.AttackMapInner),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[360px] w-full rounded-3xl" />,
  },
);

interface AttackMapProps {
  detections: Detection[];
  campaigns: AttackCampaign[];
  isLoading: boolean;
  hasResult: boolean;
}

export function AttackMap({ detections, campaigns, isLoading, hasResult }: AttackMapProps) {
  const markers = buildMarkers(detections, campaigns);

  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Attack map</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Geographic intelligence for suspicious source IPs, enriched from cached GeoIP lookups when available.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
            <Globe2 className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[360px] w-full rounded-3xl" />
        ) : markers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            {hasResult ? "No suspicious activity detected" : "Upload logs to begin investigation"}
          </div>
        ) : (
          <AttackMapInner markers={markers} />
        )}
      </CardContent>
    </Card>
  );
}

function buildMarkers(detections: Detection[], campaigns: AttackCampaign[]) {
  const map = new Map<
    string,
    {
      key: string;
      ips: string[];
      country: string;
      lat: number;
      lon: number;
      attackCount: number;
      averageRisk: number;
      campaignNames: string[];
    }
  >();

  campaigns.forEach((campaign) => {
    if (!campaign.geo) {
      return;
    }
    const key = `${campaign.geo.country}-${campaign.geo.lat}-${campaign.geo.lon}`;
    const existing = map.get(key) ?? {
      key,
      ips: [],
      country: campaign.geo.country,
      lat: campaign.geo.lat,
      lon: campaign.geo.lon,
      attackCount: 0,
      averageRisk: 0,
      campaignNames: [],
    };
    if (!existing.ips.includes(campaign.attacker_ip)) {
      existing.ips.push(campaign.attacker_ip);
    }
    existing.attackCount += 1;
    existing.averageRisk = Math.round((((existing.averageRisk * (existing.attackCount - 1)) + campaign.risk_score) / existing.attackCount) * 10) / 10;
    if (!existing.campaignNames.includes(campaign.campaign_name)) {
      existing.campaignNames.push(campaign.campaign_name);
    }
    map.set(key, existing);
  });

  detections.forEach((detection) => {
    if (!detection.geo) {
      return;
    }
    const key = `${detection.geo.country}-${detection.geo.lat}-${detection.geo.lon}`;
    const existing = map.get(key) ?? {
      key,
      ips: [],
      country: detection.geo.country,
      lat: detection.geo.lat,
      lon: detection.geo.lon,
      attackCount: 0,
      averageRisk: 0,
      campaignNames: [],
    };
    if (!existing.ips.includes(detection.source_ip)) {
      existing.ips.push(detection.source_ip);
      existing.attackCount += 1;
    }
    map.set(key, existing);
  });

  return [...map.values()].map((marker) => ({
    ...marker,
    label: marker.campaignNames[0] ?? "Suspicious activity cluster",
    detail: `${marker.country} | ${marker.attackCount} attack path${marker.attackCount === 1 ? "" : "s"} | avg risk ${marker.averageRisk || 0}`,
  }));
}
