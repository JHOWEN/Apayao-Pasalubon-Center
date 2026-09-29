import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const payload = verifyToken(token) as { sub?: string } | null;

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

    const payload = verifyToken(token) as { sub?: string } | null;

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const existingUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, phone: true, address: true, emailVerified: true },
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

    if (typeof body.name === "string") updateData.name = body.name.trim();
    if (typeof body.phone === "string") updateData.phone = body.phone.trim() || null;
    if (typeof body.address === "string") updateData.address = body.address.trim() || null;
    if (typeof body.imageUrl === "string") updateData.imageUrl = body.imageUrl.trim() || null;

    const nextPhone = typeof body.phone === "string" ? body.phone.trim() || null : existingUser.phone;
    const nextAddress = typeof body.address === "string" ? body.address.trim() || null : existingUser.address;
    const isProfileComplete = Boolean(nextPhone) && Boolean(nextAddress);

    if (existingUser.role === "CUSTOMER") {
      updateData.emailVerified = isProfileComplete;
    }

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

    const payload = verifyToken(token) as { sub?: string } | null;

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email) {
      return NextResponse.json({ success: false, message: "Email confirmation is required." }, { status: 400 });
    }

    if (!password.trim()) {
      return NextResponse.json({ success: false, message: "Your current password is required to delete the account." }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, password: true },
    });

    if (!existingUser) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
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
    ]);

    const response = NextResponse.json({ success: true, message: "Account deleted successfully." });
    response.cookies.delete("token");

    return response;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to delete account.") }, { status: 500 });
  }
}
