import { cookies } from "next/headers";
import { validateAccessToken } from "@/lib/auth-sessions";

export function canAccessAdminPortal(role: string | undefined) {
  return role === "ADMIN" || role === "STAFF";
}

export async function getUserForToken(token: string | undefined) {
  if (!token) return null;
  return validateAccessToken(token);
}

export async function ensureAuthenticatedAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const user = await getUserForToken(token);
  if (!user || user.isBlocked || !canAccessAdminPortal(user.role)) return null;
  return user.id;
}
