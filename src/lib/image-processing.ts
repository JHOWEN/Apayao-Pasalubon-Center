import sharp from "sharp";

export const MAX_PRODUCT_IMAGE_SIZE_BYTES = Number(process.env.MAX_PRODUCT_IMAGE_SIZE_MB || 10) * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export type ProcessedProductImage = {
  main: { key: string; buffer: Buffer; contentType: string; url: string };
  thumbnail: { key: string; buffer: Buffer; contentType: string; url: string };
};

export async function validateUploadedImage(file: File) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Invalid image upload.");
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Please upload JPEG, PNG, WebP, or AVIF.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length <= 0) {
    throw new Error("Uploaded file is empty.");
  }

  if (buffer.length > MAX_PRODUCT_IMAGE_SIZE_BYTES) {
    throw new Error(`Image exceeds the ${Number(process.env.MAX_PRODUCT_IMAGE_SIZE_MB || 10)} MB limit.`);
  }

  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Unable to decode uploaded image.");
  }

  return buffer;
}

export async function processProductImage(file: File, productId: string) {
  const buffer = await validateUploadedImage(file);

  try {
    const mainBuffer = await sharp(buffer)
      .rotate()
      .toColorspace("srgb")
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
      .toBuffer();

    const thumbnailBuffer = await sharp(buffer)
      .rotate()
      .toColorspace("srgb")
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();

    const safeId = productId.trim() || `tmp-${Date.now()}`;
    const mainKey = `products/${safeId}/main.webp`;
    const thumbnailKey = `products/${safeId}/thumbnail.webp`;

    return {
      main: {
        key: mainKey,
        buffer: mainBuffer,
        contentType: "image/webp",
      },
      thumbnail: {
        key: thumbnailKey,
        buffer: thumbnailBuffer,
        contentType: "image/webp",
      },
    };
  } catch (error) {
    console.error("Image processing error:", error);
    throw error instanceof Error ? error : new Error("Image processing failed.");
  }
}
