import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setAuthCookies } from "@/lib/cookies";
import { createAuthSession } from "@/lib/auth-sessions";
import { checkLoginRateLimit, getLoginRateLimitStatus, resetLoginRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/features/auth/validators/auth";
import { getRequestId, logError } from "@/lib/logger";
import { getUserFacingErrorMessage } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, errors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password, rememberMe } = result.data;

    const rateLimit = await getLoginRateLimitStatus(request, email);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many login attempts. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds! / 60)} minute(s).`,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const failedAttempt = await checkLoginRateLimit(request, email);
      if (!failedAttempt.allowed) {
        return NextResponse.json(
          {
            success: false,
            message: `Too many login attempts. Please try again in ${Math.ceil(failedAttempt.retryAfterSeconds! / 60)} minute(s).`,
            retryAfterSeconds: failedAttempt.retryAfterSeconds,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      const failedAttempt = await checkLoginRateLimit(request, email);
      if (!failedAttempt.allowed) {
        return NextResponse.json(
          {
            success: false,
            message: `Too many login attempts. Please try again in ${Math.ceil(failedAttempt.retryAfterSeconds! / 60)} minute(s).`,
            retryAfterSeconds: failedAttempt.retryAfterSeconds,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (user.isBlocked) {
      return NextResponse.json(
        { success: false, message: "Your account is inactive. Please contact an administrator." },
        { status: 403 }
      );
    }

    await resetLoginRateLimit(request, email);

    const session = await createAuthSession(user.id, user.sessionVersion, rememberMe, user.role);
    await setAuthCookies(session.accessToken, session.refreshToken, session.refreshExpiresAt);

    return NextResponse.json(
      {
        success: true,
        message: "Logged in successfully.",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          imageUrl: user.imageUrl,
          phone: user.phone,
          address: user.address,
          emailVerified: user.emailVerified,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logError("auth.login_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json(
      { success: false, message: getUserFacingErrorMessage(error) },
      { status: 500 }
    );
  }
}
