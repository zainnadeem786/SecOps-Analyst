import type { UploadLogOptions, UploadResponse } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 150_000;

export function uploadLog(file: File, options: UploadLogOptions = {}) {
  return new Promise<UploadResponse>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/upload-log`);
    request.responseType = "json";
    request.timeout = REQUEST_TIMEOUT_MS;

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
      const response = parseResponse(request.response, request.responseText);
      if (request.status >= 200 && request.status < 300) {
        resolve(response as UploadResponse);
        return;
      }

      const detail = typeof (response as { detail?: unknown })?.detail === "string"
        ? (response as { detail: string }).detail
        : "The backend could not process the uploaded log.";
      reject(new Error(detail));
    };

    request.send(formData);
  });
}

function parseResponse(response: unknown, responseText: string) {
  if (response && typeof response === "object") {
    return response;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {};
  }
}
