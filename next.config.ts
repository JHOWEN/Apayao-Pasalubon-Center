import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "aitlwnyerhzliyekormo.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  allowedDevOrigins: [
    "10.245.240.110",
    "10.34.154.110",
    "10.75.176.110",
    "10.238.153.110",
    "10.94.247.110",
    "127.0.0.1",
    "localhost",
  ],
};

export default nextConfig;
