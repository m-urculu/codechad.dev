import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  swcMinify: true,
  // swcMinify enables JS minification for better performance
  // Next.js 13+ outputs modern JS by default
};

export default nextConfig;
