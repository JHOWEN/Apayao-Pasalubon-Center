import { cookies } from "next/headers";

export function getAuthCookieOptions(rememberMe?: boolean) {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    ...(rememberMe === undefined
      ? { maxAge: 60 * 60 * 24 * 7 }
      : rememberMe
        ? { maxAge: 60 * 60 * 24 * 30 }
        : {}),
    ...(isProduction ? { partitioned: true } : {}),
  };
}

export async function setAuthCookie(token: string, rememberMe?: boolean) {
  try {
    const cookieStore = await cookies();
    cookieStore.set("token", token, getAuthCookieOptions(rememberMe));
  } catch {
  }
}

export async function removeAuthCookie() {
  const cookieStore = await cookies();

  cookieStore.delete("token");
}