"use client";

import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InvestigationSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  currentSessionOnly: boolean;
  onToggleCurrentSession: () => void;
  isSearching: boolean;
  sessionCount: number;
  eventCount: number;
  detectionCount: number;
  onClear: () => void;
}

export function InvestigationSearchBar({
  value,
  onChange,
  currentSessionOnly,
  onToggleCurrentSession,
  isSearching,
  sessionCount,
  eventCount,
  detectionCount,
  onClear,
}: InvestigationSearchBarProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Search this case: ip:203.0.113.10 status:401 endpoint:/login"
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={currentSessionOnly ? "default" : "secondary"} onClick={onToggleCurrentSession}>
            {currentSessionOnly ? "Current session only" : "Whole case"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClear} disabled={!value.trim()}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-sky-200" /> : null}
        <span>{sessionCount} matched session(s)</span>
        <span>{eventCount} matched event(s)</span>
        <span>{detectionCount} matched detection(s)</span>
      </div>
    </div>
  );
}
