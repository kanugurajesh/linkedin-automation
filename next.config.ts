import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-tools badge off the pause switch in the left rail.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
