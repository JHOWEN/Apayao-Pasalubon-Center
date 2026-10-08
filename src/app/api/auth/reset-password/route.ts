import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearAuthCookies } from "@/lib/cookies";
import { enforceRateLimit, resetLoginRateLimit } from "@/lib/rate-limit";
import { verifyPasswordResetToken } from "@/lib/password-reset";
import { getRequestId, logError } from "@/lib/logger";
import { getNewPasswordPolicyError } from "@/lib/password-policy";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!email || !token || !password || !confirmPassword) {
      return NextResponse.json({ success: false, message: "Missing reset details." }, { status: 400 });
    }

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

    if (password !== confirmPassword) {
      return NextResponse.json({ success: false, message: "Passwords do not match." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ success: false, message: "Reset link is invalid or has already been used." }, { status: 400 });
    }

    const storedToken = user.passwordResetToken || "";
    const expiresAt = user.passwordResetTokenExpiresAt ? new Date(user.passwordResetTokenExpiresAt) : null;

    if (!storedToken || !expiresAt || expiresAt.getTime() <= Date.now() || !verifyPasswordResetToken(email, token)) {
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
