import { mutateStore, readStore } from "./store";
import { defaultAutoPublishRules, type HealthResult, type Incident, type Service } from "./types";
import { recordHealth, recordTimelineHealth } from "./history";

import { getDatabase } from "./cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

function formatTemplate(template: string, vars: { service: string; minutes: number; reason?: string; incidentType?: string }): string {
  return template
    .replace(/\{service\}/g, vars.service)
    .replace(/\{minutes\}/g, String(vars.minutes))
    .replace(/\{time\}/g, String(vars.minutes))
    .replace(/\{reason\}/g, vars.reason ?? "")
    .replace(/\{message\}/g, vars.reason ?? "")
    .replace(/\{incidentType\}/g, vars.incidentType ?? "事态");
}

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
      const globalRules = state.rules ?? defaultAutoPublishRules;

      for (const { service, result } of results) {
        const current = state.services.find(item => item.id === service.id);
        if (current?.revision === service.revision && (!current.result.checkedAt || current.result.checkedAt < result.checkedAt!)) {
          current.result = result;
          current.history = recordHealth(current.history ?? [], result);
          current.timeline = recordTimelineHealth(current.timeline ?? [], result);

          const rules = current.rules ?? globalRules;
          const errorMs = rules.errorThresholdMinutes * 60 * 1000;
          const maintenanceMsThreshold = rules.maintenanceThresholdMinutes * 60 * 1000;
          const recoveryMsThreshold = rules.recoveryThresholdMinutes * 60 * 1000;

          if (!rules.enabled) {
            current.failingSince = null;
            current.maintenanceSince = null;
            current.maintenanceRecoveringSince = null;
            continue;
          }

          // 1. Error tracking (连续异常超过设定阈值自动发布红色事态)
          if (result.status === "error") {
            current.maintenanceRecoveringSince = null;
            current.maintenanceSince = null;

            if (!current.failingSince) {
              current.failingSince = result.checkedAt ?? nowIso;
            } else {
              const failingMs = Date.now() - new Date(current.failingSince).getTime();
              if (failingMs >= errorMs) {
                const activeIncidents = state.incidents.filter(
                  inc => inc.serviceId === current.id && !inc.resolved && inc.published
                );

                if (activeIncidents.length > 0) {
                  // 如果已有进行中的事态，检查是否有未升级为故障的维护事态
                  const maintenanceIncident = activeIncidents.find(inc =>
                    inc.color === "yellow" && !inc.updates.some(u => u.status === "outage")
                  );

                  if (maintenanceIncident) {
                    maintenanceIncident.title = maintenanceIncident.title.includes("维护")
                      ? maintenanceIncident.title.replace(/计划维护|维护/, "服务异常")
                      : `${current.name} 服务异常`;
                    maintenanceIncident.color = "red";
                    maintenanceIncident.updatedAt = nowIso;
                    maintenanceIncident.updates.unshift({
                      id: crypto.randomUUID(),
                      label: "服务异常",
                      message: `检测到 ${current.name} 在维护期间出现异常并已持续超过 ${rules.errorThresholdMinutes} 分钟（${result.message}），事态已升级为红色预警。`,
                      createdAt: nowIso,
                      status: "outage",
                    });

                    current.lastAutoIncidentAt = nowIso;
                    current.autoMaintenanceIncidentId = null;
                  } else {
                    // 已有红色故障事态或已升级，绝不重复发布或追加重复动态
                    current.lastAutoIncidentAt = current.lastAutoIncidentAt ?? nowIso;
                    current.autoMaintenanceIncidentId = null;
                  }
                } else {
                  const alreadyPublishedForEpisode = current.lastAutoIncidentAt &&
                    new Date(current.lastAutoIncidentAt).getTime() >= new Date(current.failingSince).getTime();

                  if (!alreadyPublishedForEpisode) {
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
                          message: formatTemplate(rules.errorMessageTemplate, {
                            service: current.name,
                            minutes: rules.errorThresholdMinutes,
                            reason: result.message,
                          }),
                          createdAt: nowIso,
                          status: "outage",
                        },
                      ],
                    };
                    state.incidents.unshift(autoIncident);
                    current.lastAutoIncidentAt = nowIso;
                    current.autoMaintenanceIncidentId = null;
                  }
                }
              }
            }
          } else {
            current.failingSince = null;
          }

          // 2. Maintenance tracking (进入维护界面持续超过设定阈值自动发布维护事态)
          if (result.status === "maintenance") {
            current.maintenanceRecoveringSince = null;

            if (!current.maintenanceSince) {
              current.maintenanceSince = result.checkedAt ?? nowIso;
            } else {
              const maintenanceMs = Date.now() - new Date(current.maintenanceSince).getTime();
              if (maintenanceMs >= maintenanceMsThreshold) {
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
                        message: formatTemplate(rules.maintenanceMessageTemplate, {
                          service: current.name,
                          minutes: rules.maintenanceThresholdMinutes,
                          reason: result.message,
                        }),
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
          } else {
            current.maintenanceSince = null;
          }

          // 3. Operational recovery tracking (检测到正常服务后持续满设定阈值自动取消维护/异常事态)
          if (result.status === "operational") {
            current.failingSince = null;
            current.maintenanceSince = null;

            const activeIncidentsToResolve = state.incidents.filter(inc =>
              inc.serviceId === current.id && inc.published && !inc.resolved
            );

            if (activeIncidentsToResolve.length > 0) {
              if (!current.maintenanceRecoveringSince) {
                current.maintenanceRecoveringSince = result.checkedAt ?? nowIso;
              } else {
                const recoveringMs = Date.now() - new Date(current.maintenanceRecoveringSince).getTime();
                if (recoveringMs >= recoveryMsThreshold) {
                  for (const incident of activeIncidentsToResolve) {
                    incident.resolved = true;
                    incident.updatedAt = nowIso;
                    const isRed = incident.color === "red" ||
                      incident.updates.some(u => u.status === "outage") ||
                      incident.title.includes("异常");
                    const incidentType = isRed ? "服务异常事态" : "维护事态";
                    let recoveryMsg = formatTemplate(rules.recoveryMessageTemplate, {
                      service: current.name,
                      minutes: rules.recoveryThresholdMinutes,
                      incidentType,
                    });
                    if (recoveryMsg.includes("相关事态")) {
                      recoveryMsg = recoveryMsg.replace("相关事态", incidentType);
                    }
                    if (!incident.updates.some(u => u.status === "resolved")) {
                      incident.updates.unshift({
                        id: crypto.randomUUID(),
                        label: "已恢复",
                        message: recoveryMsg,
                        createdAt: nowIso,
                        status: "resolved",
                      });
                    }
                  }

                  current.maintenanceSince = null;
                  current.lastAutoMaintenanceAt = null;
                  current.autoMaintenanceIncidentId = null;
                  current.maintenanceRecoveringSince = null;
                  current.failingSince = null;
                  current.lastAutoIncidentAt = null;
                }
              }
            } else {
              current.maintenanceSince = null;
              current.lastAutoMaintenanceAt = null;
              current.autoMaintenanceIncidentId = null;
              current.maintenanceRecoveringSince = null;
              current.failingSince = null;
              current.lastAutoIncidentAt = null;
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
