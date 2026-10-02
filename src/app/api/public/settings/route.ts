import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getCachedPublicSettings } from "@/lib/public-settings";

export async function GET(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, "public:settings", { group: "public" });
  if (rateLimitResponse) return rateLimitResponse;

  return NextResponse.json({
    success: true,
    settings: await getCachedPublicSettings(),
  });
}