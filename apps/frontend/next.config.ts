import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack is default in Next.js 16
  // If webpack config is needed, migrate to turbopack config
  turbopack: {},
  // Environment variables are now configured in .env file
};

export default nextConfig;
