import { NextResponse } from "next/server";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "admin:receipt-settings:get", {
      group: "admin",
      accountId: userId,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const settings = await prisma.appSetting.findUnique({
      where: { key: "default" },
      select: {
        registeredBusinessName: true,
        businessAddress: true,
        tinNumber: true,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        registeredBusinessName: settings?.registeredBusinessName ?? "APAYAO PASALUBONG CENTER",
        businessAddress: settings?.businessAddress ?? "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region",
        tinNumber: settings?.tinNumber ?? "",
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load receipt settings." }, { status: 500 });
  }
}
