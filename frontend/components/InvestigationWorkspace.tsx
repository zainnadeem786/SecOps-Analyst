"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AIAnalysis } from "@/components/AIAnalysis";
import { AttackCampaigns } from "@/components/AttackCampaigns";
import { AttackMap } from "@/components/AttackMap";
import { AttackTimeline } from "@/components/AttackTimeline";
import { DetectionList } from "@/components/DetectionList";
import { InvestigationActionsPanel } from "@/components/InvestigationActionsPanel";
import { InvestigationSearchBar } from "@/components/InvestigationSearchBar";
import { InvestigatorLayout } from "@/components/InvestigatorLayout";
import { LogsTable } from "@/components/LogsTable";
import { RiskSummary } from "@/components/RiskSummary";
import { SummaryCards } from "@/components/SummaryCards";
import { searchCaseData } from "@/lib/platform-api";
import type { AnalysisStage, SearchResponse, UploadResponse, UploadStatus } from "@/lib/types";

interface InvestigationWorkspaceProps {
  result: UploadResponse | null;
  status: UploadStatus;
  analysisStage: AnalysisStage;
  error: string | null;
  isExporting: boolean;
  onDownload: () => void;
  enableSearch?: boolean;
  canDownload?: boolean;
}

export function InvestigationWorkspace({
  result,
  status,
  analysisStage,
  error,
  isExporting,
  onDownload,
  enableSearch = true,
  canDownload = true,
}: InvestigationWorkspaceProps) {
  const hasResult = Boolean(result);
  const [currentSessionOnly, setCurrentSessionOnly] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const deferredQuery = useDeferredValue(searchQuery);
  const activeCaseId = result?.case?.id ?? null;
  const activeSessionId = result?.session?.id ?? null;

  useEffect(() => {
    if (!enableSearch || !activeCaseId || !deferredQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await searchCaseData(
          deferredQuery.trim(),
          activeCaseId,
          activeSessionId ?? undefined,
          currentSessionOnly,
        );
        if (!cancelled) {
          setSearchResults(response);
        }
      } catch (searchError) {
        if (!cancelled) {
          setSearchResults(null);
          toast.error("Search failed", {
            description: searchError instanceof Error ? searchError.message : "Unexpected backend response.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeCaseId, activeSessionId, currentSessionOnly, deferredQuery, enableSearch]);

  const displayEvents = searchResults ? searchResults.events.map((item) => item.event) : (result?.events ?? []);
  const displayDetections = searchResults ? searchResults.detections.map((item) => item.detection) : (result?.detections ?? []);

  return (
    <section className="space-y-6">
      {enableSearch && activeCaseId ? (
          <InvestigationSearchBar
            value={searchQuery}
            onChange={(value) => {
              const params = new URLSearchParams(searchParams.toString());
              if (value.trim()) {
                params.set("q", value.trim());
              } else {
                params.delete("q");
              }
              const nextQuery = params.toString();
              router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
            }}
            currentSessionOnly={currentSessionOnly}
            onToggleCurrentSession={() => setCurrentSessionOnly((current) => !current)}
            isSearching={isSearching}
          sessionCount={searchResults?.sessions.length ?? (searchQuery.trim() ? 0 : 1)}
          eventCount={displayEvents.length}
          detectionCount={displayDetections.length}
          onClear={() => {
            setSearchResults(null);
            const params = new URLSearchParams(searchParams.toString());
            params.delete("q");
            const nextQuery = params.toString();
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
          }}
        />
      ) : null}
      <InvestigatorLayout
        overviewPanel={(
          <AIAnalysis
            analysis={result?.ai_analysis ?? null}
            status={status}
            analysisStage={analysisStage}
            error={error}
          />
        )}
        summaryPanel={(
          <>
            <RiskSummary
              result={result}
              isLoading={status === "running"}
              hasResult={hasResult}
              isDownloading={isExporting}
              onDownload={onDownload}
              canDownload={canDownload}
            />
            <InvestigationActionsPanel
              result={result}
              hasResult={hasResult}
            />
            <SummaryCards
              result={result}
              isLoading={status === "running"}
              hasResult={hasResult}
            />
          </>
        )}
        flowPanel={(
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <AttackCampaigns
              campaigns={result?.attack_campaigns ?? []}
              isLoading={status === "running"}
              hasResult={hasResult}
            />
            <AttackTimeline
              timeline={result?.timeline ?? []}
              campaigns={result?.attack_campaigns ?? []}
              isLoading={status === "running"}
              hasResult={hasResult}
            />
          </div>
        )}
        evidencePanel={(
          <DetectionList
            detections={displayDetections}
            isLoading={status === "running" || isSearching}
            hasResult={hasResult}
          />
        )}
        logPanel={(
          <LogsTable
            events={displayEvents}
            isLoading={status === "running" || isSearching}
            hasResult={hasResult}
          />
        )}
      />
      <AttackMap
        detections={result?.detections ?? []}
        campaigns={result?.attack_campaigns ?? []}
        isLoading={status === "running"}
        hasResult={hasResult}
      />
    </section>
  );
}
