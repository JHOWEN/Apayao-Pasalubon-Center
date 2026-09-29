import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

const getCachedPublicSettings = unstable_cache(
  async () => {
    const settings = await prisma.appSetting.findFirst({ where: { key: "default" } });

    return {
      appName: settings?.appName ?? "APC Inventory",
      gcashAccountName: settings?.gcashAccountName ?? null,
      gcashAccountNumber: settings?.gcashAccountNumber ?? null,
      gcashQrCodeUrl: settings?.gcashQrCodeUrl ?? null,
      mayaAccountName: settings?.mayaAccountName ?? null,
      mayaAccountNumber: settings?.mayaAccountNumber ?? null,
      mayaQrCodeUrl: settings?.mayaQrCodeUrl ?? null,
    };
  },
  ["public-settings"],
  { tags: ["public-settings"], revalidate: 60 },
);

export async function GET(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, "public:settings", { group: "public" });
  if (rateLimitResponse) return rateLimitResponse;

  return NextResponse.json({
    success: true,
    settings: await getCachedPublicSettings(),
  });
}