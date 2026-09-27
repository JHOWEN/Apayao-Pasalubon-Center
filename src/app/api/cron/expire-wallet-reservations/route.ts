import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expireWalletReservations } from "@/features/inventory/lib/reservation-expiry";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, message: "Cron authorization is not configured." }, { status: 503 });
  }

  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const result = await expireWalletReservations();
  return NextResponse.json({ success: true, ...result });
}
