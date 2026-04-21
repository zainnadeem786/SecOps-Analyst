"use client";

import { Suspense, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { AnalystWorkspace } from "@/components/AnalystWorkspace";
import { LiveModePanel } from "@/components/LiveModePanel";
import { PageHeader } from "@/components/PageHeader";
import { PanelSection } from "@/components/PanelSection";
import { downloadIncidentReport } from "@/lib/api";
import type { CaseReference, UploadResponse } from "@/lib/types";

export default function LiveMonitorPage() {
  const [snapshot, setSnapshot] = useState<UploadResponse | null>(null);
  const [activeCase, setActiveCase] = useState<CaseReference | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const sessionLabel = useMemo(() => {
    if (snapshot?.session?.filename) {
      return snapshot.session.filename;
    }
    if (activeCase?.name) {
      return activeCase.name;
    }
    return "Waiting for stream";
  }, [activeCase?.name, snapshot?.session?.filename]);

  async function handleDownload() {
    if (!snapshot) {
      return;
    }

    setIsExporting(true);
    try {
      const blob = await downloadIncidentReport(snapshot);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${snapshot.session?.filename?.replace(/\.[^.]+$/, "") || "live-session"}-report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success("Live session report downloaded");
    } catch (error) {
      toast.error("Live session report failed", {
        description: error instanceof Error ? error.message : "Unexpected export failure.",
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live monitor"
        title="Real-time SOC stream workspace"
        description="Attach a live WebSocket session, replay test logs in batches, and inspect the final persisted snapshot inside the same analyst workspace."
        actions={(
          <>
            <Badge variant={snapshot ? "success" : "secondary"}>{snapshot ? "Live snapshot ready" : "No persisted snapshot yet"}</Badge>
            <Badge variant="outline">{sessionLabel}</Badge>
          </>
        )}
      />

      <div className="space-y-6">
        <LiveModePanel
          onSnapshot={setSnapshot}
          onCaseReady={setActiveCase}
        />

        <PanelSection
          title="Streaming notes"
          description="Use manual batches for analyst drills or replay a fixture to simulate real traffic. When the session ends, the final snapshot remains available below for search, filtering, and report export."
        >
          <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4 text-sm leading-7 text-slate-300">
            <p>Live mode keeps the active investigation surface focused on the final saved snapshot instead of flooding the main canvas with every intermediate update.</p>
            <p className="mt-3">That makes it easier to review detections, campaigns, timeline steps, and enriched IP context once the stream has been stopped and persisted.</p>
          </div>
        </PanelSection>

        <Suspense fallback={null}>
          <AnalystWorkspace
            result={snapshot}
            status={snapshot ? "success" : "idle"}
            analysisStage="ai"
            error={null}
            isExporting={isExporting}
            onDownload={handleDownload}
            canDownload={Boolean(snapshot)}
          />
        </Suspense>
      </div>
    </div>
  );
}
