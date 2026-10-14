import imageCompression from "browser-image-compression";

export type ImageCompressionPreset = {
  maxSizeMB: number;
  maxWidthOrHeight: number;
};

export const PRODUCT_IMAGE_COMPRESSION: ImageCompressionPreset = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1800,
};

export const PAYMENT_PROOF_IMAGE_COMPRESSION: ImageCompressionPreset = {
  maxSizeMB: 2.5,
  maxWidthOrHeight: 2560,
};

export const PROFILE_IMAGE_COMPRESSION: ImageCompressionPreset = {
  maxSizeMB: 0.75,
  maxWidthOrHeight: 1024,
};

export async function compressUploadImage(file: File, preset: ImageCompressionPreset) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const compressed = await imageCompression(file, {
      ...preset,
      fileType: "image/webp",
      initialQuality: 0.84,
      useWebWorker: true,
      libURL: "https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js",
    });

    if (compressed.size >= file.size && compressed.type === file.type) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([compressed], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

export async function compressUploadImages(files: File[], preset: ImageCompressionPreset) {
  const compressedFiles: File[] = [];

  for (const file of files) {
    compressedFiles.push(await compressUploadImage(file, preset));
  }

  return compressedFiles;
}
