import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyEmailVerificationToken } from "@/lib/email-verification";
import { getRequestId, logError } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, "auth:verify-email", {
      maxAttempts: 10,
      windowMs: 15 * 60 * 1000,
      message: "Too many verification attempts. Please try again in a few minutes.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim();
    const token = searchParams.get("token")?.trim();

    if (!email || !token) {
      return NextResponse.json({ success: false, message: "Invalid verification link." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.emailVerificationToken) {
      return NextResponse.json({ success: false, message: "Verification link is invalid or already used." }, { status: 400 });
    }

    if (user.emailVerificationTokenExpiresAt && user.emailVerificationTokenExpiresAt < new Date()) {
      return NextResponse.json({ success: false, message: "Verification link has expired." }, { status: 400 });
    }

    if (!verifyEmailVerificationToken(email, token)) {
      return NextResponse.json({ success: false, message: "Verification link is invalid." }, { status: 400 });
    }

    if (user.emailVerificationToken !== token) {
      return NextResponse.json({ success: false, message: "Verification link is invalid." }, { status: 400 });
    }

    await prisma.user.update({
      where: { email },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
      },
    });

    return NextResponse.json({ success: true, message: "Email verified successfully." });
  } catch (error) {
    logError("auth.verify_email_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to verify email." }, { status: 500 });
  }
}
