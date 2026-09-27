import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  return NextResponse.json({
    success: true,
    settings: await getCachedPublicSettings(),
  });
}