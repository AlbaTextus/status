import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./auth",
  outputDir: "./output/auth-results",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: "list",
});
