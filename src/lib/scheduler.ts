import { getDatabase } from "./cloudflare";
import { checkServices, scheduledCheck } from "./monitor";

const SCHEDULER_SYMBOL = Symbol.for("__albatextus_internal_scheduler__");

interface SchedulerState {
  timer: NodeJS.Timeout | null;
  running: boolean;
  intervalMs: number;
}

export function startInternalScheduler(intervalMs = 60_000): void {
  const globalObj = globalThis as unknown as {
    [SCHEDULER_SYMBOL]?: SchedulerState;
  };

  if (globalObj[SCHEDULER_SYMBOL]) {
    return;
  }

  const state: SchedulerState = {
    timer: null,
    running: false,
    intervalMs,
  };
  globalObj[SCHEDULER_SYMBOL] = state;

  const runTask = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const db = await getDatabase();
      await scheduledCheck(db);
    } catch {
      try {
        await checkServices();
      } catch (err) {
        console.error("[Scheduler] Internal check error:", err);
      }
    } finally {
      state.running = false;
    }
  };

  // Initial trigger after 2 seconds
  setTimeout(() => {
    runTask().catch(() => {});
  }, 2_000);

  // Periodic recurring check
  state.timer = setInterval(() => {
    runTask().catch(() => {});
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
