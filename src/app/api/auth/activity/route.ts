import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { touchAdminIdleSession, validateAccessToken, verifyAccessToken } from "@/lib/auth-sessions";
import { getRequestId, logError } from "@/lib/logger";

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  let originUrl: URL | null = null;
  try {
    if (origin) originUrl = new URL(origin);
  } catch {
    originUrl = null;
  }
  if (!originUrl || originUrl.origin !== requestUrl.origin) {
    return noStoreJson({ success: false, message: "Invalid request origin." }, 403);
  }

  try {
    const accessToken = (await cookies()).get("token")?.value;
    const claims = accessToken ? verifyAccessToken(accessToken) : null;
    if (!accessToken || !claims) {
      return noStoreJson({ success: false, message: "Session expired." }, 401);
    }

    const user = await validateAccessToken(accessToken);
    if (!user) {
      return noStoreJson({ success: false, message: "Session expired." }, 401);
    }
    if (user.role !== "ADMIN" && user.role !== "STAFF") {
      return noStoreJson({ success: false, message: "Admin access required." }, 403);
    }

    if (!(await touchAdminIdleSession(claims.sid))) {
      return noStoreJson({ success: false, message: "Session expired." }, 401);
    }

    return noStoreJson({ success: true });
  } catch (error) {
    logError("auth.activity_failed", error, { requestId: getRequestId(request) });
    return noStoreJson({ success: false, message: "Unable to update session activity." }, 503);
  }
}
