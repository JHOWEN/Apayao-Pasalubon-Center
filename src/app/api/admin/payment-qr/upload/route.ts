import { NextResponse } from "next/server";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { createStorageService, PAYMENT_QR_BUCKET } from "@/lib/storage";
import { getRequestId, logError } from "@/lib/logger";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const storageService = createStorageService();

export async function POST(request: Request) {
  const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:payment-qr:upload", "admin");
  if (rateLimitResponse) return rateLimitResponse;
  const adminId = await ensureAuthenticatedAdmin();
  if (!adminId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "Please choose a QR code image." }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, message: "Only JPG, PNG, and WebP images are allowed." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ success: false, message: "QR code image must be 5MB or smaller." }, { status: 413 });
    }

    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const key = `payment-qr/${adminId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const upload = await storageService.upload({
      bucket: PAYMENT_QR_BUCKET,
      key,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });

    return NextResponse.json({ success: true, url: upload.url }, { status: 201 });
  } catch (error) {
    logError("admin.payment_qr.upload_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to upload QR code image." }, { status: 500 });
  }
}