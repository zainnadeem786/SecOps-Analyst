"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Loader2, Save, Shield, ShieldAlert, Siren, Workflow } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/LoadingState";
import { PanelSection } from "@/components/PanelSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getRules, updateRules } from "@/lib/platform-api";
import type { RulesConfig } from "@/lib/types";

const defaultRules: RulesConfig = {
  brute_force_threshold: 5,
  brute_force_critical_threshold: 10,
  scan_threshold: 10,
  scan_high_threshold: 20,
  probe_threshold: 8,
  probe_high_threshold: 15,
  time_window_seconds: 60,
  campaign_gap_minutes: 30,
  compromise_failure_threshold: 5,
  compromise_success_window_seconds: 300,
  compromise_success_status_codes: [200],
  auth_endpoint_prefixes: ["/login", "/signin", "/auth", "/wp-login.php"],
  path_traversal_threshold: 1,
  path_traversal_critical_threshold: 3,
  path_traversal_patterns: ["../", "..\\", "%2e%2e/", "%2e%2e\\", "..%2f", "..%5c"],
  path_traversal_sensitive_targets: ["/etc/passwd", "/windows/system32", "/winnt/system32", "/proc/self/environ", "/boot.ini"],
  sql_injection_threshold: 1,
  sql_injection_critical_threshold: 3,
  sql_injection_patterns: ["' or '1'='1", "\" or \"1\"=\"1", "union select", "--", ";--", "information_schema", "sleep("],
  command_injection_threshold: 1,
  command_injection_critical_threshold: 3,
  command_injection_patterns: ["; whoami", "; id", "; uname", "; curl", "; wget", "&&", "||", "`", "$("],
  suspicious_user_agent_threshold: 2,
  suspicious_user_agent_critical_threshold: 5,
  suspicious_user_agent_signatures: ["sqlmap", "nikto", "nmap", "curl", "python-requests"],
  suspicious_user_agent_immediate_signatures: ["sqlmap", "nikto", "nmap"],
};

type RulesTab = "core" | "compromise" | "injection" | "agents";

const tabs: Array<{ id: RulesTab; label: string; description: string }> = [
  { id: "core", label: "Core thresholds", description: "Brute-force, scanning, probes, and campaign windows." },
  { id: "compromise", label: "Compromise", description: "Authentication paths and post-failure success correlation." },
  { id: "injection", label: "Traversal & injection", description: "Traversal, SQLi, and command execution signatures." },
  { id: "agents", label: "User agents", description: "Scanner signatures and CLI thresholds." },
];

export function RulesWorkspace() {
  const [rules, setRules] = useState<RulesConfig>(defaultRules);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<RulesTab>("core");

  useEffect(() => {
    void (async () => {
      try {
        setRules(await getRules());
      } catch (error) {
        toast.error("Rules could not be loaded", {
          description: error instanceof Error ? error.message : "Unexpected backend response.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    try {
      const normalized = {
        ...rules,
        auth_endpoint_prefixes: rules.auth_endpoint_prefixes.map((prefix) => prefix.trim()).filter(Boolean),
        compromise_success_status_codes: rules.compromise_success_status_codes.filter((item) => Number.isFinite(item)),
      };
      const saved = await updateRules(normalized);
      setRules(saved);
      toast.success("Rules updated", {
        description: "New thresholds will apply to the next upload or live batch.",
      });
    } catch (error) {
      toast.error("Rules update failed", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab)!;

  return (
    <div className="space-y-6">
      <PanelSection
        title="Rules workspace"
        description="Grouped controls for thresholds, signatures, and correlation windows so analysts can tune detection depth without editing backend code."
        actions={(
          <>
            <Badge variant="outline">Campaign gap {rules.campaign_gap_minutes}m</Badge>
            <Button onClick={() => void handleSave()} disabled={isLoading || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Saving..." : "Save rules"}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === tab.id ? "bg-sky-400/15 text-sky-100" : "bg-[#0f1828] text-slate-400 hover:text-white"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="rounded-[18px] border border-white/8 bg-[#0f1828] px-4 py-4">
            <p className="text-sm font-medium text-white">{activeTabMeta.label}</p>
            <p className="mt-1 text-sm text-slate-400">{activeTabMeta.description}</p>
          </div>

          {isLoading ? <LoadingState label="Loading rule configuration" /> : renderActiveTab(activeTab, rules, setRules)}
        </div>
      </PanelSection>
    </div>
  );
}

function renderActiveTab(activeTab: RulesTab, rules: RulesConfig, setRules: Dispatch<SetStateAction<RulesConfig>>) {
  if (activeTab === "core") {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard icon={<Shield className="h-4 w-4" />} title="Detection thresholds" description="Core severity gates for brute-force, scanning, and probe signals.">
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField label="Brute-force threshold" value={rules.brute_force_threshold} onChange={(value) => setRules((current) => ({ ...current, brute_force_threshold: value }))} />
            <NumberField label="Brute-force critical threshold" value={rules.brute_force_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, brute_force_critical_threshold: value }))} />
            <NumberField label="Scan threshold" value={rules.scan_threshold} onChange={(value) => setRules((current) => ({ ...current, scan_threshold: value }))} />
            <NumberField label="Scan high threshold" value={rules.scan_high_threshold} onChange={(value) => setRules((current) => ({ ...current, scan_high_threshold: value }))} />
            <NumberField label="Probe threshold" value={rules.probe_threshold} onChange={(value) => setRules((current) => ({ ...current, probe_threshold: value }))} />
            <NumberField label="Probe high threshold" value={rules.probe_high_threshold} onChange={(value) => setRules((current) => ({ ...current, probe_high_threshold: value }))} />
          </div>
        </SectionCard>

        <SectionCard icon={<Workflow className="h-4 w-4" />} title="Correlation windows" description="Time windows used to group suspicious behavior into campaigns.">
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField label="Time window (seconds)" value={rules.time_window_seconds} onChange={(value) => setRules((current) => ({ ...current, time_window_seconds: value }))} />
            <NumberField label="Campaign gap (minutes)" value={rules.campaign_gap_minutes} onChange={(value) => setRules((current) => ({ ...current, campaign_gap_minutes: value }))} />
          </div>
        </SectionCard>
      </div>
    );
  }

  if (activeTab === "compromise") {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard icon={<ShieldAlert className="h-4 w-4" />} title="Compromise correlation" description="Detect repeated failed auth followed by a successful login.">
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField label="Failure threshold" value={rules.compromise_failure_threshold} onChange={(value) => setRules((current) => ({ ...current, compromise_failure_threshold: value }))} />
            <NumberField label="Success window (seconds)" value={rules.compromise_success_window_seconds} onChange={(value) => setRules((current) => ({ ...current, compromise_success_window_seconds: value }))} />
          </div>
          <div className="mt-4">
            <ListField
              label="Success status codes"
              value={rules.compromise_success_status_codes.map(String)}
              onChange={(value) => setRules((current) => ({
                ...current,
                compromise_success_status_codes: value.map((item) => Number(item)).filter((item) => Number.isFinite(item)),
              }))}
            />
          </div>
        </SectionCard>

        <SectionCard icon={<Workflow className="h-4 w-4" />} title="Authentication paths" description="Endpoint prefixes treated as authentication surfaces for compromise detection.">
          <ListField
            label="Auth endpoint prefixes"
            value={rules.auth_endpoint_prefixes}
            onChange={(value) => setRules((current) => ({ ...current, auth_endpoint_prefixes: value }))}
          />
        </SectionCard>
      </div>
    );
  }

  if (activeTab === "injection") {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard icon={<ShieldAlert className="h-4 w-4" />} title="Path traversal" description="Thresholds and sensitive target coverage for traversal attempts.">
            <div className="grid gap-4">
              <NumberField label="Traversal threshold" value={rules.path_traversal_threshold} onChange={(value) => setRules((current) => ({ ...current, path_traversal_threshold: value }))} />
              <NumberField label="Traversal critical threshold" value={rules.path_traversal_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, path_traversal_critical_threshold: value }))} />
            </div>
          </SectionCard>
          <SectionCard icon={<ShieldAlert className="h-4 w-4" />} title="SQL injection" description="Match query/body patterns associated with SQLi.">
            <div className="grid gap-4">
              <NumberField label="SQLi threshold" value={rules.sql_injection_threshold} onChange={(value) => setRules((current) => ({ ...current, sql_injection_threshold: value }))} />
              <NumberField label="SQLi critical threshold" value={rules.sql_injection_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, sql_injection_critical_threshold: value }))} />
            </div>
          </SectionCard>
          <SectionCard icon={<ShieldAlert className="h-4 w-4" />} title="Command injection" description="Patterns associated with shell execution or command chaining.">
            <div className="grid gap-4">
              <NumberField label="Command injection threshold" value={rules.command_injection_threshold} onChange={(value) => setRules((current) => ({ ...current, command_injection_threshold: value }))} />
              <NumberField label="Command critical threshold" value={rules.command_injection_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, command_injection_critical_threshold: value }))} />
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard icon={<Workflow className="h-4 w-4" />} title="Traversal patterns" description="Encoded and direct traversal signatures.">
            <ListField label="Traversal patterns" value={rules.path_traversal_patterns} onChange={(value) => setRules((current) => ({ ...current, path_traversal_patterns: value }))} />
          </SectionCard>
          <SectionCard icon={<Workflow className="h-4 w-4" />} title="Sensitive targets" description="Targets that immediately elevate traversal severity.">
            <ListField label="Sensitive traversal targets" value={rules.path_traversal_sensitive_targets} onChange={(value) => setRules((current) => ({ ...current, path_traversal_sensitive_targets: value }))} />
          </SectionCard>
          <SectionCard icon={<Workflow className="h-4 w-4" />} title="Injection signatures" description="SQLi and command execution indicators.">
            <div className="space-y-4">
              <ListField label="SQL injection patterns" value={rules.sql_injection_patterns} onChange={(value) => setRules((current) => ({ ...current, sql_injection_patterns: value }))} />
              <ListField label="Command injection patterns" value={rules.command_injection_patterns} onChange={(value) => setRules((current) => ({ ...current, command_injection_patterns: value }))} />
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <SectionCard icon={<Siren className="h-4 w-4" />} title="Suspicious user-agent thresholds" description="Control when CLI clients and scanners escalate into detections.">
        <div className="grid gap-4">
          <NumberField label="User-agent threshold" value={rules.suspicious_user_agent_threshold} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_threshold: value }))} />
          <NumberField label="User-agent critical threshold" value={rules.suspicious_user_agent_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_critical_threshold: value }))} />
        </div>
      </SectionCard>

      <SectionCard icon={<Workflow className="h-4 w-4" />} title="Signatures" description="Immediate and threshold-based scanner signatures used during detection.">
        <div className="grid gap-4 xl:grid-cols-2">
          <ListField label="Suspicious user-agent signatures" value={rules.suspicious_user_agent_signatures} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_signatures: value }))} />
          <ListField label="Immediate user-agent signatures" value={rules.suspicious_user_agent_immediate_signatures} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_immediate_signatures: value }))} />
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-[#0f1828] px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-white/8 bg-[#0b1422] p-2.5 text-sky-100">{icon}</div>
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</label>
      <textarea
        value={value.join("\n")}
        onChange={(event) => onChange(event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))}
        className="min-h-[160px] w-full rounded-[18px] border border-white/10 bg-[#0b1422] px-4 py-4 text-sm text-slate-100 outline-none transition focus:border-sky-300/30"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Math.max(1, Number(event.target.value || 1)))}
        className="h-11 rounded-2xl border-white/10 bg-[#0b1422] text-slate-100"
      />
    </label>
  );
}
