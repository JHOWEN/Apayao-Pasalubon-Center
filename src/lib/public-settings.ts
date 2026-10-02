import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const getCachedPublicSettings = unstable_cache(
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