import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET ?? "apc-inventory-dev-secret";

export function canAccessAdminPortal(role: string | undefined) {
  return role === "ADMIN" || role === "STAFF";
}

export function signToken(payload: object, expiresIn: jwt.SignOptions["expiresIn"] = "7d") {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
  });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export async function ensureAuthenticatedAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as { sub?: string } | null;
  if (!payload?.sub) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true },
  });

  if (!user || !canAccessAdminPortal(user.role)) {
    return null;
  }

  return user.id;
}

export async function ensureDefaultUsers() {
  return;
}