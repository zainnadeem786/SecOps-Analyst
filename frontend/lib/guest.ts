const GUEST_ID_KEY = "secops_guest_id";
const GUEST_USAGE_COUNT_KEY = "secops_guest_usage_count";
const GUEST_SESSIONS_KEY = "secops_guest_counted_sessions";
const GUEST_CASE_KEY = "secops_guest_active_case_id";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getGuestId(): string | null {
  if (!isBrowser()) {
    return null;
  }
  return window.localStorage.getItem(GUEST_ID_KEY);
}

export function ensureGuestId(): string | null {
  if (!isBrowser()) {
    return null;
  }
  const existing = getGuestId();
  if (existing) {
    return existing;
  }
  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `guest-${Date.now()}`;
  window.localStorage.setItem(GUEST_ID_KEY, generated);
  return generated;
}

export function resetGuestIdentity(): string | null {
  if (!isBrowser()) {
    return null;
  }
  window.localStorage.removeItem(GUEST_ID_KEY);
  window.localStorage.removeItem(GUEST_USAGE_COUNT_KEY);
  window.localStorage.removeItem(GUEST_SESSIONS_KEY);
  window.localStorage.removeItem(GUEST_CASE_KEY);
  return ensureGuestId();
}

export function getGuestUsageCount(): number {
  if (!isBrowser()) {
    return 0;
  }
  return Number(window.localStorage.getItem(GUEST_USAGE_COUNT_KEY) ?? "0") || 0;
}

export function incrementGuestUsage(sessionId?: string | null): number {
  if (!isBrowser()) {
    return 0;
  }
  const countedSessions = new Set(JSON.parse(window.localStorage.getItem(GUEST_SESSIONS_KEY) ?? "[]") as string[]);
  if (sessionId && countedSessions.has(sessionId)) {
    return getGuestUsageCount();
  }
  const nextCount = getGuestUsageCount() + 1;
  window.localStorage.setItem(GUEST_USAGE_COUNT_KEY, String(nextCount));
  if (sessionId) {
    countedSessions.add(sessionId);
    window.localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(Array.from(countedSessions)));
  }
  return nextCount;
}

export function clearGuestUsage() {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(GUEST_USAGE_COUNT_KEY, "0");
  window.localStorage.setItem(GUEST_SESSIONS_KEY, "[]");
}

export function getGuestRemaining(limit = 3): number {
  return Math.max(0, limit - getGuestUsageCount());
}

export function setActiveGuestCaseId(caseId: string | null | undefined) {
  if (!isBrowser()) {
    return;
  }
  if (caseId) {
    window.localStorage.setItem(GUEST_CASE_KEY, caseId);
    return;
  }
  window.localStorage.removeItem(GUEST_CASE_KEY);
}

export function getActiveGuestCaseId(): string | null {
  if (!isBrowser()) {
    return null;
  }
  return window.localStorage.getItem(GUEST_CASE_KEY);
}
