import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserForToken } from "@/lib/auth";
import { getCachedPublicSettings } from "@/lib/public-settings";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const publicRateLimitResponse = await enforceRateLimit(request, "public:settings", { group: "public" });
  if (publicRateLimitResponse) return publicRateLimitResponse;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const payload = token ? await getUserForToken(token) : null;

    const [user, settings] = await Promise.all([
      payload?.sub
        ? prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true, emailVerified: true, role: true, isBlocked: true },
          })
        : Promise.resolve(null),
      getCachedPublicSettings(),
    ]);

    if (user) {
      const userRateLimitResponse = await enforceRateLimit(request, "user:profile:get", {
        group: "user",
        accountId: user.id,
      });
      if (userRateLimitResponse) return userRateLimitResponse;
    }

    return NextResponse.json({ success: true, user, settings });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load checkout details." }, { status: 500 });
  }
}