export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startMonitor } = await import("./lib/monitor");
    startMonitor();
  }
}
