import { mutateStore, readStore } from "./store";
import type { HealthResult, Service } from "./types";
import { recordHealth, recordTimelineHealth } from "./history";

import { getDatabase } from "./cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

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

export async function checkServices(ids?: string[], database?: D1Database): Promise<void> {
    const db = database ?? await getDatabase();
    const { services } = await readStore(db);
    const pending = services.filter(service => !ids || ids.includes(service.id));
    const results: Array<{ service: Service; result: HealthResult }> = [];
    let cursor = 0;
    await Promise.all(Array.from({length: Math.min(4, pending.length)}, async () => {
      while (cursor < pending.length) {
        const service = pending[cursor++];
        const result = await probe(service);
        results.push({ service, result });
      }
    }));
    if (!results.length) return;
    await mutateStore(state => {
      for (const { service, result } of results) {
          const current = state.services.find(item => item.id === service.id);
          if (current?.revision === service.revision && (!current.result.checkedAt || current.result.checkedAt < result.checkedAt!)) {
            current.result = result;
            current.history = recordHealth(current.history ?? [], result);
            current.timeline = recordTimelineHealth(current.timeline ?? [], result);
          }
      }
    }, db);
}

export async function scheduledCheck(db: D1Database): Promise<void> {
  const owner = crypto.randomUUID();
  const now = Date.now();
  const lease = await db.prepare(`INSERT INTO monitor_lease (id, owner, expires_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
    WHERE monitor_lease.expires_at <= ?`).bind(owner, now + 180000, now).run();
  if (!lease.meta.changes) return;
  try {
    await checkServices(undefined, db);
  } finally {
    await db.prepare("DELETE FROM monitor_lease WHERE id = 1 AND owner = ?").bind(owner).run();
  }
}
