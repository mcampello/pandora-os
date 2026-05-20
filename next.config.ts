import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["app.campello.me"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
