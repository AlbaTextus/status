export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInternalScheduler } = await import("./lib/scheduler");
    startInternalScheduler(60_000);
  }
}
