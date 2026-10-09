import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const getCachedPublicSettings = unstable_cache(
  async () => {
    const settings = await prisma.appSetting.findFirst({ where: { key: "default" } });

    return {
      appName: settings?.appName ?? "APC Inventory",
      registeredBusinessName: settings?.registeredBusinessName ?? "APAYAO PASALUBONG CENTER",
      businessAddress: settings?.businessAddress ?? "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region",
      contactEmail: settings ? settings.contactEmail : "info@apayao-pasalubong.com",
      contactPhone: settings ? settings.contactPhone : "0917 123 4567",
      facebookUrl: settings ? settings.facebookUrl : "https://www.facebook.com/apayaopasalubong",
      storeHours: settings ? settings.storeHours : "Open daily, 7:00 AM - 8:30 PM.",
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
