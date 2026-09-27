import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, resetLoginRateLimit } from "@/lib/rate-limit";
import { verifyPasswordResetToken } from "@/lib/password-reset";
import { getRequestId, logError } from "@/lib/logger";

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
      email,
      maxAttempts: 10,
      windowMs: 15 * 60 * 1000,
      message: "Too many password reset attempts. Please try again in a few minutes.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters." }, { status: 400 });
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

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
      },
    });

    await resetLoginRateLimit(new Request("http://localhost"), email);

    return NextResponse.json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    logError("auth.reset_password_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to reset password." }, { status: 500 });
  }
}
