import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearAuthCookies, setAuthCookies } from "@/lib/cookies";
import { rotateAuthSession, revokeAccessTokenId, verifyAccessToken } from "@/lib/auth-sessions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError } from "@/lib/logger";

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, "user:auth-refresh", { group: "user" });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refreshToken")?.value;
    if (!refreshToken) {
      const response = NextResponse.json({ success: false, message: "Session expired." }, { status: 401 });
      clearAuthCookies(response);
      return response;
    }

    const accessToken = cookieStore.get("token")?.value;
    const oldAccessClaims = accessToken ? verifyAccessToken(accessToken) : null;
    if (oldAccessClaims) {
      await revokeAccessTokenId(oldAccessClaims.jti, oldAccessClaims.exp);
    }

    const session = await rotateAuthSession(refreshToken);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Session expired or already rotated. Retry with the latest session cookie." },
        { status: 409 }
      );
    }

    await setAuthCookies(session.accessToken, session.refreshToken, session.refreshExpiresAt);
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("auth.refresh_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json(
      { success: false, message: "Unable to refresh your session." },
      { status: 500 }
    );
  }
}
