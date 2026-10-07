import NextImage, { type ImageProps } from "next/image";
import { SUPABASE_STORAGE_HOST } from "@/lib/storage/public-image-host";

function isSupabaseStorageImage(src: ImageProps["src"]) {
  const source = typeof src === "string"
    ? src
    : "src" in src
      ? src.src
      : src.default.src;

  try {
    const url = new URL(source, "https://local.invalid");
    return url.protocol === "https:"
      && url.hostname === SUPABASE_STORAGE_HOST
      && url.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export default function SafeImage(props: ImageProps) {
  return (
    <NextImage
      {...props}
      unoptimized={props.unoptimized ?? isSupabaseStorageImage(props.src)}
    />
  );
}
