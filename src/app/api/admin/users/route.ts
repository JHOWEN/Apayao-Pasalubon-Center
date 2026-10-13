import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserForToken } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { clearAuthCookies } from "@/lib/cookies";
import { idBodySchema, userCreateSchema, userUpdateSchema } from "@/features/admin/validators/admin";
import { parseJsonRequestBody } from "@/lib/api-validation";

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

function generateTemporaryPassword() {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()-_=+[]{};:,.?";
  const allCharacters = lowercase + uppercase + numbers + symbols;
  const characters = [
    lowercase[randomInt(lowercase.length)],
    uppercase[randomInt(uppercase.length)],
    numbers[randomInt(numbers.length)],
    symbols[randomInt(symbols.length)],
  ];

  while (characters.length < 16) {
    characters.push(allCharacters[randomInt(allCharacters.length)]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
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

    const parsed = await parseJsonRequestBody(request, userCreateSchema, "Team account details are invalid.");
    if (!parsed.success) return parsed.response;
    const { name, email, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ success: false, message: "That email is already registered." }, { status: 409 });
    }

    const temporaryPassword = generateTemporaryPassword();
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

    const parsed = await parseJsonRequestBody(request, userUpdateSchema, "Team account changes are invalid.");
    if (!parsed.success) return parsed.response;
    const body = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { id: body.id },
      select: { id: true, role: true, email: true, isBlocked: true },
    });
    if (!existing || (existing.role !== "ADMIN" && existing.role !== "STAFF")) {
      return NextResponse.json({ success: false, message: "Team account not found." }, { status: 404 });
    }

    const nextRole = body.role;
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

    const parsed = await parseJsonRequestBody(request, idBodySchema, "Account id is required.");
    if (!parsed.success) return parsed.response;
    const body = parsed.data;

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
