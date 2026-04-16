import { UploadResponse } from "@/services/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const DEFAULT_RISK_ASSESSMENT: UploadResponse["risk_assessment"] = {
  risk_score: 0,
  risk_level: "Low",
};

type UploadResponsePayload = Partial<UploadResponse> & {
  ai_analysis?: Partial<UploadResponse["ai_analysis"]> | null;
  timeline?: UploadResponse["timeline"][number][] | null;
  risk_assessment?: UploadResponse["risk_assessment"] | null;
  attack_campaigns?: UploadResponse["attack_campaigns"][number][] | null;
};

export async function uploadLog(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload-log`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as { detail?: string } | UploadResponsePayload | null;
  if (!response.ok) {
    const detail = payload && "detail" in payload && typeof payload.detail === "string"
      ? payload.detail
      : "The backend could not process the uploaded log.";
    throw new Error(detail);
  }

  return normalizeUploadResponse(payload as UploadResponsePayload);
}

export async function downloadIncidentReport(result: UploadResponse): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    let detail = "The backend could not generate the incident report.";
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") {
        detail = payload.detail;
      }
    } catch {
      // Keep the generic detail if the response is not JSON.
    }
    throw new Error(detail);
  }

  return response.blob();
}

function normalizeUploadResponse(payload: UploadResponsePayload): UploadResponse {
  const riskAssessment = payload.risk_assessment ?? DEFAULT_RISK_ASSESSMENT;
  const analysis: Partial<UploadResponse["ai_analysis"]> = payload.ai_analysis ?? {};

  return {
    events: Array.isArray(payload.events) ? payload.events : [],
    detections: Array.isArray(payload.detections) ? payload.detections : [],
    ai_analysis: {
      explanation: typeof analysis.explanation === "string" ? analysis.explanation : "",
      risk_level: (
        typeof analysis.risk_level === "string" ? analysis.risk_level : riskAssessment.risk_level
      ) as UploadResponse["ai_analysis"]["risk_level"],
      risk_score: typeof analysis.risk_score === "number" ? analysis.risk_score : riskAssessment.risk_score,
      recommended_action: typeof analysis.recommended_action === "string" ? analysis.recommended_action : "",
      next_steps: Array.isArray(analysis.next_steps)
        ? analysis.next_steps.filter((step): step is string => typeof step === "string")
        : [],
      source: analysis.source === "ollama" ? "ollama" : "fallback",
      warning: typeof analysis.warning === "string" ? analysis.warning : null,
    },
    timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
    risk_assessment: riskAssessment,
    attack_campaigns: Array.isArray(payload.attack_campaigns) ? payload.attack_campaigns : [],
    case: payload.case ?? null,
    session: payload.session ?? null,
  };
}
