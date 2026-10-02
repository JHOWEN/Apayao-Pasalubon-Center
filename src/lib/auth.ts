import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

function getJwtSecret() {
  const configuredSecret = process.env.JWT_SECRET?.trim();
  if (configuredSecret) return configuredSecret;
  return process.env.NODE_ENV === "production" ? null : "apc-inventory-dev-secret";
}

export function canAccessAdminPortal(role: string | undefined) {
  return role === "ADMIN" || role === "STAFF";
}

export function signToken(payload: object, expiresIn: jwt.SignOptions["expiresIn"] = "7d") {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET must be configured in production.");

  return jwt.sign(payload, secret, {
    expiresIn,
    algorithm: "HS256",
  });
}

export function verifyToken(token: string) {
  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    return jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

export async function getUserForToken(token: string | undefined) {
  if (!token) return null;

  const payload = verifyToken(token) as { sub?: string } | null;
  if (!payload?.sub) return null;

  return prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, isBlocked: true },
  });
}

export async function ensureAuthenticatedAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const user = await getUserForToken(token);
  if (!user || user.isBlocked || !canAccessAdminPortal(user.role)) return null;
  return user.id;
}