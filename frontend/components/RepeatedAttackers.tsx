"use client";

import { Radar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RepeatedAttacker } from "@/lib/types";

export function RepeatedAttackers({ attackers }: { attackers: RepeatedAttacker[] }) {
  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Repeated attacker IPs</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Suspicious sources that reappeared across multiple saved sessions in the same case.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
            <Radar className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {attackers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            Repeated attacker IPs will appear once the same suspicious source shows up in multiple sessions.
          </div>
        ) : (
          attackers.map((attacker) => (
            <div key={attacker.ip} className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{attacker.ip}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {attacker.latest_geo?.country ?? "Unknown location"}
                  </p>
                </div>
                <Badge variant="outline">{attacker.appearances} appearances</Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
