export class RequestTimeoutError extends Error {
  constructor(message = "The request timed out. Please try again.") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

export function getUserFacingErrorMessage(
  error: unknown,
  fallback = "We couldn't complete that request right now. Please try again in a moment.",
) {
  const raw = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalized) return fallback;

  if (
    error instanceof RequestTimeoutError ||
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("connection")
  ) {
    return "We're having trouble connecting to the store. Please check your connection and try again.";
  }

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("session expired") ||
    normalized.includes("invalid token")
  ) {
    return "Your sign-in session has ended. Please sign in again to continue.";
  }

  if (
    normalized.includes("internal server error") ||
    normalized.includes("service unavailable") ||
    normalized.includes("database") ||
    normalized.includes("prisma") ||
    normalized.includes("query failed") ||
    normalized.includes("unexpected token")
  ) {
    return fallback;
  }

  if (/^[A-Z0-9_ -]{3,48}$/.test(raw)) return fallback;

  return raw.length <= 180 ? raw : fallback;
}

export function getResponseErrorMessage(data: unknown, status: number, fallback?: string) {
  const serverMessage =
    data && typeof data === "object" && "message" in data && typeof data.message === "string"
      ? data.message
      : "";

  return getUserFacingErrorMessage(serverMessage || (status >= 500 ? "service unavailable" : ""), fallback);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RequestTimeoutError();
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
