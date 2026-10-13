import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearAuthCookies } from "@/lib/cookies";
import { enforceRateLimit, resetLoginRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError } from "@/lib/logger";
import { getNewPasswordPolicyError } from "@/lib/password-policy";
import { resetPasswordSchema } from "@/features/auth/validators/auth";
import { parseJsonRequestBody } from "@/lib/api-validation";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonRequestBody(request, resetPasswordSchema, "Password reset details are invalid.");
    if (!parsed.success) return parsed.response;
    const { email, token, password, confirmPassword } = parsed.data;

    const rateLimitResponse = await enforceRateLimit(request, "auth:reset-password", {
      group: "auth",
      email,
      message: "Too many password reset attempts. Please try again in a few minutes.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const passwordError = getNewPasswordPolicyError(password);
    if (passwordError) {
      return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ success: false, message: "Reset link is invalid or has already been used." }, { status: 400 });
    }

    const storedToken = user.passwordResetToken || "";
    const expiresAt = user.passwordResetTokenExpiresAt ? new Date(user.passwordResetTokenExpiresAt) : null;

    // The persisted high-entropy token is authoritative across Vercel deployments;
    // expiry and exact matching still make it time-limited and single-use.
    if (!storedToken || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ success: false, message: "Reset link is invalid or has expired." }, { status: 400 });
    }

    if (storedToken !== token) {
      return NextResponse.json({ success: false, message: "Reset link is invalid or has already been used." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          sessionVersion: { increment: 1 },
        },
      }),
      prisma.authSession.deleteMany({ where: { userId: user.id } }),
    ]);

    await resetLoginRateLimit(new Request("http://localhost"), email);

    const response = NextResponse.json({ success: true, message: "Password reset successfully." });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    logError("auth.reset_password_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to reset password." }, { status: 500 });
  }
}
