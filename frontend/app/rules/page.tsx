"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { RulesSettingsPanel } from "@/components/RulesSettingsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_18%),radial-gradient(circle_at_right,_rgba(59,130,246,0.18),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#09101f_48%,_#030712_100%)] pb-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <RequireAuth>
          <Card className="glass-panel rounded-3xl border-white/10 bg-slate-950/55">
            <CardHeader className="pb-4">
              <CardTitle>Detection rules</CardTitle>
              <CardDescription className="mt-2 max-w-3xl leading-6 text-slate-300">
                Manage detector thresholds and auth endpoint prefixes without touching backend code. Changes apply to future uploads and live batches immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RulesSettingsPanel />
            </CardContent>
          </Card>
        </RequireAuth>
      </div>
    </main>
  );
}
