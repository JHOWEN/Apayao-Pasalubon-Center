import { NextResponse } from "next/server";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { createStorageService, PROFILE_IMAGE_BUCKET } from "@/lib/storage";
import { enforceRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(request, "admin:profile:upload", { group: "admin", accountId: userId });
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "No image uploaded." }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, message: "Only JPG, PNG, WebP, and GIF images are allowed." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ success: false, message: "Image must be 2MB or smaller." }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1] || "bin";
    const key = `profiles/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const upload = await createStorageService().upload({
      bucket: PROFILE_IMAGE_BUCKET,
      key,
      buffer,
      contentType: file.type,
    });

    return NextResponse.json({ success: true, url: upload.url, key: upload.key });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to upload image." }, { status: 500 });
  }
}
