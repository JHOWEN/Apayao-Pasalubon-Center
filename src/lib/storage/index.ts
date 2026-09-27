import { parseImageUrls } from "@/features/catalog/utils/product-images";
import { SupabaseStorageService } from "@/lib/storage/supabase-storage";
import { StorageService } from "@/lib/storage/storage-service";

export const PRODUCT_IMAGE_BUCKET = process.env.SUPABASE_PRODUCT_BUCKET?.trim() || "product-images";
export const PROFILE_IMAGE_BUCKET = process.env.SUPABASE_PROFILE_BUCKET?.trim() || "profile-images";
export const PAYMENT_PROOF_BUCKET = process.env.SUPABASE_RECEIPT_BUCKET?.trim() || "payment-proofs";
export const PAYMENT_QR_BUCKET = process.env.SUPABASE_PAYMENT_QR_BUCKET?.trim() || "payment-qr";

export function createStorageService(): StorageService {
  return new SupabaseStorageService();
}

export async function resolvePaymentProofUrl(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/uploads/")) return value;

  const storageService = createStorageService();

  try {
    return await storageService.createSignedUrl(PAYMENT_PROOF_BUCKET, value, 300);
  } catch (error) {
    const fallbackUrl = storageService.getPublicUrl(PAYMENT_PROOF_BUCKET, value);
    console.warn("Payment proof signed URL failed; falling back to public storage URL.", {
      value,
      fallbackUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackUrl;
  }
}

export function getStorageKeyFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    return trimmed.replace(/^\/+(?:uploads\/)?/, "").replace(/^\/+/, "") || null;
  }

  try {
    const parsed = new URL(trimmed);
    const publicMarker = "/storage/v1/object/public/";
    const publicIndex = parsed.pathname.indexOf(publicMarker);
    if (publicIndex >= 0) {
      const publicPath = parsed.pathname.slice(publicIndex + publicMarker.length);
      const bucketPrefix = `${PRODUCT_IMAGE_BUCKET}/`;
      return publicPath.startsWith(bucketPrefix) ? publicPath.slice(bucketPrefix.length) : publicPath;
    }
    const pathname = parsed.pathname.replace(/^\/+/, "");
    return pathname || null;
  } catch {
    return trimmed.replace(/^\/+/, "") || null;
  }
}

export async function deleteProductImageUrls(imageValue?: string | null) {
  const urls = parseImageUrls(imageValue);
  const storageService = createStorageService();
  const keys = Array.from(new Set(
    urls
      .map((url) => getStorageKeyFromUrl(url))
      .filter((value): value is string => Boolean(value))
  ));

  await Promise.all(
    keys.map(async (key) => {
      try {
        await storageService.delete({ bucket: PRODUCT_IMAGE_BUCKET, key });
      } catch (error) {
        console.warn("Failed to delete product image from storage.", { key, error });
      }
    })
  );
}

export { SupabaseStorageService };
export type { StorageService, UploadResult } from "@/lib/storage/storage-service";
