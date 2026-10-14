import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logger";
import { apiError } from "@/lib/api-response";

const getCachedCategories = unstable_cache(
  () => prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ["public-categories-v1"],
  { tags: ["public-categories"], revalidate: 300 },
);

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, "public:categories", {
      group: "public",
      message: "Too many requests. Please try again in a moment.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    const categories = await getCachedCategories();

    return NextResponse.json(categories, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=0, must-revalidate" },
    });
  } catch (error) {
    logError("public.categories.get_failed", error, { requestId: getRequestId(request) });
    return apiError(request, 503, "CATEGORIES_UNAVAILABLE", "Unable to load categories right now.");
  }
}
