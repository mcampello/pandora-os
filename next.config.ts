import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["app.campello.me", "dev.campello.pro"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
