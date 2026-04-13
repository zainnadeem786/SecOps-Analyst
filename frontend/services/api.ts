import { UploadResponse } from "@/services/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

export async function uploadLog(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload-log`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as { detail?: string } | UploadResponse | null;
  if (!response.ok) {
    const detail = payload && "detail" in payload && typeof payload.detail === "string"
      ? payload.detail
      : "The backend could not process the uploaded log.";
    throw new Error(detail);
  }

  return payload as UploadResponse;
}
