import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { createStorageService, PROFILE_IMAGE_BUCKET } from "@/lib/storage";
import { getRequestId, logError } from "@/lib/logger";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const payload = verifyToken(token) as { sub?: string } | null;

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

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
    const key = `profiles/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const upload = await createStorageService().upload({
      bucket: PROFILE_IMAGE_BUCKET,
      key,
      buffer,
      contentType: file.type,
    });

    return NextResponse.json({ success: true, url: upload.url, key: upload.key });
  } catch (error) {
    logError("auth.profile.upload_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to upload image." }, { status: 500 });
  }
}
