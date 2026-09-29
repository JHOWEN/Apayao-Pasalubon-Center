import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { createStorageService, PAYMENT_PROOF_BUCKET } from "@/lib/storage";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError } from "@/lib/logger";
import { ONLINE_PAYMENT_RESERVATION_TTL_MS } from "@/lib/order";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const storageService = createStorageService();

export async function POST(request: Request) {
  try {
    const token = (await cookies()).get("token")?.value;
    const payload = token ? verifyToken(token) as { sub?: string } | null : null;

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "user:payment-proof:upload", {
      group: "user",
      accountId: user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const orderId = typeof formData.get("orderId") === "string" ? String(formData.get("orderId")).trim() : "";
    if (!orderId) {
      return NextResponse.json({ success: false, message: "Order id is required to attach payment proof." }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        paymentMethod: true,
        paymentStatus: true,
        proofOfPaymentUrl: true,
        status: true,
        createdAt: true,
      },
    });
    if (!order || order.userId !== user.id) {
      return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    }
    if (order.paymentMethod === "CASH") {
      return NextResponse.json({ success: false, message: "Cash orders do not accept wallet payment proof." }, { status: 400 });
    }
    if (order.status !== "PENDING_PAYMENT" || order.paymentStatus !== "PENDING") {
      return NextResponse.json({ success: false, message: "This order is no longer accepting payment proof." }, { status: 409 });
    }
    if (!order.proofOfPaymentUrl && Date.now() >= order.createdAt.getTime() + ONLINE_PAYMENT_RESERVATION_TTL_MS) {
      return NextResponse.json({ success: false, message: "This reservation expired. Please place a new order before paying." }, { status: 410 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "Please upload a proof of payment image." }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, message: "Only JPG, PNG, and WebP images are allowed." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ success: false, message: "Proof of payment must be 5MB or smaller." }, { status: 413 });
    }

    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const key = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const upload = await storageService.upload({
      bucket: PAYMENT_PROOF_BUCKET,
      key,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });

    const updated = await prisma.order.updateMany({
      where: {
        id: order.id,
        userId: user.id,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        proofOfPaymentUrl: order.proofOfPaymentUrl,
        ...(order.proofOfPaymentUrl ? {} : {
          createdAt: { gt: new Date(Date.now() - ONLINE_PAYMENT_RESERVATION_TTL_MS) },
        }),
      },
      data: { proofOfPaymentUrl: upload.key },
    });

    if (updated.count !== 1) {
      await storageService.delete({ bucket: PAYMENT_PROOF_BUCKET, key: upload.key }).catch(() => undefined);
      return NextResponse.json({ success: false, message: "This reservation expired or changed. Refresh your orders and try again." }, { status: 409 });
    }

    if (order.proofOfPaymentUrl && order.proofOfPaymentUrl !== upload.key) {
      await storageService.delete({ bucket: PAYMENT_PROOF_BUCKET, key: order.proofOfPaymentUrl }).catch((error) => {
        logError("auth.payment_proof.previous_file_cleanup_failed", error, { orderId: order.id });
      });
    }

    const previewUrl = await storageService.createSignedUrl(PAYMENT_PROOF_BUCKET, upload.key, 300);
    return NextResponse.json({ success: true, orderId: order.id, key: upload.key, url: previewUrl }, { status: 201 });
  } catch (error) {
    logError("auth.payment_proof.upload_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to upload proof of payment." }, { status: 500 });
  }
}