"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderSearch, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { PanelSection } from "@/components/PanelSection";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCase, listCases } from "@/lib/platform-api";
import type { CaseSummary } from "@/lib/types";
import { formatTimestamp, riskTone } from "@/lib/utils";

export default function CasesPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [sortKey, setSortKey] = useState<"created" | "risk" | "sessions">("created");

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    if (!user) {
      setIsLoadingCases(false);
      return;
    }
    void loadCases();
  }, [isAuthLoading, user]);

  async function loadCases() {
    try {
      setCases(await listCases());
    } catch (error) {
      toast.error("Cases could not be loaded", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    } finally {
      setIsLoadingCases(false);
    }
  }

  async function handleCreateCase() {
    setIsCreating(true);
    try {
      const created = await createCase();
      window.location.href = `/cases/${created.id}`;
    } catch (error) {
      toast.error("Case creation failed", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
      setIsCreating(false);
    }
  }

  const sortedCases = [...cases].sort((left, right) => {
    if (sortKey === "risk") {
      return right.latest_risk_score - left.latest_risk_score;
    }
    if (sortKey === "sessions") {
      return right.session_count - left.session_count;
    }
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });

  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Cases"
          title="Persistent investigation cases"
          description="Review saved investigations, compare risk over time, and jump directly into the next session that needs analyst attention."
          actions={(
            <>
              <div className="inline-flex rounded-full border border-white/8 bg-[#0f1828] p-1">
                {[
                  { id: "created", label: "Newest" },
                  { id: "risk", label: "Highest risk" },
                  { id: "sessions", label: "Most sessions" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSortKey(option.id as typeof sortKey)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${sortKey === option.id ? "bg-sky-400/15 text-sky-100" : "text-slate-400 hover:text-white"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button onClick={handleCreateCase} disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isCreating ? "Creating case..." : "Create case"}
              </Button>
            </>
          )}
        />

        <PanelSection
          title="Case inventory"
          description="Sortable investigation list with recent session activity, latest risk, and repeated attacker context."
          actions={<Badge variant="outline">{cases.length} cases</Badge>}
        >
          {isLoadingCases ? (
            <LoadingState label="Loading saved investigations" />
          ) : cases.length === 0 ? (
            <EmptyState title="No persistent cases exist yet" description="Open the investigation workspace or create an empty case to begin." />
          ) : (
            <div className="overflow-hidden rounded-[20px] border border-white/8">
              <Table>
                <TableHeader className="bg-[#0f1828]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Case</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Latest risk</TableHead>
                    <TableHead>Repeat attackers</TableHead>
                    <TableHead>Latest activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCases.map((item) => (
                    <TableRow key={item.id} className="bg-[#0b1422]">
                      <TableCell>
                        <Link href={`/cases/${item.id}`} className="flex items-center gap-3 text-white transition hover:text-sky-200">
                          <FolderSearch className="h-4 w-4 text-sky-200" />
                          <span className="font-medium">{item.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-400">{formatTimestamp(item.created_at)}</TableCell>
                      <TableCell>{item.session_count}</TableCell>
                      <TableCell>
                        <Badge className={riskTone(item.latest_risk_score > 70 ? "High" : item.latest_risk_score > 30 ? "Medium" : "Low")} variant="outline">
                          {item.latest_risk_score}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.repeated_attacker_count}</TableCell>
                      <TableCell className="text-slate-400">{item.latest_uploaded_at ? formatTimestamp(item.latest_uploaded_at) : "No sessions yet"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </PanelSection>
      </div>
    </RequireAuth>
  );
}
