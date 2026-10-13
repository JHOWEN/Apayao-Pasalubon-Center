import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserForToken } from "@/lib/auth";
import { clearAuthCookies } from "@/lib/cookies";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { customerAccountDeletionSchema, customerProfileUpdateSchema } from "@/features/auth/validators/auth";
import { parseJsonRequestBody } from "@/lib/api-validation";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const payload = await getUserForToken(token);

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true, emailVerified: true, role: true, isBlocked: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "user:profile:get", {
      group: "user",
      accountId: user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to load profile.") }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const payload = await getUserForToken(token);

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const parsed = await parseJsonRequestBody(request, customerProfileUpdateSchema, "Profile details are invalid.");
    if (!parsed.success) return parsed.response;
    const body = parsed.data;
    const existingUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });

    if (!existingUser) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "user:profile:update", {
      group: "user",
      accountId: payload.sub,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const updateData: Record<string, string | boolean | null> = {};

    if (typeof body.name === "string") updateData.name = body.name;
    if (typeof body.phone === "string") updateData.phone = body.phone || null;
    if (typeof body.address === "string") updateData.address = body.address || null;
    if (typeof body.imageUrl === "string" || body.imageUrl === null) updateData.imageUrl = body.imageUrl;

    const user = await prisma.user.update({
      where: { id: payload.sub },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true, emailVerified: true, role: true, isBlocked: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to update profile.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const payload = await getUserForToken(token);

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const parsed = await parseJsonRequestBody(request, customerAccountDeletionSchema, "Email confirmation and password are required.");
    if (!parsed.success) return parsed.response;
    const { email, password } = parsed.data;

    const existingUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, password: true, role: true },
    });

    if (!existingUser) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }
    if (existingUser.role !== "CUSTOMER") {
      return NextResponse.json({ success: false, message: "Customer account required." }, { status: 403 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "user:profile:delete", {
      group: "user",
      accountId: existingUser.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    if (existingUser.email.toLowerCase() !== email) {
      return NextResponse.json({ success: false, message: "Email confirmation does not match your account email." }, { status: 400 });
    }

    const isPasswordValid = await bcrypt.compare(password, existingUser.password);

    if (!isPasswordValid) {
      return NextResponse.json({ success: false, message: "Your current password is incorrect." }, { status: 400 });
    }

    const anonymizedEmail = `deleted-${existingUser.id}@deleted.invalid`;
    const anonymizedPassword = await bcrypt.hash(randomUUID(), 12);

    await prisma.$transaction([
      prisma.cart.deleteMany({ where: { userId: existingUser.id } }),
      prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: "Deleted Customer",
          email: anonymizedEmail,
          password: anonymizedPassword,
          sessionVersion: { increment: 1 },
          phone: null,
          address: null,
          imageUrl: null,
          emailVerified: false,
          isBlocked: true,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
        },
      }),
      prisma.authSession.deleteMany({ where: { userId: existingUser.id } }),
    ]);

    const response = NextResponse.json({ success: true, message: "Account deleted successfully." });
    clearAuthCookies(response);

    return response;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to delete account.") }, { status: 500 });
  }
}
