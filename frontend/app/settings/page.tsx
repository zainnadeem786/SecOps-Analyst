"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, MonitorCog, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { PanelSection } from "@/components/PanelSection";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/platform-api";
import type { APIKeyScope, APIKeySummary } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

type LocalPreferences = {
  timezone: "utc" | "local";
  density: "comfortable" | "compact";
  autoOpenDrawer: boolean;
  mapAutoFocus: boolean;
};

type RevealedKeyState = {
  value: string;
  name: string;
  scope: APIKeyScope;
} | null;

const preferenceStorageKey = "secops-workspace-preferences";

const defaultPreferences: LocalPreferences = {
  timezone: "utc",
  density: "comfortable",
  autoOpenDrawer: true,
  mapAutoFocus: true,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<APIKeySummary[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Primary ingest key");
  const [newKeyScope, setNewKeyScope] = useState<APIKeyScope>("ingest");
  const [revealedKey, setRevealedKey] = useState<RevealedKeyState>(null);
  const [preferences, setPreferences] = useState<LocalPreferences>(defaultPreferences);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(preferenceStorageKey);
      if (raw) {
        setPreferences({ ...defaultPreferences, ...(JSON.parse(raw) as Partial<LocalPreferences>) });
      }
    } catch {
      setPreferences(defaultPreferences);
    }
  }, []);

  useEffect(() => {
    void loadApiKeys();
  }, []);

  async function loadApiKeys() {
    try {
      setApiKeys(await listApiKeys());
    } catch (error) {
      toast.error("API keys could not be loaded", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    } finally {
      setIsLoadingKeys(false);
    }
  }

  async function handleCreateKey() {
    setIsCreating(true);
    try {
      const response = await createApiKey(newKeyName.trim() || "Workspace key", newKeyScope);
      setApiKeys((current) => [response.key, ...current]);
      setRevealedKey({
        value: response.api_key,
        name: response.key.name,
        scope: response.key.scope,
      });
      toast.success("API key created", {
        description: "Copy the plaintext key now. It will not be shown again.",
      });
    } catch (error) {
      toast.error("API key creation failed", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    try {
      const revoked = await revokeApiKey(keyId);
      setApiKeys((current) => current.map((item) => (item.id === keyId ? revoked : item)));
      toast.success("API key revoked");
    } catch (error) {
      toast.error("API key revocation failed", {
        description: error instanceof Error ? error.message : "Unexpected backend response.",
      });
    }
  }

  async function handleCopyKey() {
    if (!revealedKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(revealedKey.value);
      toast.success("Plaintext API key copied");
    } catch {
      toast.error("The API key could not be copied.");
    }
  }

  function closeRevealedKeyModal() {
    setRevealedKey(null);
  }

  async function savePreferences() {
    setIsSavingPreferences(true);
    try {
      window.localStorage.setItem(preferenceStorageKey, JSON.stringify(preferences));
      toast.success("Workspace preferences saved");
    } finally {
      setIsSavingPreferences(false);
    }
  }

  const activeKeyCount = useMemo(() => apiKeys.filter((item) => !item.revoked_at).length, [apiKeys]);

  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Workspace defaults and integration keys"
          description="Manage API-key ingestion, tune local investigation preferences, and keep the analyst workstation aligned with the way your team actually triages incidents."
          actions={(
            <>
              <Badge variant="outline">{activeKeyCount} active keys</Badge>
              <Badge variant="secondary">{user?.email ?? "Analyst"}</Badge>
            </>
          )}
        />

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <PanelSection
            title="API key management"
            description="Create scoped ingest or read keys for platform integrations without exposing cookie-based credentials."
          >
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_auto]">
                <Input
                  value={newKeyName}
                  onChange={(event) => setNewKeyName(event.target.value)}
                  placeholder="Key name"
                  className="h-11 rounded-2xl border-white/10 bg-[#0f1828] text-slate-100"
                />
                <select
                  value={newKeyScope}
                  onChange={(event) => setNewKeyScope(event.target.value as APIKeyScope)}
                  className="h-11 rounded-2xl border border-white/10 bg-[#0f1828] px-3 text-sm text-slate-100 outline-none transition focus:border-sky-300/30"
                >
                  <option value="ingest">Ingest scope</option>
                  <option value="read">Read scope</option>
                </select>
                <Button onClick={() => void handleCreateKey()} disabled={isCreating}>
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {isCreating ? "Creating..." : "Create key"}
                </Button>
              </div>

              {isLoadingKeys ? (
                <LoadingState label="Loading API keys" />
              ) : apiKeys.length === 0 ? (
                <EmptyState title="No API keys created yet" description="Create an ingest key for uploads or a read key for reporting integrations." />
              ) : (
                <div className="overflow-hidden rounded-[20px] border border-white/8">
                  <Table>
                    <TableHeader className="bg-[#0f1828]">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Name</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.map((key) => (
                        <TableRow key={key.id} className="bg-[#0b1422]">
                          <TableCell className="font-medium text-white">{key.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{key.scope}</Badge>
                          </TableCell>
                          <TableCell className="text-slate-400">{formatTimestamp(key.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant={key.revoked_at ? "secondary" : "success"}>
                              {key.revoked_at ? "Revoked" : "Active"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              className="rounded-full text-slate-300 hover:text-white"
                              onClick={() => void handleRevokeKey(key.id)}
                              disabled={Boolean(key.revoked_at)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </PanelSection>

          <div className="space-y-6">
            <PanelSection
              title="Local workspace defaults"
              description="Client-side display preferences used until a backend settings API exists."
            >
              <div className="space-y-4">
                <PreferenceGroup
                  label="Timezone display"
                  description="Choose how timestamps render in investigation views."
                >
                  <PreferenceToggle
                    label="UTC"
                    active={preferences.timezone === "utc"}
                    onClick={() => setPreferences((current) => ({ ...current, timezone: "utc" }))}
                  />
                  <PreferenceToggle
                    label="Local"
                    active={preferences.timezone === "local"}
                    onClick={() => setPreferences((current) => ({ ...current, timezone: "local" }))}
                  />
                </PreferenceGroup>

                <PreferenceGroup
                  label="Density"
                  description="Optimize the table-heavy workspace for compact or comfortable reading."
                >
                  <PreferenceToggle
                    label="Comfortable"
                    active={preferences.density === "comfortable"}
                    onClick={() => setPreferences((current) => ({ ...current, density: "comfortable" }))}
                  />
                  <PreferenceToggle
                    label="Compact"
                    active={preferences.density === "compact"}
                    onClick={() => setPreferences((current) => ({ ...current, density: "compact" }))}
                  />
                </PreferenceGroup>

                <PreferenceCheckbox
                  label="Open context drawer automatically"
                  description="Keep drill-down evidence visible as soon as an item is selected."
                  checked={preferences.autoOpenDrawer}
                  onChange={(checked) => setPreferences((current) => ({ ...current, autoOpenDrawer: checked }))}
                />

                <PreferenceCheckbox
                  label="Auto-focus map markers"
                  description="Move the map toward the selected marker or grouped location automatically."
                  checked={preferences.mapAutoFocus}
                  onChange={(checked) => setPreferences((current) => ({ ...current, mapAutoFocus: checked }))}
                />

                <Button onClick={() => void savePreferences()} disabled={isSavingPreferences}>
                  {isSavingPreferences ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorCog className="h-4 w-4" />}
                  {isSavingPreferences ? "Saving..." : "Save local preferences"}
                </Button>
              </div>
            </PanelSection>

            <PanelSection
              title="Workspace hygiene"
              description="Quick recovery actions for local-only state stored in the browser."
            >
              <div className="space-y-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    window.localStorage.removeItem(preferenceStorageKey);
                    setPreferences(defaultPreferences);
                    closeRevealedKeyModal();
                    toast.success("Local settings reset");
                  }}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reset local preferences
                </Button>
                <p className="text-sm leading-6 text-slate-400">
                  This only clears browser-stored preferences and the last shown plaintext API key. It does not revoke keys or modify backend data.
                </p>
              </div>
            </PanelSection>
          </div>
        </div>

        <Modal
          open={Boolean(revealedKey)}
          onClose={closeRevealedKeyModal}
          title="Copy this API key now"
          description="This plaintext key is shown only once. After you close this dialog, the platform will keep only its hashed form."
          className="max-w-2xl"
        >
          {revealedKey ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{revealedKey.name}</Badge>
                <Badge variant="secondary">{revealedKey.scope} scope</Badge>
                <Badge variant="outline" className="border-amber-300/20 text-amber-100">One-time reveal</Badge>
              </div>

              <div className="rounded-[20px] border border-emerald-400/12 bg-emerald-400/5 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">Plaintext API key</p>
                <p className="mt-3 break-all rounded-2xl border border-white/8 bg-[#09111d] px-4 py-4 font-mono text-sm leading-7 text-emerald-100">
                  {revealedKey.value}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-slate-400">
                  Store it in your secret manager or integration now. The UI will not be able to display this key again.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => void handleCopyKey()}>
                    <Copy className="h-4 w-4" />
                    Copy key
                  </Button>
                  <Button onClick={closeRevealedKeyModal}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    </RequireAuth>
  );
}

function PreferenceGroup({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-[18px] border border-white/8 bg-[#0f1828] px-4 py-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PreferenceToggle({
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
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${active ? "bg-sky-400/15 text-sky-100" : "bg-[#101b2b] text-slate-400 hover:text-white"}`}
    >
      {label}
    </button>
  );
}

function PreferenceCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[18px] border border-white/8 bg-[#0f1828] px-4 py-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-white/20 bg-[#101b2b]"
      />
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block text-sm text-slate-400">{description}</span>
      </span>
    </label>
  );
}
