import withPWA from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  // Next.js 16 uses Turbopack by default; declare empty config to suppress webpack warning
  turbopack: {},
};

export default withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // disable SW in dev to avoid caching issues
  workboxOptions: {
    disableDevLogs: true,
  },
})(nextConfig);
