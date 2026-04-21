"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { RulesWorkspace } from "@/components/RulesWorkspace";

export default function RulesPage() {
  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Rules"
          title="Detection rule management"
          description="Manage detector thresholds, campaign gap windows, and payload signatures without touching backend code. Changes apply to future uploads and live batches immediately."
        />
        <RulesWorkspace />
      </div>
    </RequireAuth>
  );
}
