import { normalizeUploadResponse } from "@/lib/api";
import { API_BASE_URL, apiFetch, buildApiError } from "@/lib/http";
import { getGuestId } from "@/lib/guest";
import type {
  APIKeyCreateResponse,
  APIKeyScope,
  APIKeySummary,
  AuthResponse,
  CaseDetail,
  CaseReference,
  CaseSummary,
  ExecutiveSummary,
  LiveStreamReady,
  LiveStreamUpdate,
  RulesConfig,
  SearchResponse,
  ShareCaseResponse,
  SharedCaseView,
  UploadResponse,
  UploadSessionDetail,
} from "@/lib/types";

type UploadResponsePayload = Partial<UploadResponse> & {
  ai_analysis?: Partial<UploadResponse["ai_analysis"]> | null;
  timeline?: UploadResponse["timeline"][number][] | null;
  risk_assessment?: UploadResponse["risk_assessment"] | null;
  attack_campaigns?: UploadResponse["attack_campaigns"][number][] | null;
  case?: UploadResponse["case"] | null;
  session?: UploadResponse["session"] | null;
};

type CaseDetailPayload = Partial<CaseDetail> & {
  sessions?: Array<Partial<UploadSessionDetail> & { snapshot?: UploadResponsePayload | null }> | null;
};

export async function registerUser(email: string, password: string): Promise<AuthResponse> {
  return (await apiFetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })) as AuthResponse;
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  return (await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })) as AuthResponse;
}

export async function logoutUser(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
}

export async function getCurrentUser(): Promise<AuthResponse> {
  return (await apiFetch("/auth/me")) as AuthResponse;
}

export async function createApiKey(name: string, scope: APIKeyScope): Promise<APIKeyCreateResponse> {
  return (await apiFetch("/auth/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, scope }),
  })) as APIKeyCreateResponse;
}

export async function listApiKeys(): Promise<APIKeySummary[]> {
  return (await apiFetch("/auth/api-keys")) as APIKeySummary[];
}

export async function revokeApiKey(keyId: string): Promise<APIKeySummary> {
  return (await apiFetch(`/auth/api-keys/${keyId}`, {
    method: "DELETE",
  })) as APIKeySummary;
}

export async function createCase(name?: string): Promise<CaseReference> {
  return (await apiFetch("/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })) as CaseReference;
}

export async function listCases(): Promise<CaseSummary[]> {
  return (await apiFetch("/cases")) as CaseSummary[];
}

export async function getCaseDetail(caseId: string): Promise<CaseDetail> {
  const payload = (await apiFetch(`/cases/${caseId}`)) as CaseDetailPayload;
  return normalizeCaseDetail(payload);
}

export async function uploadLogToCase(caseId: string, file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: getGuestId() ? { "X-Guest-ID": getGuestId() ?? "" } : undefined,
  });
  const payload = await parseFetchJson(response);
  if (!response.ok) {
    throw buildApiError(payload, response.status, "The backend could not process the uploaded log.");
  }
  return normalizeUploadResponse((payload ?? {}) as UploadResponsePayload);
}

export async function getRules(): Promise<RulesConfig> {
  return (await apiFetch("/rules")) as RulesConfig;
}

export async function updateRules(rules: RulesConfig): Promise<RulesConfig> {
  return (await apiFetch("/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rules),
  })) as RulesConfig;
}

export async function searchCaseData(query: string, caseId: string, sessionId?: string, currentSessionOnly?: boolean): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, case_id: caseId });
  if (currentSessionOnly && sessionId) {
    params.set("session_id", sessionId);
  }
  return (await apiFetch(`/search?${params.toString()}`)) as SearchResponse;
}

export async function createShareLink(caseId: string, expiresInHours?: number): Promise<ShareCaseResponse> {
  return (await apiFetch(`/cases/${caseId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expiresInHours ? { expires_in_hours: expiresInHours } : {}),
  })) as ShareCaseResponse;
}

export async function getSharedCase(token: string): Promise<SharedCaseView> {
  const payload = (await apiFetch(`/share/${token}`)) as { case: CaseDetailPayload; expires_at: string };
  return {
    case: normalizeCaseDetail(payload.case),
    expires_at: payload.expires_at,
  };
}

export async function getExecutiveSummary(): Promise<ExecutiveSummary> {
  return (await apiFetch("/executive/summary")) as ExecutiveSummary;
}

export function buildWebSocketUrl(path: string): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const guestId = getGuestId();
  if (guestId) {
    url.searchParams.set("guest_id", guestId);
  }
  return url.toString();
}

export function normalizeLiveStreamUpdate(payload: Partial<LiveStreamUpdate>): LiveStreamUpdate {
  const snapshot = normalizeUploadResponse(payload as UploadResponsePayload);
  return {
    ...snapshot,
    skipped_lines: typeof payload.skipped_lines === "number" ? payload.skipped_lines : 0,
    total_lines: typeof payload.total_lines === "number" ? payload.total_lines : 0,
  };
}

export function isLiveReadyMessage(payload: unknown): payload is LiveStreamReady {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    (payload as { type?: unknown }).type === "ready" &&
    typeof (payload as { case?: { id?: unknown } }).case?.id === "string",
  );
}

async function parseFetchJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function normalizeCaseDetail(payload: CaseDetailPayload): CaseDetail {
  return {
    id: typeof payload.id === "string" ? payload.id : "",
    name: typeof payload.name === "string" ? payload.name : "",
    created_at: typeof payload.created_at === "string" ? payload.created_at : "",
    sessions: Array.isArray(payload.sessions)
      ? payload.sessions.map((session) => ({
        id: typeof session.id === "string" ? session.id : "",
        filename: typeof session.filename === "string" ? session.filename : "",
        uploaded_at: typeof session.uploaded_at === "string" ? session.uploaded_at : "",
        source_type: session.source_type === "live_stream" ? "live_stream" : "upload",
        risk_score: typeof session.risk_score === "number" ? session.risk_score : 0,
        snapshot: normalizeUploadResponse((session.snapshot ?? {}) as UploadResponsePayload),
      }))
      : [],
    risk_trend: Array.isArray(payload.risk_trend) ? payload.risk_trend : [],
    repeated_attackers: Array.isArray(payload.repeated_attackers) ? payload.repeated_attackers : [],
  };
}
