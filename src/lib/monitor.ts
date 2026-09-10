import { mutateStore, readStore } from "./store";
import type { HealthResult, Service } from "./types";
import { recordHealth, recordTimelineHealth } from "./history";

const globals = globalThis as typeof globalThis & { healthCheckRun?: Promise<void>; healthMonitorStarted?: boolean };

export async function probe(service: Pick<Service, "url">): Promise<HealthResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(service.url, { method: "GET", cache: "no-store", redirect: "manual", signal: controller.signal, headers: { "User-Agent": "AlbaTextus-Status/1.0" } });
    const code = response.status;
    await response.body?.cancel();
    return { status: code === 200 ? "operational" : code === 433 ? "maintenance" : "error", code, latency: Math.round(performance.now() - started), checkedAt: new Date().toISOString(), message: code === 200 ? "运行正常" : code === 433 ? "维护中" : `HTTP ${code}` };
  } catch {
    return { status: "error", code: null, latency: Math.round(performance.now() - started), checkedAt: new Date().toISOString(), message: controller.signal.aborted ? "检测超时（5 秒）" : "无法连接服务" };
  } finally { clearTimeout(timeout); }
}

export async function checkServices(ids?: string[]): Promise<void> {
  if (globals.healthCheckRun) {
    await globals.healthCheckRun;
    if (!ids) return;
    return checkServices(ids);
  }
  const task = (async () => {
    const { services } = await readStore();
    const pending = services.filter(service => !ids || ids.includes(service.id));
    let cursor = 0;
    await Promise.all(Array.from({length: Math.min(4, pending.length)}, async () => {
      while (cursor < pending.length) {
        const service = pending[cursor++];
        const result = await probe(service);
        await mutateStore(state => {
          const current = state.services.find(item => item.id === service.id);
          if (current?.revision === service.revision) {
            current.result = result;
            current.history = recordHealth(current.history ?? [], result);
            current.timeline = recordTimelineHealth(current.timeline ?? [], result);
          }
        });
      }
    }));
  })();
  globals.healthCheckRun = task;
  try { await task; } finally { if (globals.healthCheckRun === task) globals.healthCheckRun = undefined; }
}

export function startMonitor() {
  if (globals.healthMonitorStarted) return;
  globals.healthMonitorStarted = true;
  const tick = async () => {
    try { await checkServices(); } catch (error) { console.error("Health monitor failed:", error instanceof Error ? error.message : "unknown error"); }
    setTimeout(tick, 30000).unref();
  };
  setTimeout(tick, 1000).unref();
}
