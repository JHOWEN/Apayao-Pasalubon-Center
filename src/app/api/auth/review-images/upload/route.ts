import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserForToken } from "@/lib/auth";
import { createStorageService, RATING_IMAGE_BUCKET } from "@/lib/storage";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError } from "@/lib/logger";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  try {
    const token = (await cookies()).get("token")?.value;
    const payload = token ? await getUserForToken(token) : null;

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Please sign in to upload review photos." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true },
    });
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ success: false, message: "Customer account required." }, { status: 403 });
    }

    const rateLimitResponse = await enforceRateLimit(request, "user:review-image:upload", {
      group: "user",
      accountId: user.id,
      message: "Too many photo uploads. Please try again in a moment.",
    });
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "Choose a photo to upload." }, { status: 400 });
    }

    const extension = ALLOWED_CONTENT_TYPES.get(file.type);
    if (!extension) {
      return NextResponse.json({ success: false, message: "Only JPEG, PNG, and WebP photos are allowed." }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ success: false, message: "The selected photo is empty." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ success: false, message: "Each review photo must be 10 MB or smaller." }, { status: 413 });
    }

    const key = `reviews/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const upload = await createStorageService().upload({
      bucket: RATING_IMAGE_BUCKET,
      key,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });

    return NextResponse.json({ success: true, key: upload.key, url: upload.url }, { status: 201 });
  } catch (error) {
    logError("auth.review_image.upload_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json(
      { success: false, message: "Unable to upload this review photo. Please try again." },
      { status: 500 },
    );
  }
}
