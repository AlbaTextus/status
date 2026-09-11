"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { HealthLabel } from "./health-label";
import { statusLabels, type Incident, type PublicService, type HealthStatus, type UpdateStatusKind } from "@/lib/types";
import { resolveUpdateStatus, resolveIncidentColor } from "@/lib/incident-status";
import { cn } from "cn";

interface AffectedComponentsProps {
  incident: Incident;
  service?: PublicService;
  allServices?: PublicService[];
}

function formatFullDate(dateValue: string | number): string {
  const date = new Date(dateValue);
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function formatTimeOnly(dateValue: string | number): string {
  const date = new Date(dateValue);
  return date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function formatDurationStr(ms: number): string {
  const totalMins = Math.round(ms / 60000);
  if (totalMins < 1) return "< 1 分钟";
  if (totalMins < 60) return `${totalMins} 分钟`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
}

function formatTooltipRange(start: number, end: number, isOngoing = false): string {
  const startDate = new Date(start);
  const startMonth = startDate.getMonth() + 1;
  const startDay = startDate.getDate();
  const startTime = startDate.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  const startStr = `${startMonth}月${startDay}日 ${startTime}`;
  if (isOngoing) {
    return `${startStr} → 当前 · 持续中`;
  }
  const endDate = new Date(end);
  const endTime = endDate.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  return `${startStr} → ${endTime}`;
}

export function AffectedComponents({ incident, service, allServices = [] }: AffectedComponentsProps) {
  const [mountTime] = React.useState(() => Date.now());
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Determine affected services
  const affectedList: Array<{ id: string; name: string; label: string; liveService?: PublicService }> = [];
  if (service) {
    affectedList.push({ id: service.id, name: service.name, label: "1 个受影响组件", liveService: service });
  } else if (incident.serviceId) {
    const found = allServices.find(s => s.id === incident.serviceId);
    affectedList.push({
      id: incident.serviceId,
      name: found?.name ?? "核心服务",
      label: "1 个受影响组件",
      liveService: found,
    });
  } else if (allServices.length > 0) {
    allServices.forEach(s => {
      affectedList.push({ id: s.id, name: s.name, label: "1 个受影响组件", liveService: s });
    });
  } else {
    affectedList.push({ id: "global", name: "全站基础设施", label: "1 个受影响组件" });
  }

  // Calculate incident timeline (100% focused on real incident lifecycle)
  const pubTime = Date.parse(incident.publishedAt ?? incident.updatedAt);
  const updateTimes = incident.updates.map(u => Date.parse(u.createdAt)).filter(t => !Number.isNaN(t));
  const incidentStart = Math.min(...(updateTimes.length > 0 ? updateTimes : [pubTime]), pubTime);

  const isOngoing = !incident.resolved;
  const effectiveColor = resolveIncidentColor(incident);
  const isMaintenance = effectiveColor === "yellow" || incident.title.includes("维护");

  // 1. Chronologically sort all updates
  const sortedUpdates = [...incident.updates]
    .map((u, i) => {
      const time = Date.parse(u.createdAt);
      return {
        update: u,
        time: Number.isNaN(time) ? pubTime : time,
        status: resolveUpdateStatus(u, incident, i, incident.updates.length),
      };
    })
    .sort((a, b) => a.time - b.time);

  // 2. Separate active (pre-resolution) updates from resolution
  const activeUpdates = sortedUpdates.filter((item) => item.status !== "resolved");
  const resolveUpdate = sortedUpdates.find((item) => item.status === "resolved");
  const lastUpdate = Math.max(...(updateTimes.length > 0 ? updateTimes : [pubTime]), pubTime);
  const actualOutageEnd = resolveUpdate && !isOngoing ? resolveUpdate.time : lastUpdate;
  const incidentEnd = isOngoing ? Math.max(mountTime, actualOutageEnd) : actualOutageEnd;

  const totalOutageDuration = Math.max(incidentEnd - incidentStart, 60000);
  const prePct = 5; // 5% green anchor at front representing healthy baseline
  const outagePct = 95;

  // Determine phases during the incident period (incidentStart to incidentEnd)
  interface OutagePhase {
    id: string;
    start: number;
    end: number;
    status: UpdateStatusKind;
    label: string;
    message?: string;
    duration: number;
    pct: number;
  }

  const rawPhases: Array<{
    id: string;
    start: number;
    end: number;
    status: UpdateStatusKind;
    label: string;
    message?: string;
    duration: number;
  }> = [];

  if (activeUpdates.length === 0) {
    const fallbackStatus: UpdateStatusKind = effectiveColor === "red" ? "outage" : "monitoring";
    rawPhases.push({
      id: "phase-default",
      start: incidentStart,
      end: actualOutageEnd,
      status: fallbackStatus,
      label: fallbackStatus === "outage" ? "严重故障" : (isMaintenance ? "计划维护" : "性能降级 / 关注中"),
      message: incident.updates[0]?.message,
      duration: totalOutageDuration,
    });
  } else {
    for (let i = 0; i < activeUpdates.length; i++) {
      const curr = activeUpdates[i];
      const next = activeUpdates[i + 1];
      const pStart = i === 0 ? Math.min(curr.time, incidentStart) : curr.time;
      const pEnd = next ? next.time : actualOutageEnd;
      const duration = Math.max(pEnd - pStart, 1000);
      rawPhases.push({
        id: curr.update.id || `phase-${i}`,
        start: pStart,
        end: pEnd,
        status: curr.status,
        label: curr.update.label || (curr.status === "outage" ? "严重故障" : (isMaintenance ? "计划维护" : "性能降级 / 关注中")),
        message: curr.update.message,
        duration,
      });
    }
  }

  // 3. Proportional widths reflecting REAL elapsed time across the 95% outage space
  const numPhases = rawPhases.length;
  const MIN_PCT = numPhases > 1 ? 3 : outagePct;
  const totalMinPct = Math.min(20, numPhases * MIN_PCT);
  const remainingPct = outagePct - totalMinPct;

  const outagePhases: OutagePhase[] = rawPhases.map((phase) => {
    const rawRatio = phase.duration / totalOutageDuration;
    const pct = numPhases > 1 ? Number((MIN_PCT + remainingPct * rawRatio).toFixed(2)) : outagePct;
    return {
      ...phase,
      pct,
    };
  });

  // Normalize so sum of outagePhases pct is exactly 95%
  const actualSum = outagePhases.reduce((acc, p) => acc + p.pct, 0);
  if (outagePhases.length > 0 && actualSum > 0) {
    const diff = Number((outagePct - actualSum).toFixed(2));
    outagePhases[outagePhases.length - 1].pct = Number(
      (outagePhases[outagePhases.length - 1].pct + diff).toFixed(2)
    );
  }

  // Intermediate update ticks (excluding start and end)
  const intermediateUpdates: Array<{ time: number; leftPct: number }> = [];
  let runningLeft = prePct;
  for (let i = 0; i < outagePhases.length - 1; i++) {
    runningLeft += outagePhases[i].pct;
    const nextPhase = outagePhases[i + 1];
    // Keep mid marks from colliding with start or end labels
    if (runningLeft >= 18 && runningLeft <= 86) {
      intermediateUpdates.push({
        time: nextPhase.start,
        leftPct: runningLeft,
      });
    }
  }

  return (
    <TooltipProvider delay={80}>
      <section className="affected-components-card system-panel" aria-label="受影响组件">
        <div className="affected-card-header">
          <h2>受影响组件</h2>
        </div>

        <div className="affected-card-body">
          {/* Time axis header matching actual incident start to end */}
          <div className="affected-timeline-axis-container" aria-hidden="true">
            {/* Outage start mark aligned with the beginning of the outage at 5% */}
            <div
              className="axis-tick-wrapper"
              style={{ left: `${prePct}%` }}
            >
              <span className="axis-tick-label axis-label-start">
                {formatFullDate(incidentStart)}
              </span>
            </div>

            {/* Intermediate update marks */}
            {intermediateUpdates.map((item, idx) => (
              <div
                key={idx}
                className="axis-tick-wrapper"
                style={{ left: `${item.leftPct}%` }}
              >
                <span className="axis-tick-label axis-label-mid">
                  {formatTimeOnly(item.time)}
                </span>
              </div>
            ))}

            {/* Outage end / Now mark at 100% */}
            <div
              className="axis-tick-wrapper"
              style={{ left: "100%" }}
            >
              {isOngoing ? (
                <span className="axis-tick-label axis-label-now">
                  <span className="live-beacon-dot" />
                  当前 · 持续中
                </span>
              ) : (
                <span className="axis-tick-label axis-label-resolved">
                  <CheckCircle2 className="size-3.5 inline mr-1" />
                  {formatTimeOnly(actualOutageEnd)} 已解决
                </span>
              )}
            </div>
          </div>

          {/* Component rows */}
          <div className="affected-components-list">
            {affectedList.map(item => {
              const liveStatus: HealthStatus = item.liveService?.result.status ?? "unknown";
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id} className="affected-component-row">
                  <div className="affected-component-meta">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="affected-component-name">{item.name}</span>
                      {item.liveService && <HealthLabel result={item.liveService.result} />}
                    </div>

                    <button
                      type="button"
                      className="affected-component-badge cursor-pointer hover:text-(--foreground) transition-colors inline-flex items-center gap-1"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      aria-expanded={isExpanded}
                    >
                      <span>{item.label}</span>
                      {isExpanded ? (
                        <ChevronUp className="size-3.5 opacity-70" />
                      ) : (
                        <ChevronDown className="size-3.5 opacity-70" />
                      )}
                    </button>
                  </div>

                  {/* Expandable service details */}
                  {isExpanded && item.liveService && (
                    <div className="affected-detail-box">
                      <div className="detail-item">
                        <span className="detail-label">实时状态：</span>
                        <span className="detail-value font-medium">
                          {statusLabels[liveStatus]} ({item.liveService.result.message || "无详细信息"})
                        </span>
                      </div>
                      {item.liveService.result.latency !== null && (
                        <div className="detail-item">
                          <span className="detail-label">响应延迟：</span>
                          <span className="detail-value">{item.liveService.result.latency} ms</span>
                        </div>
                      )}
                      {item.liveService.result.checkedAt && (
                        <div className="detail-item">
                          <span className="detail-label">检测时间：</span>
                          <span className="detail-value">{formatFullDate(item.liveService.result.checkedAt)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Real-proportion segmented timeline bar */}
                  <div className="affected-bar-track relative">
                    {/* Pre-incident 5% green segment: baseline healthy visual anchor without tooltip */}
                    <div
                      className="affected-bar-segment segment-operational pointer-events-none"
                      style={{ width: `${prePct}%` }}
                      aria-hidden="true"
                    />

                    {outagePhases.map((phase, idx) => {
                      const isPhaseMaintenance = phase.label?.includes("维护") || (phase.status !== "outage" && isMaintenance);
                      const isLastPhase = idx === outagePhases.length - 1;
                      const isLive = isOngoing && isLastPhase;

                      return (
                        <Tooltip key={phase.id}>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className={cn(
                                  "affected-bar-segment relative",
                                  phase.status === "outage" && "segment-outage",
                                  phase.status === "monitoring" && "segment-degraded",
                                  phase.status === "neutral" && "segment-unknown",
                                  isLive && "segment-ongoing"
                                )}
                                style={{ width: `${phase.pct}%` }}
                                aria-label={`${phase.label}: ${formatTooltipRange(phase.start, phase.end, isLive)}`}
                              />
                            }
                          />
                          <TooltipContent>
                            <div className="affected-tooltip-body">
                              <div className="affected-tooltip-time">
                                {formatTooltipRange(
                                  phase.start,
                                  phase.end,
                                  isLive
                                )}
                                <span className="opacity-75 ml-1 font-normal">
                                  · 持续 {formatDurationStr(phase.duration)}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  "affected-tooltip-status",
                                  phase.status === "outage" && "text-(--outage)",
                                  phase.status === "monitoring" && "text-(--warning)",
                                  phase.status === "neutral" && "text-muted-foreground"
                                )}
                              >
                                {phase.status === "outage" ? (
                                  <AlertTriangle className="size-3.5 shrink-0" />
                                ) : isPhaseMaintenance ? (
                                  <Clock className="size-3.5 shrink-0" />
                                ) : (
                                  <AlertTriangle className="size-3.5 shrink-0" />
                                )}
                                <span>
                                  {phase.status === "outage"
                                    ? "严重故障"
                                    : isPhaseMaintenance
                                    ? "计划维护中"
                                    : "观察与缓解中"}
                                  {phase.label ? ` (${phase.label})` : ""}
                                </span>
                              </div>
                              {phase.message && (
                                <div className="text-xs text-muted-foreground line-clamp-2 max-w-[260px] whitespace-pre-wrap">
                                  {phase.message}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
