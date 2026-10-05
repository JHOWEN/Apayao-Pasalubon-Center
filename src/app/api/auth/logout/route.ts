import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAuthCookies } from "@/lib/cookies";
import { revokeAccessTokenId, revokeRefreshSession, verifyAccessToken, revokeUserSessions } from "@/lib/auth-sessions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError, logWarn } from "@/lib/logger";

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, "user:logout", { group: "user" });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("token")?.value;
    const refreshToken = cookieStore.get("refreshToken")?.value;
    const accessClaims = accessToken ? verifyAccessToken(accessToken) : null;
    const sessionUserId = refreshToken ? await revokeRefreshSession(refreshToken) : null;

    if (!sessionUserId && accessClaims?.sub) {
      await revokeUserSessions(accessClaims.sub);
    }
    if (accessClaims) {
      try {
        await revokeAccessTokenId(accessClaims.jti, accessClaims.exp);
      } catch (error) {
        logWarn("auth.logout_jti_revoke_failed", {
          requestId: getRequestId(request),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const response = NextResponse.json(
      { success: true, message: "Logged out successfully." },
      { status: 200 }
    );
    clearAuthCookies(response);
    return response;
  } catch (error) {
    logError("auth.logout_failed", error, { requestId: getRequestId(request) });
    const response = NextResponse.json(
      { success: false, message: "Unable to complete logout. Please try again." },
      { status: 500 }
    );
    clearAuthCookies(response);
    return response;
  }
}
