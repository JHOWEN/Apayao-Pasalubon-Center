import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logger";
import { apiError } from "@/lib/api-response";

const PUBLIC_CATEGORIES_CACHE_MS = 300_000;
const publicCategoriesCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getCachedCategories() {
  const cacheKey = "public-categories";
  const now = Date.now();
  const cachedEntry = publicCategoriesCache.get(cacheKey);

  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.payload;
  }

  const payload = prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  publicCategoriesCache.set(cacheKey, { expiresAt: now + PUBLIC_CATEGORIES_CACHE_MS, payload: payload });
  return payload;
}

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, "public:categories", {
      maxAttempts: 300,
      windowMs: 60 * 1000,
      message: "Too many requests. Please try again in a moment.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    const categories = await getCachedCategories();

    return NextResponse.json(categories);
  } catch (error) {
    logError("public.categories.get_failed", error, { requestId: getRequestId(request) });
    return apiError(request, 503, "CATEGORIES_UNAVAILABLE", "Unable to load categories right now.");
  }
}
