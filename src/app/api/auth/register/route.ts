import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEmailVerificationUrl, createEmailVerificationToken } from "@/lib/email-verification";
import { sendVerificationEmail } from "@/lib/mailer";
import { enforceRateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/features/auth/validators/auth";
import { setAuthCookies } from "@/lib/cookies";
import { createAuthSession } from "@/lib/auth-sessions";
import bcrypt from "bcryptjs";
import { getRequestId, logError } from "@/lib/logger";
import { getUserFacingErrorMessage } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    // Parse request body
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    // Validate input
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          errors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, email, password, gdprConsent } = result.data;

    const rateLimitResponse = await enforceRateLimit(request, "auth:register", {
      group: "auth",
      email,
      message: "Too many registration attempts. Please try again in a few minutes.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const payload = body as { role?: string; phone?: string; address?: string; gdprConsent?: boolean };
    const phone = payload.phone?.trim() || null;
    const address = payload.address?.trim() || null;
    const isProfileComplete = Boolean(phone) && Boolean(address);
    const consented = Boolean(gdprConsent ?? payload.gdprConsent ?? false);

    if (!consented) {
      return NextResponse.json(
        {
          success: false,
          message: "You must agree to the Terms and Conditions and Privacy Policy.",
        },
        { status: 400 }
      );
    }

    if (payload.role && payload.role !== "CUSTOMER") {
      return NextResponse.json(
        {
          success: false,
          message: "Customer registration only.",
        },
        { status: 403 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Email is already registered.",
        },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const verificationToken = createEmailVerificationToken(email);
    const verificationUrl = buildEmailVerificationUrl(email, verificationToken);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        address,
        emailVerified: isProfileComplete,
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        role: "CUSTOMER",
      },
    });

    const session = await createAuthSession(user.id, user.sessionVersion, false);
    await setAuthCookies(session.accessToken, session.refreshToken, session.refreshExpiresAt);

    await sendVerificationEmail(email, verificationUrl, "Verify your account");

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully. Please check your email to verify your account.",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          emailVerified: user.emailVerified,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logError("auth.register_failed", error, { requestId: getRequestId(request) });

    return NextResponse.json(
      {
        success: false,
        message: getUserFacingErrorMessage(error),
      },
      { status: 500 }
    );
  }
}