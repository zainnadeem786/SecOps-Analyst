"use client";

import { Download, Waves } from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AttackMap } from "@/components/AttackMap";
import { ContextDrawer, type WorkspaceMarkerDetail, type WorkspaceSelection } from "@/components/ContextDrawer";
import { EmptyState } from "@/components/EmptyState";
import { InvestigationFilterBar, type WorkspaceFilters } from "@/components/InvestigationFilterBar";
import { LoadingState } from "@/components/LoadingState";
import { PanelSection } from "@/components/PanelSection";
import { SummaryStrip } from "@/components/SummaryStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchCaseData } from "@/lib/platform-api";
import type {
  AnalysisStage,
  AttackCampaign,
  AttackTimelineItem,
  Detection,
  SearchDetectionMatch,
  SearchEventMatch,
  SessionReference,
  UploadResponse,
  UploadStatus,
} from "@/lib/types";
import { countHighSeverity, countSuspiciousIps, cn, formatDetectionLabel, formatTimestamp, riskTone, severityTone, statusCodeTone } from "@/lib/utils";

type WorkspaceTab = "summary" | "detections" | "campaigns" | "timeline" | "events" | "map" | "report";

type DetectionRow = {
  id: string;
  detection: Detection;
  session: SessionReference | null;
  timestamp: string | null;
  endpointSummary: string | null;
  campaignNames: string[];
};

type EventRow = {
  id: string;
  event: SearchEventMatch["event"];
  session: SessionReference | null;
  detectionCount: number;
};

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "detections", label: "Detections" },
  { id: "campaigns", label: "Campaigns" },
  { id: "timeline", label: "Timeline" },
  { id: "events", label: "Events" },
  { id: "map", label: "Map" },
  { id: "report", label: "Report" },
];

interface AnalystWorkspaceProps {
  result: UploadResponse | null;
  status: UploadStatus;
  analysisStage: AnalysisStage;
  error: string | null;
  isExporting: boolean;
  onDownload: () => void;
  enableSearch?: boolean;
  canDownload?: boolean;
}

const defaultFilters: WorkspaceFilters = {
  severity: "",
  type: "",
  ip: "",
  endpoint: "",
  campaign: "",
  from: "",
  to: "",
  scope: "case",
};

export function AnalystWorkspace({
  result,
  status,
  analysisStage,
  error,
  isExporting,
  onDownload,
  enableSearch = true,
  canDownload = true,
}: AnalystWorkspaceProps) {
  const hasResult = Boolean(result);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchResults, setSearchResults] = useState<{
    events: SearchEventMatch[];
    detections: SearchDetectionMatch[];
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const [expandedDetectionId, setExpandedDetectionId] = useState<string | null>(null);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const query = searchParams.get("q") ?? "";
  const deferredQuery = useDeferredValue(query);
  const activeCaseId = result?.case?.id ?? null;
  const activeSessionId = result?.session?.id ?? null;
  const activeTab = normalizeTab(searchParams.get("tab"), hasResult);
  const filters = readFilters(searchParams, Boolean(activeSessionId));

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
          filters.scope === "session",
        );
        if (!cancelled) {
          setSearchResults({
            events: response.events,
            detections: response.detections,
          });
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
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeCaseId, activeSessionId, deferredQuery, enableSearch, filters.scope]);

  useEffect(() => {
    setSelection(null);
  }, [activeTab]);

  const detectionMatches = useMemo<SearchDetectionMatch[]>(() => {
    if (searchResults) {
      return searchResults.detections;
    }

    return (result?.detections ?? []).map((detection) => ({
      session: result?.session ?? ({ id: "", filename: "Current snapshot", uploaded_at: "", source_type: "upload" } as SessionReference),
      detection,
    }));
  }, [result, searchResults]);

  const eventMatches = useMemo<SearchEventMatch[]>(() => {
    if (searchResults) {
      return searchResults.events;
    }

    return (result?.events ?? []).map((event) => ({
      session: result?.session ?? ({ id: "", filename: "Current snapshot", uploaded_at: "", source_type: "upload" } as SessionReference),
      event,
    }));
  }, [result, searchResults]);

  const detectionRows = useMemo<DetectionRow[]>(() => {
    return detectionMatches.map(({ detection, session }, index) => {
      const evidenceMeta = parseEvidenceMeta(detection.evidence[0] ?? "");
      const campaignNames = (result?.attack_campaigns ?? [])
        .filter((campaign) => campaign.attacker_ip === detection.source_ip)
        .map((campaign) => campaign.campaign_name);

      return {
        id: `${session?.id ?? "current"}-${detection.type}-${detection.source_ip}-${index}`,
        detection,
        session,
        timestamp: evidenceMeta.timestamp ?? findDetectionTimestamp(detection, result?.timeline ?? []),
        endpointSummary: evidenceMeta.endpoint ?? findDetectionEndpoint(detection),
        campaignNames,
      };
    });
  }, [detectionMatches, result?.attack_campaigns, result?.timeline]);

  const eventRows = useMemo<EventRow[]>(() => {
    return eventMatches.map(({ event, session }, index) => ({
      id: `${session?.id ?? "current"}-${event.ip}-${event.timestamp}-${event.endpoint}-${index}`,
      event,
      session,
      detectionCount: detectionRows.filter((row) => row.detection.source_ip === event.ip).length,
    }));
  }, [detectionRows, eventMatches]);

  const filteredDetections = useMemo(() => {
    return detectionRows.filter((row) => matchFilters(filters, {
      severity: row.detection.severity,
      type: row.detection.type,
      ip: row.detection.source_ip,
      endpoint: row.endpointSummary ?? "",
      campaign: row.campaignNames.join(" "),
      timestamp: row.timestamp,
    }, query));
  }, [detectionRows, filters, query]);

  const filteredEvents = useMemo(() => {
    return eventRows.filter((row) => matchFilters(filters, {
      severity: "",
      type: "",
      ip: row.event.ip,
      endpoint: row.event.endpoint,
      campaign: "",
      timestamp: row.event.timestamp,
      status: String(row.event.status_code),
    }, query));
  }, [eventRows, filters, query]);

  const filteredCampaigns = useMemo(() => {
    return (result?.attack_campaigns ?? []).filter((campaign) => {
      const window = getCampaignWindow(campaign);
      const endpointSummary = campaign.phases.flatMap((phase) => phase.events.map((event) => event.endpoint)).join(" ");
      const detectionTypes = campaign.phases.flatMap((phase) => phase.events.map((event) => event.detection_type)).join(" ");

      return matchFilters(filters, {
        severity: campaign.severity,
        type: detectionTypes,
        ip: campaign.attacker_ip,
        endpoint: endpointSummary,
        campaign: campaign.campaign_name,
        timestamp: window.start,
      }, query);
    });
  }, [filters, query, result?.attack_campaigns]);

  const filteredTimeline = useMemo(() => {
    return (result?.timeline ?? []).filter((item) => matchFilters(filters, {
      severity: item.severity,
      type: item.type,
      ip: item.ip,
      endpoint: item.description,
      campaign: item.title,
      timestamp: item.timestamp,
    }, query));
  }, [filters, query, result?.timeline]);

  const mapMarkers = useMemo(() => buildWorkspaceMarkers(filteredCampaigns, filteredDetections.map((row) => row.detection)), [filteredCampaigns, filteredDetections]);
  const severityOptions = useMemo(() => uniqueValues(detectionRows.map((row) => row.detection.severity)), [detectionRows]);
  const detectionTypeOptions = useMemo(() => uniqueValues(detectionRows.map((row) => formatDetectionLabel(row.detection.type))), [detectionRows]);
  const campaignOptions = useMemo(() => uniqueValues((result?.attack_campaigns ?? []).map((campaign) => campaign.campaign_name)), [result?.attack_campaigns]);
  const highSeverityCount = countHighSeverity((result?.detections ?? []).map((item) => item.severity));
  const suspiciousIpCount = countSuspiciousIps(result?.detections ?? []);

  function updateSearchParam(next: Partial<Record<string, string | null>>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function handleFilterChange(nextFilters: WorkspaceFilters) {
    updateSearchParam({
      severity: nextFilters.severity || null,
      type: nextFilters.type || null,
      ip: nextFilters.ip || null,
      endpoint: nextFilters.endpoint || null,
      campaign: nextFilters.campaign || null,
      from: nextFilters.from || null,
      to: nextFilters.to || null,
      scope: nextFilters.scope !== "case" ? nextFilters.scope : null,
    });
  }

  function handleClearFilters() {
    updateSearchParam({
      severity: null,
      type: null,
      ip: null,
      endpoint: null,
      campaign: null,
      from: null,
      to: null,
      scope: null,
    });
  }

  function handleSelectDetection(row: DetectionRow) {
    setSelection({
      kind: "detection",
      item: row.detection,
      session: row.session,
      timestamp: row.timestamp,
      endpointSummary: row.endpointSummary,
      campaigns: row.campaignNames,
    });
  }

  function handleSelectEvent(row: EventRow) {
    setSelection({
      kind: "event",
      item: row.event,
      session: row.session,
      detections: filteredDetections.filter((item) => item.detection.source_ip === row.event.ip).map((item) => item.detection),
    });
  }

  const summaryView = (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <div className="space-y-6">
        <PanelSection title="Analyst narrative" description="Current AI summary, recommended action, and incident framing aligned to the canonical risk score.">
          {status === "running" ? (
            <LoadingState label="Updating analyst narrative" description="The backend is still parsing, detecting, or summarizing the current upload." />
          ) : hasResult ? (
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.44fr)]">
              <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Narrative</p>
                <p className="mt-3 max-w-[68ch] text-sm leading-7 text-slate-100">{result?.ai_analysis.explanation}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn("border", riskTone(result?.ai_analysis.risk_level ?? "Low"))}>
                    {result?.ai_analysis.risk_level} risk
                  </Badge>
                  <Badge variant="outline">Score {result?.ai_analysis.risk_score ?? 0}</Badge>
                  <Badge variant={result?.ai_analysis.source === "fallback" ? "secondary" : "success"}>
                    {result?.ai_analysis.source === "fallback" ? "Fallback" : "Live AI"}
                  </Badge>
                </div>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Recommended action</p>
                <p className="mt-3 max-w-[34ch] text-sm leading-7 text-slate-200">{result?.ai_analysis.recommended_action}</p>
              </div>
            </div>
          ) : (
            <EmptyState title="Upload logs to begin investigation" description="The analyst narrative will appear once the first investigation snapshot is available." />
          )}
        </PanelSection>
      </div>
      <PanelSection title="Investigation timeline" description="Latest timeline steps and the next evidence to inspect.">
        {!hasResult ? (
          <EmptyState title="No suspicious activity detected" description="Timeline steps will appear once detections are correlated into investigation flow." />
        ) : filteredTimeline.length === 0 ? (
          <EmptyState title="Timeline filtered to zero" description="Adjust the current filters or search query to reveal timeline context." />
        ) : (
          <div className="space-y-3">
            {filteredTimeline.slice(0, 6).map((item) => (
              <button
                key={`${item.timestamp}-${item.ip}-${item.type}`}
                type="button"
                onClick={() => setSelection({ kind: "timeline", item, session: result?.session ?? null })}
                className="w-full rounded-[18px] border border-white/8 bg-[#0f1828] px-4 py-4 text-left transition hover:border-white/15 hover:bg-[#111c2d]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.ip}</Badge>
                  <Badge variant="outline" className={severityTone(item.severity)}>{item.severity}</Badge>
                </div>
                <p className="mt-3 text-sm font-medium text-white">{item.title}</p>
                <p className="mt-2 max-w-[60ch] text-sm leading-6 text-slate-400">{item.description}</p>
                <p className="mt-3 text-xs text-slate-500">{formatTimestamp(item.timestamp)}</p>
              </button>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );

  return (
    <section className="space-y-6">
      <SummaryStrip
        riskScore={result?.risk_assessment.risk_score ?? 0}
        riskLevel={result?.risk_assessment.risk_level ?? "Low"}
        campaignCount={result?.attack_campaigns.length ?? 0}
        highSeverityCount={highSeverityCount}
        suspiciousIpCount={suspiciousIpCount}
        recommendedAction={result?.ai_analysis.recommended_action ?? "Upload logs to begin investigation"}
      />

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <PanelSection
            title="Investigation workspace"
            description="A detection-first analyst canvas with structured drill-down, shareable URL state, and persistent context."
            actions={(
              <div className="flex flex-wrap items-center gap-2">
                {query ? <Badge variant="outline">Search: {query}</Badge> : null}
                {isSearching ? <Badge variant="secondary">Searching</Badge> : null}
                <Badge variant={status === "running" ? "secondary" : status === "error" ? "destructive" : hasResult ? "success" : "outline"}>
                  {status === "running" ? `Analyzing ${analysisStage}` : status === "error" ? "Attention needed" : hasResult ? "Workspace ready" : "Waiting for data"}
                </Badge>
              </div>
            )}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 border-b border-white/8 pb-4">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => updateSearchParam({ tab: tab.id })}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      activeTab === tab.id
                        ? "bg-sky-400/15 text-sky-100"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <InvestigationFilterBar
                filters={filters}
                onChange={handleFilterChange}
                severityOptions={severityOptions}
                detectionTypeOptions={detectionTypeOptions}
                campaignOptions={campaignOptions}
                hasSessionScope={Boolean(activeSessionId)}
                onClear={handleClearFilters}
              />

              {status === "running" && !hasResult ? (
                <LoadingState label={`Analysis in progress: ${analysisStage}`} description="The workspace will switch to dense investigation panels as soon as the backend returns a snapshot." />
              ) : status === "error" && !hasResult ? (
                <EmptyState title="Investigation did not complete" description={error ?? "The backend did not return a usable snapshot for this request."} />
              ) : null}

              {activeTab === "summary" ? summaryView : null}
              {activeTab === "detections" ? renderDetectionsTab({ hasResult, filteredDetections, expandedDetectionId, setExpandedDetectionId, handleSelectDetection }) : null}
              {activeTab === "campaigns" ? renderCampaignsTab({ hasResult, filteredCampaigns, expandedCampaignId, setExpandedCampaignId, session: result?.session ?? null, setSelection }) : null}
              {activeTab === "timeline" ? renderTimelineTab({ hasResult, filteredTimeline, session: result?.session ?? null, setSelection }) : null}
              {activeTab === "events" ? renderEventsTab({ hasResult, filteredEvents, handleSelectEvent }) : null}
              {activeTab === "map" ? renderMapTab({ hasResult, mapMarkers, filteredDetections, filteredCampaigns, status, setSelection, session: result?.session ?? null }) : null}
              {activeTab === "report" ? renderReportTab({ hasResult, canDownload, isExporting, onDownload, result }) : null}
            </div>
          </PanelSection>
        </div>

        <ContextDrawer result={result} selection={selection} onClose={() => setSelection(null)} />
      </div>
    </section>
  );
}

function renderDetectionsTab({
  hasResult,
  filteredDetections,
  expandedDetectionId,
  setExpandedDetectionId,
  handleSelectDetection,
}: {
  hasResult: boolean;
  filteredDetections: DetectionRow[];
  expandedDetectionId: string | null;
  setExpandedDetectionId: (value: string | null | ((current: string | null) => string | null)) => void;
  handleSelectDetection: (row: DetectionRow) => void;
}) {
  return (
    <PanelSection
      title="Detections"
      description="Triage suspicious behavior in a dense analyst table with quick evidence preview and contextual drill-down."
      actions={hasResult ? <Badge variant="outline">{filteredDetections.length} visible</Badge> : null}
    >
      {!hasResult ? (
        <EmptyState title="Upload logs to begin investigation" description="Detections will populate here after the upload or live session produces a snapshot." />
      ) : filteredDetections.length === 0 ? (
        <EmptyState title="No detections matched the current view" description="Try clearing filters or broadening the current case/session scope." />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-white/8">
          <Table>
            <TableHeader className="bg-[#0f1828]">
              <TableRow className="hover:bg-transparent">
                <TableHead>Severity</TableHead>
                <TableHead>Source IP</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Campaign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDetections.map((row) => {
                const isExpanded = expandedDetectionId === row.id;
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className="cursor-pointer bg-[#0b1422]"
                      onClick={() => handleSelectDetection(row)}
                    >
                      <TableCell><Badge variant="outline" className={severityTone(row.detection.severity)}>{row.detection.severity}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-slate-100">{row.detection.source_ip}</TableCell>
                      <TableCell>{formatDetectionLabel(row.detection.type)}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-300">{row.endpointSummary ?? "—"}</TableCell>
                      <TableCell className="text-slate-400">{row.timestamp ? formatTimestamp(row.timestamp) : "—"}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedDetectionId((current) => current === row.id ? null : row.id);
                          }}
                          className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300 transition hover:border-white/15 hover:text-white"
                        >
                          {row.detection.evidence.length} items
                        </button>
                      </TableCell>
                      <TableCell className="text-slate-400">{row.campaignNames[0] ?? "Unassigned"}</TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow className="bg-[#0f1828] hover:bg-[#0f1828]">
                        <TableCell colSpan={7}>
                          <div className="space-y-2">
                            {row.detection.evidence.slice(0, 4).map((item) => (
                              <div key={item} className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3 text-sm text-slate-200">
                                {item}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PanelSection>
  );
}

function renderCampaignsTab({
  hasResult,
  filteredCampaigns,
  expandedCampaignId,
  setExpandedCampaignId,
  session,
  setSelection,
}: {
  hasResult: boolean;
  filteredCampaigns: AttackCampaign[];
  expandedCampaignId: string | null;
  setExpandedCampaignId: (value: string | null | ((current: string | null) => string | null)) => void;
  session: SessionReference | null;
  setSelection: (value: WorkspaceSelection | null) => void;
}) {
  return (
    <PanelSection
      title="Attack campaigns"
      description="Grouped attacker storylines with independent time windows, phase coverage, and evidence totals."
      actions={hasResult ? <Badge variant="outline">{filteredCampaigns.length} visible</Badge> : null}
    >
      {!hasResult ? (
        <EmptyState title="No campaigns yet" description="Upload logs to build campaign-level investigation context." />
      ) : filteredCampaigns.length === 0 ? (
        <EmptyState title="No campaigns match the current filters" description="Adjust the view to reveal correlated storylines." />
      ) : (
        <div className="space-y-3">
          {filteredCampaigns.map((campaign) => {
            const key = buildCampaignKey(campaign);
            const isExpanded = expandedCampaignId === key;
            const window = getCampaignWindow(campaign);
            const evidenceCount = campaign.phases.reduce((total, phase) => total + phase.events.length, 0);

            return (
              <div key={key} className="rounded-[20px] border border-white/8 bg-[#0f1828]">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedCampaignId((current) => current === key ? null : key);
                    setSelection({ kind: "campaign", item: campaign, session });
                  }}
                  className="flex w-full flex-col gap-3 px-4 py-4 text-left xl:flex-row xl:items-center xl:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{campaign.attacker_ip}</Badge>
                      <Badge variant="outline" className={cn("border", riskTone(campaign.risk_level))}>
                        {campaign.risk_level} {campaign.risk_score}
                      </Badge>
                      <Badge variant="outline" className={severityTone(campaign.severity)}>{campaign.severity}</Badge>
                    </div>
                    <p className="mt-3 text-base font-semibold text-white">{campaign.campaign_name}</p>
                    <p className="mt-2 text-sm text-slate-400">
                      {window.start ? formatTimestamp(window.start) : "Unknown start"} to {window.end ? formatTimestamp(window.end) : "Unknown end"}
                    </p>
                  </div>
                  <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3 xl:min-w-[360px]">
                    <CampaignMetric label="Phases" value={String(campaign.phases.filter((phase) => phase.events.length > 0).length)} />
                    <CampaignMetric label="Timeline" value={String(campaign.timeline.length)} />
                    <CampaignMetric label="Evidence" value={String(evidenceCount)} />
                  </div>
                </button>
                {isExpanded ? (
                  <div className="border-t border-white/8 px-4 py-4">
                    <div className="grid gap-3 xl:grid-cols-2">
                      {campaign.phases.filter((phase) => phase.events.length > 0).map((phase) => (
                        <div key={phase.phase} className="rounded-[18px] border border-white/8 bg-[#0b1422] px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-white">{phase.phase}</p>
                            <Badge variant="outline">{phase.events.length}</Badge>
                          </div>
                          <div className="mt-3 space-y-2">
                            {phase.events.slice(0, 3).map((event) => (
                              <div key={`${event.timestamp}-${event.endpoint}-${event.title}`} className="rounded-2xl border border-white/8 bg-[#101b2b] px-3 py-3 text-sm text-slate-200">
                                <p className="font-medium text-white">{event.title}</p>
                                <p className="mt-1 text-slate-400">{event.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </PanelSection>
  );
}

function renderTimelineTab({
  hasResult,
  filteredTimeline,
  session,
  setSelection,
}: {
  hasResult: boolean;
  filteredTimeline: AttackTimelineItem[];
  session: SessionReference | null;
  setSelection: (value: WorkspaceSelection | null) => void;
}) {
  return (
    <PanelSection
      title="Attack timeline"
      description="Structured chronology for the current investigation, optimized for fast review rather than long card stacks."
      actions={hasResult ? <Badge variant="outline">{filteredTimeline.length} visible</Badge> : null}
    >
      {!hasResult ? (
        <EmptyState title="No suspicious activity detected" description="Timeline items will appear when the current snapshot contains suspicious findings." />
      ) : filteredTimeline.length === 0 ? (
        <EmptyState title="No timeline items match the current view" description="Adjust search or filters to restore the current chronology." />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-white/8">
          <Table>
            <TableHeader className="bg-[#0f1828]">
              <TableRow className="hover:bg-transparent">
                <TableHead>Timestamp</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTimeline.map((item) => (
                <TableRow
                  key={`${item.timestamp}-${item.ip}-${item.type}-${item.title}`}
                  className="cursor-pointer bg-[#0b1422]"
                  onClick={() => setSelection({ kind: "timeline", item, session })}
                >
                  <TableCell className="text-slate-400">{formatTimestamp(item.timestamp)}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-100">{item.ip}</TableCell>
                  <TableCell>{formatDetectionLabel(item.type)}</TableCell>
                  <TableCell className="text-white">{item.title}</TableCell>
                  <TableCell><Badge variant="outline" className={severityTone(item.severity)}>{item.severity}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PanelSection>
  );
}

function renderEventsTab({
  hasResult,
  filteredEvents,
  handleSelectEvent,
}: {
  hasResult: boolean;
  filteredEvents: EventRow[];
  handleSelectEvent: (row: EventRow) => void;
}) {
  return (
    <PanelSection
      title="Parsed events"
      description="Dense event table with sticky headers, compact scanning, and raw detail drill-down."
      actions={hasResult ? <Badge variant="outline">{filteredEvents.length} visible</Badge> : null}
    >
      {!hasResult ? (
        <EmptyState title="Upload logs to begin investigation" description="Parsed events will appear here once a snapshot is available." />
      ) : filteredEvents.length === 0 ? (
        <EmptyState title="No parsed events match the current view" description="The current search or filters removed all events from the active workspace." />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-white/8">
          <div className="max-h-[620px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-[#0f1828]">
                <TableRow className="hover:bg-transparent">
                  <TableHead>IP</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Related detections</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer bg-[#0b1422]"
                    onClick={() => handleSelectEvent(row)}
                  >
                    <TableCell className="font-mono text-xs text-slate-100">{row.event.ip}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{row.event.endpoint}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusCodeTone(row.event.status_code)}>{row.event.status_code}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">{formatTimestamp(row.event.timestamp)}</TableCell>
                    <TableCell className="text-slate-400">{row.detectionCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </PanelSection>
  );
}

function renderMapTab({
  hasResult,
  mapMarkers,
  filteredDetections,
  filteredCampaigns,
  status,
  setSelection,
  session,
}: {
  hasResult: boolean;
  mapMarkers: WorkspaceMarkerDetail[];
  filteredDetections: DetectionRow[];
  filteredCampaigns: AttackCampaign[];
  status: UploadStatus;
  setSelection: (value: WorkspaceSelection | null) => void;
  session: SessionReference | null;
}) {
  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <AttackMap
        detections={filteredDetections.map((row) => row.detection)}
        campaigns={filteredCampaigns}
        isLoading={status === "running" && !hasResult}
        hasResult={hasResult}
      />
      <PanelSection
        title="Geographic enrichment"
        description="Supporting location list for suspicious source IPs, keyed to the same current investigation filters."
      >
        {!hasResult ? (
          <EmptyState title="Upload logs to begin investigation" description="Map intelligence appears once suspicious source IPs are enriched with GeoIP data." />
        ) : mapMarkers.length === 0 ? (
          <EmptyState title="No GeoIP markers are visible" description="The current view has no enriched suspicious sources or the filters removed them." />
        ) : (
          <div className="space-y-3">
            {mapMarkers.map((marker) => (
              <button
                key={`${marker.country}-${marker.geo.lat}-${marker.geo.lon}-${marker.ips.join("-")}`}
                type="button"
                onClick={() => setSelection({ kind: "geo", item: marker, session })}
                className="w-full rounded-[18px] border border-white/8 bg-[#0f1828] px-4 py-4 text-left transition hover:border-white/15 hover:bg-[#111c2d]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{marker.country}</p>
                  <Badge variant="outline">{marker.attackCount} paths</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">{marker.label}</p>
                <p className="mt-3 font-mono text-xs text-sky-100">{marker.ips.join(", ")}</p>
                <p className="mt-2 text-xs text-slate-500">Avg risk {marker.averageRisk}</p>
              </button>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}

function renderReportTab({
  hasResult,
  canDownload,
  isExporting,
  onDownload,
  result,
}: {
  hasResult: boolean;
  canDownload: boolean;
  isExporting: boolean;
  onDownload: () => void;
  result: UploadResponse | null;
}) {
  return (
    <div className="space-y-6">
      <PanelSection
        title="Incident report export"
        description="Review the report scope before exporting the current analyzed snapshot as PDF."
        actions={canDownload ? (
          <Button onClick={onDownload} disabled={isExporting || !hasResult}>
            {isExporting ? <Waves className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
            {isExporting ? "Generating report..." : "Download incident report"}
          </Button>
        ) : null}
      >
        {!hasResult ? (
          <EmptyState title="No reportable snapshot yet" description="Upload a log file or finish a live session to generate an exportable incident report." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Included sections</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                {["Executive summary", "Risk assessment", "Attack campaigns", "Attack timeline", "AI analysis", "Detections"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3">{item}</div>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Snapshot details</p>
              <div className="mt-3 space-y-3">
                <ReportDetailItem label="Case" value={result?.case?.name ?? "Current investigation"} />
                <ReportDetailItem label="Filename" value={result?.session?.filename ?? "Current snapshot"} />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
                  <ReportStatItem label="Campaigns" value={String(result?.attack_campaigns.length ?? 0)} />
                  <ReportStatItem label="Timeline steps" value={String(result?.timeline.length ?? 0)} />
                  <ReportStatItem label="Detections" value={String(result?.detections.length ?? 0)} />
                </div>
              </div>
            </div>
          </div>
        )}
      </PanelSection>
      <PanelSection
        title="Report narrative"
        description="A clean preview of the main narrative and analyst action that will shape the exported document."
      >
        {!hasResult ? (
          <EmptyState title="Report narrative unavailable" description="The export preview is generated from the current analyzed snapshot." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">AI explanation</p>
              <p className="mt-3 max-w-[68ch] text-sm leading-7 text-slate-100">{result?.ai_analysis.explanation}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Recommended action</p>
              <p className="mt-3 max-w-[40ch] text-sm leading-7 text-slate-100">{result?.ai_analysis.recommended_action}</p>
            </div>
          </div>
        )}
      </PanelSection>
    </div>
  );
}

function normalizeTab(value: string | null, hasResult: boolean): WorkspaceTab {
  const valid = tabs.some((tab) => tab.id === value);
  if (valid) {
    return value as WorkspaceTab;
  }
  return hasResult ? "detections" : "summary";
}

function readFilters(searchParams: URLSearchParams, hasSessionScope: boolean): WorkspaceFilters {
  return {
    severity: searchParams.get("severity") ?? defaultFilters.severity,
    type: searchParams.get("type") ?? defaultFilters.type,
    ip: searchParams.get("ip") ?? defaultFilters.ip,
    endpoint: searchParams.get("endpoint") ?? defaultFilters.endpoint,
    campaign: searchParams.get("campaign") ?? defaultFilters.campaign,
    from: searchParams.get("from") ?? defaultFilters.from,
    to: searchParams.get("to") ?? defaultFilters.to,
    scope: hasSessionScope && searchParams.get("scope") === "session" ? "session" : "case",
  };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function matchFilters(
  filters: WorkspaceFilters,
  record: {
    severity: string;
    type: string;
    ip: string;
    endpoint: string;
    campaign: string;
    timestamp: string | null;
    status?: string;
  },
  query: string,
) {
  if (filters.severity && !record.severity.toLowerCase().includes(filters.severity.toLowerCase())) {
    return false;
  }
  if (filters.type && !formatDetectionLabel(record.type).toLowerCase().includes(filters.type.toLowerCase())) {
    return false;
  }
  if (filters.ip && !record.ip.toLowerCase().includes(filters.ip.toLowerCase())) {
    return false;
  }
  if (filters.endpoint && !record.endpoint.toLowerCase().includes(filters.endpoint.toLowerCase())) {
    return false;
  }
  if (filters.campaign && !record.campaign.toLowerCase().includes(filters.campaign.toLowerCase())) {
    return false;
  }

  if (filters.from && record.timestamp) {
    const fromTime = new Date(filters.from).getTime();
    const recordTime = new Date(record.timestamp).getTime();
    if (!Number.isNaN(fromTime) && !Number.isNaN(recordTime) && recordTime < fromTime) {
      return false;
    }
  }

  if (filters.to && record.timestamp) {
    const toTime = new Date(filters.to).getTime();
    const recordTime = new Date(record.timestamp).getTime();
    if (!Number.isNaN(toTime) && !Number.isNaN(recordTime) && recordTime > toTime) {
      return false;
    }
  }

  if (query && !matchesSearchQuery(query, record)) {
    return false;
  }

  return true;
}

function matchesSearchQuery(
  query: string,
  record: {
    type: string;
    ip: string;
    endpoint: string;
    campaign: string;
    status?: string;
  },
) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => {
    if (token.startsWith("ip:")) {
      return record.ip.toLowerCase().includes(token.slice(3));
    }
    if (token.startsWith("endpoint:")) {
      return record.endpoint.toLowerCase().includes(token.slice(9));
    }
    if (token.startsWith("status:")) {
      return (record.status ?? "").includes(token.slice(7));
    }
    if (token.startsWith("type:")) {
      return formatDetectionLabel(record.type).toLowerCase().includes(token.slice(5));
    }

    const haystack = [record.ip, record.endpoint, record.campaign, formatDetectionLabel(record.type), record.status ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(token);
  });
}

function parseEvidenceMeta(value: string) {
  const parts = value.split(" | ");
  return {
    timestamp: parts[0] ?? null,
    endpoint: parts[1] ?? null,
  };
}

function findDetectionTimestamp(detection: Detection, timeline: AttackTimelineItem[]) {
  return timeline.find((item) => item.ip === detection.source_ip && item.type === detection.type)?.timestamp ?? null;
}

function findDetectionEndpoint(detection: Detection) {
  const parsed = parseEvidenceMeta(detection.evidence[0] ?? "");
  return parsed.endpoint;
}

function buildCampaignKey(campaign: AttackCampaign) {
  const window = getCampaignWindow(campaign);
  return [campaign.attacker_ip, campaign.campaign_name, window.start ?? "no-start", window.end ?? "no-end", campaign.risk_score].join("-");
}

function getCampaignWindow(campaign: AttackCampaign) {
  const timestamps = [
    ...campaign.timeline.map((item) => item.timestamp),
    ...campaign.phases.flatMap((phase) => phase.events.map((event) => event.timestamp)),
  ].filter(Boolean).sort();

  return {
    start: timestamps[0] ?? null,
    end: timestamps.at(-1) ?? null,
  };
}

function buildWorkspaceMarkers(campaigns: AttackCampaign[], detections: Detection[]): WorkspaceMarkerDetail[] {
  const map = new Map<string, WorkspaceMarkerDetail>();

  campaigns.forEach((campaign) => {
    if (!campaign.geo) {
      return;
    }
    const key = `${campaign.geo.country}-${campaign.geo.lat}-${campaign.geo.lon}`;
    const existing = map.get(key) ?? {
      country: campaign.geo.country,
      ips: [],
      averageRisk: 0,
      attackCount: 0,
      label: campaign.campaign_name,
      geo: campaign.geo,
    };
    if (!existing.ips.includes(campaign.attacker_ip)) {
      existing.ips.push(campaign.attacker_ip);
    }
    existing.attackCount += 1;
    existing.averageRisk = Math.round((((existing.averageRisk * (existing.attackCount - 1)) + campaign.risk_score) / existing.attackCount) * 10) / 10;
    map.set(key, existing);
  });

  detections.forEach((detection) => {
    if (!detection.geo) {
      return;
    }
    const key = `${detection.geo.country}-${detection.geo.lat}-${detection.geo.lon}`;
    const existing = map.get(key) ?? {
      country: detection.geo.country,
      ips: [],
      averageRisk: 0,
      attackCount: 0,
      label: formatDetectionLabel(detection.type),
      geo: detection.geo,
    };
    if (!existing.ips.includes(detection.source_ip)) {
      existing.ips.push(detection.source_ip);
      existing.attackCount += 1;
    }
    map.set(key, existing);
  });

  return [...map.values()].sort((left, right) => right.attackCount - left.attackCount || right.averageRisk - left.averageRisk);
}

function CampaignMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function ReportDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-base leading-7 text-slate-100">{value}</p>
    </div>
  );
}

function ReportStatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0b1422] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
