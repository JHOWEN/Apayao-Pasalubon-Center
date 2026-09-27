import { NextResponse } from "next/server";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { createStorageService, PRODUCT_IMAGE_BUCKET } from "@/lib/storage";
import { processProductImage } from "@/lib/image-processing";
import { getRequestId, logInfo } from "@/lib/logger";

const storageService = createStorageService();

export async function POST(request: Request) {
  const userId = await ensureAuthenticatedAdmin();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const entries = formData.getAll("files");
    const files = entries.filter((entry): entry is File => entry instanceof File);

    if (!files.length) {
      const singleFile = formData.get("file");
      if (singleFile instanceof File) {
        files.push(singleFile);
      }
    }

    if (!files.length) {
      return NextResponse.json(
        { success: false, message: "No file uploaded." },
        { status: 400 }
      );
    }

    const uploadedResults = await Promise.all(
      files.map(async (file) => {
        const baseId = `product-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const processed = await processProductImage(file, baseId);
        
        logInfo("admin.product_image.processed", {
          requestId: getRequestId(request),
          mainKey: processed.main.key,
          mainBufferSize: processed.main.buffer.length,
          thumbnailKey: processed.thumbnail.key,
          thumbnailBufferSize: processed.thumbnail.buffer.length,
        });

        const mainUpload = await storageService.upload({
          bucket: PRODUCT_IMAGE_BUCKET,
          key: processed.main.key,
          buffer: processed.main.buffer,
          contentType: processed.main.contentType,
        });
        const thumbnailUpload = await storageService.upload({
          bucket: PRODUCT_IMAGE_BUCKET,
          key: processed.thumbnail.key,
          buffer: processed.thumbnail.buffer,
          contentType: processed.thumbnail.contentType,
        });

        logInfo("admin.product_image.uploaded", {
          requestId: getRequestId(request),
          mainUrl: mainUpload.url,
          thumbnailUrl: thumbnailUpload.url,
          mainKey: mainUpload.key,
          thumbnailKey: thumbnailUpload.key,
        });

        return {
          key: mainUpload.key,
          url: mainUpload.url,
          thumbnailUrl: thumbnailUpload.url,
          thumbnailKey: thumbnailUpload.key,
        };
      })
    );

    return NextResponse.json(
      {
        success: true,
        fileName: uploadedResults[0]?.key.split("/").pop(),
        url: uploadedResults[0]?.url,
        thumbnailUrl: uploadedResults[0]?.thumbnailUrl,
        urls: uploadedResults.map((item) => item.url),
        keys: uploadedResults.map((item) => item.key),
        thumbnailKeys: uploadedResults.map((item) => item.thumbnailKey),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to upload image.";
    return NextResponse.json(
      { success: false, message },
      { status: 400 }
    );
  }
}
