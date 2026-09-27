import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

async function ensureAuthenticatedAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as { sub?: string } | null;
  if (!payload?.sub) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  return payload.sub;
}

async function getOrCreateSettings() {
  const existing = await prisma.appSetting.findFirst({ where: { key: "default" } });

  if (existing) {
    return existing;
  }

  return prisma.appSetting.create({
    data: {
      key: "default",
      appName: "APC Inventory",
      currency: "PHP",
    },
  });
}

export async function GET() {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const settings = await getOrCreateSettings();

    return NextResponse.json({
      success: true,
      settings: {
        appName: settings.appName,
        currency: settings.currency,
        gcashAccountName: settings.gcashAccountName,
        gcashAccountNumber: settings.gcashAccountNumber,
        gcashQrCodeUrl: settings.gcashQrCodeUrl,
        mayaAccountName: settings.mayaAccountName,
        mayaAccountNumber: settings.mayaAccountNumber,
        mayaQrCodeUrl: settings.mayaQrCodeUrl,
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const settings = await getOrCreateSettings();

    const nextSettings = await prisma.appSetting.update({
      where: { id: settings.id },
      data: {
        appName: typeof body.appName === "string" ? body.appName.trim() : settings.appName,
        currency: typeof body.currency === "string" ? body.currency.trim().toUpperCase() : settings.currency,
        gcashAccountName: typeof body.gcashAccountName === "string" ? body.gcashAccountName.trim() || null : settings.gcashAccountName,
        gcashAccountNumber: typeof body.gcashAccountNumber === "string" ? body.gcashAccountNumber.trim() || null : settings.gcashAccountNumber,
        gcashQrCodeUrl: typeof body.gcashQrCodeUrl === "string" ? body.gcashQrCodeUrl.trim() || null : settings.gcashQrCodeUrl,
        mayaAccountName: typeof body.mayaAccountName === "string" ? body.mayaAccountName.trim() || null : settings.mayaAccountName,
        mayaAccountNumber: typeof body.mayaAccountNumber === "string" ? body.mayaAccountNumber.trim() || null : settings.mayaAccountNumber,
        mayaQrCodeUrl: typeof body.mayaQrCodeUrl === "string" ? body.mayaQrCodeUrl.trim() || null : settings.mayaQrCodeUrl,
      },
    });

    revalidateTag("public-settings", "max");

    return NextResponse.json({
      success: true,
      settings: {
        appName: nextSettings.appName,
        currency: nextSettings.currency,
        gcashAccountName: nextSettings.gcashAccountName,
        gcashAccountNumber: nextSettings.gcashAccountNumber,
        gcashQrCodeUrl: nextSettings.gcashQrCodeUrl,
        mayaAccountName: nextSettings.mayaAccountName,
        mayaAccountNumber: nextSettings.mayaAccountNumber,
        mayaQrCodeUrl: nextSettings.mayaQrCodeUrl,
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to save settings." }, { status: 500 });
  }
}
