export type UploadResult = {
  key: string;
  url: string;
};

export interface StorageService {
  upload(input: { bucket: string; key: string; buffer: Buffer; contentType: string; }): Promise<UploadResult>;
  delete(input: { bucket: string; key: string }): Promise<void>;
  getPublicUrl(bucket: string, key: string): string;
  createSignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
}

export function makeStorageKey(prefix: string, productId: string, fileName: string) {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const normalizedProductId = productId.trim();
  const normalizedFileName = fileName.trim();

  if (!normalizedProductId || !normalizedFileName) {
    throw new Error("Product id and file name are required to build storage keys.");
  }

  return `${normalizedPrefix}/${normalizedProductId}/${normalizedFileName}`;
}
