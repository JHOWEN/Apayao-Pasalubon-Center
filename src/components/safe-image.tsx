import NextImage, { type ImageProps } from "next/image";

export default function SafeImage(props: ImageProps) {
  return (
    <NextImage
      {...props}
      unoptimized={props.unoptimized ?? false}
    />
  );
}
