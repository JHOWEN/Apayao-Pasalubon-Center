import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const ACCESS_COOKIE_NAME = "token";
const REFRESH_COOKIE_NAME = "refreshToken";
const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getAuthCookieOptions(sessionOnly = false) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    ...(!sessionOnly ? { maxAge: ACCESS_TOKEN_TTL_SECONDS } : {}),
    ...(isProduction() ? { partitioned: true } : {}),
  };
}

export function getRefreshCookieOptions(expiresAt: Date, sessionOnly = false) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/api/auth",
    ...(!sessionOnly ? { expires: expiresAt } : {}),
    ...(isProduction() ? { partitioned: true } : {}),
  };
}

export async function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  refreshExpiresAt: Date,
  sessionOnly = false,
) {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE_NAME, accessToken, getAuthCookieOptions(sessionOnly));
  cookieStore.set(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(refreshExpiresAt, sessionOnly));
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE_NAME, "", { ...getAuthCookieOptions(), maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE_NAME, "", {
    ...getRefreshCookieOptions(new Date(0)),
    maxAge: 0,
  });
}
