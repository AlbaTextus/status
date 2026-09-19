import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev({ persist: { path: "../temp/status/cloudflare-state/v3" } });
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
