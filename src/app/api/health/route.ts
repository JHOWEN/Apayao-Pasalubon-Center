import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyOperationalAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { status: "ok", checks: { database: "ok" } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await notifyOperationalAlert("health.database_unavailable", { error: error instanceof Error ? error.message : String(error) });

    return NextResponse.json(
      { status: "error", checks: { database: "unavailable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
