import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clearAuthCookies } from "@/lib/cookies";
import { getNewPasswordPolicyError } from "@/lib/password-policy";
import { profilePasswordSchema } from "@/features/admin/validators/admin";
import { parseJsonRequestBody } from "@/lib/api-validation";

export async function POST(request: Request) {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(request, "admin:profile:password", { group: "admin", accountId: userId });
    if (rateLimitResponse) return rateLimitResponse;

    const parsed = await parseJsonRequestBody(request, profilePasswordSchema, "Current and new password are required.");
    if (!parsed.success) return parsed.response;
    const { currentPassword, newPassword } = parsed.data;

    const passwordError = getNewPasswordPolicyError(newPassword);
    if (passwordError) {
      return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);

    if (!isValid) {
      return NextResponse.json({ success: false, message: "Current password is incorrect." }, { status: 401 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword, sessionVersion: { increment: 1 } },
      }),
      prisma.authSession.deleteMany({ where: { userId } }),
    ]);

    const response = NextResponse.json({
      success: true,
      message: "Password updated successfully. Please log in again.",
    });
    clearAuthCookies(response);
    return response;
  } catch {
    return NextResponse.json({ success: false, message: "Unable to update password." }, { status: 500 });
  }
}
