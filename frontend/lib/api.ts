import type { UploadLogOptions, UploadResponse } from "@/lib/types";

import { API_BASE_URL, buildApiError, configureXhr } from "@/lib/http";

const REQUEST_TIMEOUT_MS = 150_000;
const DEFAULT_RISK_ASSESSMENT: UploadResponse["risk_assessment"] = {
  risk_score: 0,
  risk_level: "Low",
};

type UploadResponsePayload = Partial<UploadResponse> & {
  ai_analysis?: Partial<UploadResponse["ai_analysis"]> | null;
  timeline?: UploadResponse["timeline"][number][] | null;
  risk_assessment?: UploadResponse["risk_assessment"] | null;
  attack_campaigns?: UploadResponse["attack_campaigns"][number][] | null;
  case?: UploadResponse["case"] | null;
  session?: UploadResponse["session"] | null;
};

export function uploadLog(file: File, options: UploadLogOptions & { caseId?: string } = {}) {
  return new Promise<UploadResponse>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options.caseId) {
      formData.append("case_id", options.caseId);
    }

    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/upload-log`);
    request.responseType = "json";
    request.timeout = REQUEST_TIMEOUT_MS;
    configureXhr(request);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const progress = Math.round((event.loaded / event.total) * 100);
      options.onUploadProgress?.(progress);
    };

    request.upload.onload = () => {
      options.onUploadProgress?.(100);
      options.onUploadComplete?.();
    };

    request.onerror = () => {
      reject(new Error("Unable to reach the backend service."));
    };

    request.ontimeout = () => {
      reject(new Error("The log analysis request timed out while waiting for backend processing or AI analysis."));
    };

    request.onload = () => {
      const response = parseResponse(request.response);
      if (request.status >= 200 && request.status < 300) {
        resolve(normalizeUploadResponse(response as UploadResponsePayload));
        return;
      }

      reject(buildApiError(response, request.status, "The backend could not process the uploaded log."));
    };

    request.send(formData);
  });
}

export async function downloadIncidentReport(result: UploadResponse): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
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

function parseResponse(response: unknown) {
  if (response && typeof response === "object") {
    return response;
  }

  if (typeof response === "string") {
    try {
      return JSON.parse(response);
    } catch {
      return {};
    }
  }

  try {
    return JSON.parse(String(response ?? ""));
  } catch {
    return {};
  }
}

export function normalizeUploadResponse(payload: UploadResponsePayload): UploadResponse {
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
    session: payload.session
      ? {
        ...payload.session,
        source_type: payload.session.source_type === "live_stream" ? "live_stream" : "upload",
      }
      : null,
  };
}
