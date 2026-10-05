import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { enforceRateLimit } from "@/lib/rate-limit";

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

    const userRecord = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, isBlocked: true },
    });

    if (!userRecord || userRecord.isBlocked || !canAccessAdminPortal(userRecord.role)) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "admin:profile:get", { group: "admin", accountId: user.id });
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

    const userRecord = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, isBlocked: true },
    });

    if (!userRecord || userRecord.isBlocked || !canAccessAdminPortal(userRecord.role)) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "admin:profile:update", { group: "admin", accountId: payload.sub });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const updateData: Record<string, string | null> = {};

    if (typeof body.name === "string") updateData.name = body.name.trim();
    if (typeof body.email === "string") updateData.email = body.email.trim();
    if (typeof body.phone === "string") updateData.phone = body.phone.trim() || null;
    if (typeof body.address === "string") updateData.address = body.address.trim() || null;
    if (typeof body.imageUrl === "string") updateData.imageUrl = body.imageUrl || null;

    const user = await prisma.user.update({
      where: { id: payload.sub },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true, role: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ success: false, message: "Email is already in use." }, { status: 409 });
    }

    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to update profile.") }, { status: 500 });
  }
}
