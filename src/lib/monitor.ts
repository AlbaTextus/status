import { mutateStore, readStore } from "./store";
import type { HealthResult, Incident, Service } from "./types";
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
      const nowIso = new Date().toISOString();
      const THIRTY_MINUTES_MS = 30 * 60 * 1000;
      const TEN_MINUTES_MS = 10 * 60 * 1000;

      for (const { service, result } of results) {
        const current = state.services.find(item => item.id === service.id);
        if (current?.revision === service.revision && (!current.result.checkedAt || current.result.checkedAt < result.checkedAt!)) {
          current.result = result;
          current.history = recordHealth(current.history ?? [], result);
          current.timeline = recordTimelineHealth(current.timeline ?? [], result);

          // 1. Error tracking (连续异常超过 30 分钟自动发布红色事态)
          if (result.status === "error") {
            current.maintenanceRecoveringSince = null;
            current.maintenanceSince = null;

            if (!current.failingSince) {
              current.failingSince = result.checkedAt ?? nowIso;
            } else {
              const failingMs = Date.now() - new Date(current.failingSince).getTime();
              if (failingMs >= THIRTY_MINUTES_MS) {
                const hasActiveIncident = state.incidents.some(
                  inc => inc.serviceId === current.id && !inc.resolved && inc.published
                );
                const alreadyPublishedForEpisode = current.lastAutoIncidentAt &&
                  new Date(current.lastAutoIncidentAt).getTime() >= new Date(current.failingSince).getTime();

                if (!hasActiveIncident && !alreadyPublishedForEpisode) {
                  const autoIncident: Incident = {
                    id: crypto.randomUUID(),
                    title: `${current.name} 服务异常`,
                    color: "red",
                    serviceId: current.id,
                    resolved: false,
                    published: true,
                    publishedAt: nowIso,
                    updatedAt: nowIso,
                    updates: [
                      {
                        id: crypto.randomUUID(),
                        label: "服务异常",
                        message: `检测到 ${current.name} 持续异常已超过 30 分钟（${result.message}），系统已自动发布红色预警事态。`,
                        createdAt: nowIso,
                        status: "outage",
                      },
                    ],
                  };
                  state.incidents.unshift(autoIncident);
                  current.lastAutoIncidentAt = nowIso;
                }
              }
            }
          } else {
            current.failingSince = null;
            current.lastAutoIncidentAt = null;
          }

          // 2. Maintenance tracking (进入维护界面持续超过 10 分钟自动发布维护事态)
          if (result.status === "maintenance") {
            current.maintenanceRecoveringSince = null;

            if (!current.maintenanceSince) {
              current.maintenanceSince = result.checkedAt ?? nowIso;
            } else {
              const maintenanceMs = Date.now() - new Date(current.maintenanceSince).getTime();
              if (maintenanceMs >= TEN_MINUTES_MS) {
                const hasActiveIncident = state.incidents.some(
                  inc => inc.serviceId === current.id && !inc.resolved && inc.published
                );
                const alreadyPublishedForEpisode = current.lastAutoMaintenanceAt &&
                  new Date(current.lastAutoMaintenanceAt).getTime() >= new Date(current.maintenanceSince).getTime();

                if (!hasActiveIncident && !alreadyPublishedForEpisode) {
                  const autoIncident: Incident = {
                    id: crypto.randomUUID(),
                    title: `${current.name} 计划维护`,
                    color: "yellow",
                    serviceId: current.id,
                    resolved: false,
                    published: true,
                    publishedAt: nowIso,
                    updatedAt: nowIso,
                    updates: [
                      {
                        id: crypto.randomUUID(),
                        label: "计划维护",
                        message: `检测到 ${current.name} 进入维护状态已持续超过 10 分钟，系统已自动发布维护事态。`,
                        createdAt: nowIso,
                        status: "monitoring",
                      },
                    ],
                  };
                  state.incidents.unshift(autoIncident);
                  current.autoMaintenanceIncidentId = autoIncident.id;
                  current.lastAutoMaintenanceAt = nowIso;
                }
              }
            }
          }

          // 3. Operational recovery tracking (检测到正常服务后持续满 10 分钟自动取消维护事态)
          if (result.status === "operational") {
            const activeMaintenanceIncident = current.autoMaintenanceIncidentId
              ? state.incidents.find(inc => inc.id === current.autoMaintenanceIncidentId && !inc.resolved)
              : null;

            if (activeMaintenanceIncident) {
              if (!current.maintenanceRecoveringSince) {
                current.maintenanceRecoveringSince = result.checkedAt ?? nowIso;
              } else {
                const recoveringMs = Date.now() - new Date(current.maintenanceRecoveringSince).getTime();
                if (recoveringMs >= TEN_MINUTES_MS) {
                  activeMaintenanceIncident.resolved = true;
                  activeMaintenanceIncident.updatedAt = nowIso;
                  activeMaintenanceIncident.updates.unshift({
                    id: crypto.randomUUID(),
                    label: "已恢复",
                    message: `检测到 ${current.name} 服务已持续恢复正常运行满 10 分钟，维护事态已自动取消并恢复。`,
                    createdAt: nowIso,
                    status: "resolved",
                  });

                  current.maintenanceSince = null;
                  current.lastAutoMaintenanceAt = null;
                  current.autoMaintenanceIncidentId = null;
                  current.maintenanceRecoveringSince = null;
                }
              }
            } else {
              current.maintenanceSince = null;
              current.lastAutoMaintenanceAt = null;
              current.autoMaintenanceIncidentId = null;
              current.maintenanceRecoveringSince = null;
            }
          }
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
