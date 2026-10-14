import { NextResponse } from "next/server";
import { removeAuthCookie } from "@/lib/cookies";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, "user:logout", { group: "user" });
  if (rateLimitResponse) return rateLimitResponse;

  await removeAuthCookie();

  return NextResponse.json(
    { success: true, message: "Logged out successfully." },
    { status: 200 }
  );
}
