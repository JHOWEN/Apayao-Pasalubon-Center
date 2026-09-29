import { NextResponse } from "next/server";
import { removeAuthCookie } from "@/lib/cookies";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "user:logout", "user");
  if (rateLimitResponse) return rateLimitResponse;

  await removeAuthCookie();

  return NextResponse.json(
    { success: true, message: "Logged out successfully." },
    { status: 200 }
  );
}
