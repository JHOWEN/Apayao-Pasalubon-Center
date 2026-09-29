import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/mailer";
import { buildPasswordResetUrl, createPasswordResetToken } from "@/lib/password-reset";
import { buildEmailVerificationUrl, createEmailVerificationToken } from "@/lib/email-verification";
import { getRequestId, logError } from "@/lib/logger";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getRequestBaseUrl(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ success: false, message: "Please provide a valid email address." }, { status: 400 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "auth:forgot-password", {
      group: "auth",
      email,
      message: "Too many password reset requests. Please try again in a few minutes.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const baseUrl = getRequestBaseUrl(request);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ success: true, message: "If an account exists, a reset email has been sent." });
    }

    if (!user.emailVerified) {
      const verificationToken = createEmailVerificationToken(email);
      const verificationUrl = buildEmailVerificationUrl(email, verificationToken, baseUrl);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationToken,
          emailVerificationTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const emailResult = await sendVerificationEmail(email, verificationUrl, "Verify your APC Inventory account");

      if (!emailResult.sent) {
        const isDevelopmentFallback = process.env.NODE_ENV !== "production" && Boolean(emailResult.previewUrl);

        return NextResponse.json(
          {
            success: false,
            message: emailResult.message || "Unable to send the verification email.",
            previewUrl: process.env.NODE_ENV !== "production" ? emailResult.previewUrl : undefined,
          },
          { status: isDevelopmentFallback ? 200 : 502 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Please verify your email first, then you can request a password reset link.",
        previewUrl: process.env.NODE_ENV !== "production" ? emailResult.previewUrl : undefined,
      });
    }

    const token = createPasswordResetToken(email);
    const resetUrl = buildPasswordResetUrl(email, token, baseUrl);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });

    const emailResult = await sendVerificationEmail(email, resetUrl, "Password reset request");

    if (!emailResult.sent) {
      const isDevelopmentFallback = process.env.NODE_ENV !== "production" && Boolean(emailResult.previewUrl);

      return NextResponse.json(
        {
          success: false,
          message: emailResult.message || "Unable to send the password reset email.",
          previewUrl: process.env.NODE_ENV !== "production" ? emailResult.previewUrl : undefined,
        },
        { status: isDevelopmentFallback ? 200 : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists, a reset email has been sent.",
      previewUrl: process.env.NODE_ENV !== "production" ? emailResult.previewUrl : undefined,
    });
  } catch (error) {
    logError("auth.forgot_password_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to process password reset request." }, { status: 500 });
  }
}
