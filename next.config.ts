import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild
    ? {
        output: "export" as const,
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: [
    "192.168.1.60",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
