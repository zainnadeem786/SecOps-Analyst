"use client";

import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface WorkspaceFilters {
  severity: string;
  type: string;
  ip: string;
  endpoint: string;
  campaign: string;
  from: string;
  to: string;
  scope: "case" | "session";
}

interface InvestigationFilterBarProps {
  filters: WorkspaceFilters;
  onChange: (next: WorkspaceFilters) => void;
  severityOptions: string[];
  detectionTypeOptions: string[];
  campaignOptions: string[];
  hasSessionScope: boolean;
  onClear: () => void;
}

export function InvestigationFilterBar({
  filters,
  onChange,
  severityOptions,
  detectionTypeOptions,
  campaignOptions,
  hasSessionScope,
  onClear,
}: InvestigationFilterBarProps) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-[#0b1422] px-4 py-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Investigation filters</p>
            <p className="mt-1 text-sm text-slate-400">Narrow the current investigation without losing table density or drill-down speed.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasSessionScope ? (
              <div className="inline-flex rounded-full border border-white/8 bg-[#101b2b] p-1">
                <ScopeButton
                  label="Case"
                  active={filters.scope === "case"}
                  onClick={() => onChange({ ...filters, scope: "case" })}
                />
                <ScopeButton
                  label="Session"
                  active={filters.scope === "session"}
                  onClick={() => onChange({ ...filters, scope: "session" })}
                />
              </div>
            ) : null}
            <Button variant="ghost" className="rounded-full text-slate-300 hover:text-white" onClick={onClear}>
              <SearchX className="h-4 w-4" />
              Clear filters
            </Button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-6">
          <FilterSelect
            label="Severity"
            value={filters.severity}
            options={severityOptions}
            onChange={(value) => onChange({ ...filters, severity: value })}
          />
          <FilterSelect
            label="Type"
            value={filters.type}
            options={detectionTypeOptions}
            onChange={(value) => onChange({ ...filters, type: value })}
          />
          <FilterInput
            label="Source IP"
            value={filters.ip}
            placeholder="203.0.113.10"
            onChange={(value) => onChange({ ...filters, ip: value })}
          />
          <FilterInput
            label="Endpoint"
            value={filters.endpoint}
            placeholder="/login"
            onChange={(value) => onChange({ ...filters, endpoint: value })}
          />
          <FilterSelect
            label="Campaign"
            value={filters.campaign}
            options={campaignOptions}
            onChange={(value) => onChange({ ...filters, campaign: value })}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
            <FilterDate
              label="From"
              value={filters.from}
              onChange={(value) => onChange({ ...filters, from: value })}
            />
            <FilterDate
              label="To"
              value={filters.to}
              onChange={(value) => onChange({ ...filters, to: value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "bg-sky-400/15 text-sky-100" : "text-slate-400 hover:text-white"}`}
    >
      {label}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f1828] px-3 text-sm text-slate-100 outline-none transition focus:border-sky-300/30"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function FilterInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f1828] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30"
      />
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f1828] px-3 text-sm text-slate-100 outline-none transition focus:border-sky-300/30"
      />
    </label>
  );
}
