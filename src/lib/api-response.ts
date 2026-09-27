import { NextResponse } from "next/server";
import { getRequestId } from "@/lib/logger";

export function getUserFacingErrorMessage(error: unknown, fallback = "We're having trouble processing your request right now. Please try again in a moment.") {
  const raw = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "";

  const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalized) {
    return fallback;
  }

  if (
    normalized.includes("econnrefused") ||
    normalized.includes("connection refused") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("socket hang up") ||
    normalized.includes("connection error") ||
    normalized.includes("dns")
  ) {
    return "We're having trouble connecting to our servers. Please check your internet connection and try refreshing the page.";
  }

  if (
    normalized.includes("internal server error") ||
    normalized.includes("500") ||
    normalized.includes("service unavailable") ||
    normalized.includes("database") ||
    normalized.includes("prisma") ||
    normalized.includes("query failed") ||
    normalized.includes("unexpected token") ||
    normalized.includes("syntaxerror") ||
    normalized.includes("unhandled")
  ) {
    return "We're having trouble processing your request right now. Please try again in a moment.";
  }

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("jwt") ||
    normalized.includes("invalid token") ||
    normalized.includes("session expired")
  ) {
    return "Your session has expired. Please sign in again.";
  }

  if (normalized.includes("not found")) {
    return "We couldn't find that information. Please refresh the page and try again.";
  }

  return fallback;
}

export function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
      requestId: getRequestId(request),
      ...(details ? { details } : {}),
    },
    { status, headers: { "x-request-id": getRequestId(request) } },
  );
}
