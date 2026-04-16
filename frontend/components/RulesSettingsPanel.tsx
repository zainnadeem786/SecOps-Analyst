"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function RulesSettingsPanel() {
  const [rules, setRules] = useState<RulesConfig>(defaultRules);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Rule settings</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Edit live detector thresholds without changing backend code. Saved values apply immediately to uploads and live batches.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
            <Settings2 className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField label="Brute-force threshold" value={rules.brute_force_threshold} onChange={(value) => setRules((current) => ({ ...current, brute_force_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Brute-force critical threshold" value={rules.brute_force_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, brute_force_critical_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Scan threshold" value={rules.scan_threshold} onChange={(value) => setRules((current) => ({ ...current, scan_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Scan high threshold" value={rules.scan_high_threshold} onChange={(value) => setRules((current) => ({ ...current, scan_high_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Probe threshold" value={rules.probe_threshold} onChange={(value) => setRules((current) => ({ ...current, probe_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Probe high threshold" value={rules.probe_high_threshold} onChange={(value) => setRules((current) => ({ ...current, probe_high_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Time window (seconds)" value={rules.time_window_seconds} onChange={(value) => setRules((current) => ({ ...current, time_window_seconds: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Campaign gap (minutes)" value={rules.campaign_gap_minutes} onChange={(value) => setRules((current) => ({ ...current, campaign_gap_minutes: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Compromise failure threshold" value={rules.compromise_failure_threshold} onChange={(value) => setRules((current) => ({ ...current, compromise_failure_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Compromise success window (seconds)" value={rules.compromise_success_window_seconds} onChange={(value) => setRules((current) => ({ ...current, compromise_success_window_seconds: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Traversal threshold" value={rules.path_traversal_threshold} onChange={(value) => setRules((current) => ({ ...current, path_traversal_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Traversal critical threshold" value={rules.path_traversal_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, path_traversal_critical_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="SQL injection threshold" value={rules.sql_injection_threshold} onChange={(value) => setRules((current) => ({ ...current, sql_injection_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="SQL injection critical threshold" value={rules.sql_injection_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, sql_injection_critical_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Command injection threshold" value={rules.command_injection_threshold} onChange={(value) => setRules((current) => ({ ...current, command_injection_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Command injection critical threshold" value={rules.command_injection_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, command_injection_critical_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Suspicious user-agent threshold" value={rules.suspicious_user_agent_threshold} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_threshold: value }))} disabled={isLoading || isSaving} />
          <NumberField label="Suspicious user-agent critical threshold" value={rules.suspicious_user_agent_critical_threshold} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_critical_threshold: value }))} disabled={isLoading || isSaving} />
        </div>

        <ListField label="Auth endpoint prefixes" value={rules.auth_endpoint_prefixes} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, auth_endpoint_prefixes: value }))} />
        <ListField label="Traversal patterns" value={rules.path_traversal_patterns} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, path_traversal_patterns: value }))} />
        <ListField label="Sensitive traversal targets" value={rules.path_traversal_sensitive_targets} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, path_traversal_sensitive_targets: value }))} />
        <ListField label="SQL injection patterns" value={rules.sql_injection_patterns} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, sql_injection_patterns: value }))} />
        <ListField label="Command injection patterns" value={rules.command_injection_patterns} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, command_injection_patterns: value }))} />
        <ListField label="Suspicious user-agent signatures" value={rules.suspicious_user_agent_signatures} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_signatures: value }))} />
        <ListField label="Immediate user-agent signatures" value={rules.suspicious_user_agent_immediate_signatures} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, suspicious_user_agent_immediate_signatures: value }))} />
        <ListField label="Compromise success status codes" value={rules.compromise_success_status_codes.map(String)} disabled={isLoading || isSaving} onChange={(value) => setRules((current) => ({ ...current, compromise_success_status_codes: value.map((item) => Number(item)).filter((item) => Number.isFinite(item)) }))} />

        <Button onClick={handleSave} disabled={isLoading || isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "Saving rules..." : "Save rules"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ListField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-100">
        {label}
      </label>
      <textarea
        value={value.join("\n")}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))}
        className="min-h-[140px] w-full rounded-3xl border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-slate-100 outline-none transition focus:border-sky-300/40"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="space-y-3">
      <span className="text-sm font-medium text-slate-100">{label}</span>
      <Input
        type="number"
        min={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Math.max(1, Number(event.target.value || 1)))}
      />
    </label>
  );
}
