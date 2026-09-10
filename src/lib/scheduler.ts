import { getDatabase } from "./cloudflare";

const SCHEDULER_SYMBOL = Symbol.for("__albatextus_internal_scheduler__");

interface SchedulerState {
  timer: NodeJS.Timeout | null;
  running: boolean;
  intervalMs: number;
  runTask: () => Promise<void>;
}

export function startInternalScheduler(intervalMs = 60_000): void {
  const globalObj = globalThis as unknown as {
    [SCHEDULER_SYMBOL]?: SchedulerState;
  };

  let existing = globalObj[SCHEDULER_SYMBOL];
  if (existing && !existing.runTask) {
    if (existing.timer) clearInterval(existing.timer);
    existing = undefined;
  }
  const state: SchedulerState = existing ?? {
    timer: null,
    running: false,
    intervalMs,
    runTask: async () => {},
  };
  globalObj[SCHEDULER_SYMBOL] = state;

  const runTask = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const { scheduledCheck } = await import("./monitor");
      const db = await getDatabase();
      await scheduledCheck(db);
    } catch {
      try {
        const { checkServices } = await import("./monitor");
        await checkServices();
      } catch (err) {
        console.error("[Scheduler] Internal check error:", err);
      }
    } finally {
      state.running = false;
    }
  };
  state.runTask = runTask;
  // Refresh the callback after a development reload without duplicating timers.
  if (existing) return;

  // Initial trigger after 2 seconds
  setTimeout(() => {
    state.runTask().catch(() => {});
  }, 2_000);

  // Periodic recurring check
  state.timer = setInterval(() => {
    state.runTask().catch(() => {});
  }, intervalMs);

  if (state.timer.unref) {
    state.timer.unref();
  }

  console.log(`[Scheduler] Built-in periodic sampling active (every ${Math.round(intervalMs / 1000)}s)`);
}

export function stopInternalScheduler(): void {
  const globalObj = globalThis as unknown as {
    [SCHEDULER_SYMBOL]?: SchedulerState;
  };
  if (globalObj[SCHEDULER_SYMBOL]?.timer) {
    clearInterval(globalObj[SCHEDULER_SYMBOL]!.timer!);
    delete globalObj[SCHEDULER_SYMBOL];
    console.log("[Scheduler] Built-in periodic sampling stopped");
  }
}
