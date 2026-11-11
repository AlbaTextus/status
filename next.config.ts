import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev({ persist: { path: "../temp/status/cloudflare-state/v3" } });
}

const nextConfig: NextConfig = {
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  distDir: process.env.NEXT_OUTPUT_DIR || ".next",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
