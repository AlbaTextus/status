import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev({ persist: { path: "../temps/status/cloudflare-state/v3" } });
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
