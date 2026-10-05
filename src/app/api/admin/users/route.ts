import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserForToken } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { clearAuthCookies } from "@/lib/cookies";

async function requireAdmin() {
  const token = (await cookies()).get("token")?.value;
  const payload = token ? await getUserForToken(token) : null;

  if (!payload?.sub) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true, isBlocked: true } });
  if (user?.role !== "ADMIN" || user.isBlocked) {
    return { error: NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 }) };
  }

  return { adminId: payload.sub };
}

function publicUser(user: { id: string; name: string; email: string; role: string; isBlocked: boolean; emailVerified: boolean; createdAt: Date }) {
  return { ...user, createdAt: user.createdAt.toISOString() };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:users:get", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const users = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "STAFF"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, role: true, isBlocked: true, emailVerified: true, createdAt: true },
    });

    return NextResponse.json(users.map(publicUser));
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to load team accounts.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:users:create", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json() as { name?: string; email?: string; role?: string };
    const name = body.name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const role = body.role === "ADMIN" ? "ADMIN" : body.role === "STAFF" ? "STAFF" : null;

    if (!name || name.length < 2) {
      return NextResponse.json({ success: false, message: "A valid name is required." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ success: false, message: "A valid email is required." }, { status: 400 });
    }
    if (!role) {
      return NextResponse.json({ success: false, message: "Choose STAFF or ADMIN." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ success: false, message: "That email is already registered." }, { status: 409 });
    }

    const temporaryPassword = randomBytes(9).toString("base64url");
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role,
        password: await bcrypt.hash(temporaryPassword, 12),
        emailVerified: true,
      },
      select: { id: true, name: true, email: true, role: true, isBlocked: true, emailVerified: true, createdAt: true },
    });

    await prisma.activityLog.create({
      data: { userId: auth.adminId, action: "CREATE_TEAM_ACCOUNT", description: `Created ${role} account for ${email}.` },
    });

    return NextResponse.json({ success: true, user: publicUser(user), temporaryPassword }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to create team account.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:users:update", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json() as { id?: string; role?: string; isBlocked?: boolean };
    if (!body.id) return NextResponse.json({ success: false, message: "Account id is required." }, { status: 400 });

    const existing = await prisma.user.findUnique({
      where: { id: body.id },
      select: { id: true, role: true, email: true, isBlocked: true },
    });
    if (!existing || (existing.role !== "ADMIN" && existing.role !== "STAFF")) {
      return NextResponse.json({ success: false, message: "Team account not found." }, { status: 404 });
    }

    const nextRole = body.role === "ADMIN" || body.role === "STAFF" ? body.role : undefined;
    if (existing.role === "ADMIN" && nextRole === "STAFF") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN", isBlocked: false } });
      if (adminCount <= 1) {
        return NextResponse.json({ success: false, message: "The final active admin cannot be demoted." }, { status: 400 });
      }
    }

    const roleChanged = Boolean(nextRole && nextRole !== existing.role);
    const blockedChanged = typeof body.isBlocked === "boolean" && body.isBlocked !== existing.isBlocked;
    const invalidatesSessions = roleChanged || blockedChanged;
    const updated = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: body.id },
        data: {
          ...(nextRole ? { role: nextRole } : {}),
          ...(typeof body.isBlocked === "boolean" ? { isBlocked: body.isBlocked } : {}),
          ...(invalidatesSessions ? { sessionVersion: { increment: 1 } } : {}),
        },
        select: { id: true, name: true, email: true, role: true, isBlocked: true, emailVerified: true, createdAt: true },
      });
      if (invalidatesSessions) {
        await transaction.authSession.deleteMany({ where: { userId: body.id } });
      }
      return user;
    });

    await prisma.activityLog.create({
      data: { userId: auth.adminId, action: "UPDATE_TEAM_ACCOUNT", description: `Updated team account ${existing.email}.` },
    });

    const sessionEnded = auth.adminId === body.id && invalidatesSessions;
    const response = NextResponse.json({ success: true, user: publicUser(updated), sessionEnded });
    if (sessionEnded) {
      clearAuthCookies(response);
    }
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to update team account.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:users:delete", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json() as { id?: string };
    if (!body.id) {
      return NextResponse.json({ success: false, message: "Account id is required." }, { status: 400 });
    }

    if (body.id === auth.adminId) {
      return NextResponse.json({ success: false, message: "You cannot delete your own account." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { id: body.id },
      select: { id: true, email: true, role: true },
    });

    if (!existing || (existing.role !== "ADMIN" && existing.role !== "STAFF")) {
      return NextResponse.json({ success: false, message: "Team account not found." }, { status: 404 });
    }

    if (existing.role === "ADMIN") {
      const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", isBlocked: false } });
      if (activeAdminCount <= 1) {
        return NextResponse.json({ success: false, message: "The final active admin cannot be deleted." }, { status: 400 });
      }
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.activityLog.deleteMany({ where: { userId: existing.id } });
      await transaction.user.delete({ where: { id: existing.id } });
      await transaction.activityLog.create({
        data: { userId: auth.adminId, action: "DELETE_TEAM_ACCOUNT", description: `Deleted team account ${existing.email}.` },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to delete team account.") }, { status: 500 });
  }
}
