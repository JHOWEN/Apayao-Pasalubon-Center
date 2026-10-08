import type { NextConfig } from "next";
import { SUPABASE_STORAGE_HOST } from "./src/lib/storage/public-image-host";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_STORAGE_HOST,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
  allowedDevOrigins: [
    "10.193.95.110",
    "localhost",
  ],
};

export default nextConfig;
