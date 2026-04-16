import { ensureGuestId } from "@/lib/guest";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.status = status;
    this.code = code ?? null;
  }
}

function buildGuestHeader(headers?: HeadersInit) {
  const merged = new Headers(headers);
  const guestId = ensureGuestId();
  if (guestId) {
    merged.set("X-Guest-ID", guestId);
  }
  return merged;
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${input}`, {
    ...init,
    credentials: "include",
    headers: buildGuestHeader(init.headers),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw buildApiError(payload, response.status, "The backend request failed.");
  }
  return payload;
}

export function configureXhr(request: XMLHttpRequest) {
  request.withCredentials = true;
  const guestId = ensureGuestId();
  if (guestId) {
    request.setRequestHeader("X-Guest-ID", guestId);
  }
}

export function buildApiError(payload: unknown, status: number, defaultMessage: string) {
  const code = typeof (payload as { error?: unknown })?.error === "string"
    ? String((payload as { error: string }).error)
    : null;
  const detail = typeof (payload as { detail?: unknown })?.detail === "string"
    ? String((payload as { detail: string }).detail)
    : typeof (payload as { message?: unknown })?.message === "string"
      ? String((payload as { message: string }).message)
      : defaultMessage;
  return new ApiError(detail, status, code);
}
