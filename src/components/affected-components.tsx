"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleHelp, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { HealthLabel } from "./health-label";
import { statusLabels, type Incident, type PublicService, type HealthStatus, type UpdateStatusKind } from "@/lib/types";
import { resolveUpdateStatus } from "@/lib/incident-status";
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

function formatTooltipRange(start: number, end: number, isOngoing = false): string {
  const startDate = new Date(start);
  const startStr = startDate.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Shanghai",
  });
  if (isOngoing) {
    return `${startStr} → 当前 · Now`;
  }
  const endDate = new Date(end);
  const endStr = endDate.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Shanghai",
  });
  return `${startStr} → ${endStr}`;
}

export function AffectedComponents({ incident, service, allServices = [] }: AffectedComponentsProps) {
  const [mountTime] = React.useState(() => Date.now());
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Determine affected services
  const affectedList: Array<{ id: string; name: string; label: string; liveService?: PublicService }> = [];
  if (service) {
    affectedList.push({ id: service.id, name: service.name, label: "1 affected component", liveService: service });
  } else if (incident.serviceId) {
    const found = allServices.find(s => s.id === incident.serviceId);
    affectedList.push({
      id: incident.serviceId,
      name: found?.name ?? "Core Service",
      label: "1 affected component",
      liveService: found,
    });
  } else if (allServices.length > 0) {
    allServices.forEach(s => {
      affectedList.push({ id: s.id, name: s.name, label: "1 affected component", liveService: s });
    });
  } else {
    affectedList.push({ id: "global", name: "Global Infrastructure", label: "1 affected component" });
  }

  // Calculate incident timeline
  const pubTime = Date.parse(incident.publishedAt ?? incident.updatedAt);
  const updateTimes = incident.updates.map(u => Date.parse(u.createdAt)).filter(t => !Number.isNaN(t));
  const incidentStart = Math.min(...(updateTimes.length > 0 ? updateTimes : [pubTime]), pubTime);

  const isOngoing = !incident.resolved;
  const lastUpdate = Math.max(...(updateTimes.length > 0 ? updateTimes : [pubTime]), pubTime);
  const incidentEnd = isOngoing ? Math.max(mountTime, lastUpdate) : lastUpdate;

  const outageDuration = Math.max(incidentEnd - incidentStart, 15 * 60 * 1000);

  // Calculate segment percentage proportions
  let prePct: number;
  let outagePct: number;
  let postPct: number;
  let windowStart: number;
  let windowEnd: number;

  if (isOngoing) {
    prePct = 15;
    outagePct = 85;
    postPct = 0;
    const preDuration = (outageDuration / 0.85) * 0.15;
    windowStart = incidentStart - preDuration;
    windowEnd = incidentEnd;
  } else {
    prePct = 15;
    outagePct = 70;
    postPct = 15;
    const paddingDuration = (outageDuration / 0.70) * 0.15;
    windowStart = incidentStart - paddingDuration;
    windowEnd = incidentEnd + paddingDuration;
  }

  const totalWindow = windowEnd - windowStart;

  // Determine phases during the outage period (incidentStart to incidentEnd)
  interface OutagePhase {
    id: string;
    start: number;
    end: number;
    status: UpdateStatusKind;
    label: string;
    message?: string;
    pct: number;
  }

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
  const actualOutageEnd = resolveUpdate && !isOngoing ? resolveUpdate.time : incidentEnd;

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
    const fallbackStatus: UpdateStatusKind = incident.color === "red" ? "outage" : "monitoring";
    rawPhases.push({
      id: "phase-default",
      start: incidentStart,
      end: actualOutageEnd,
      status: fallbackStatus,
      label: fallbackStatus === "outage" ? "严重故障" : "性能降级 / 关注中",
      duration: Math.max(actualOutageEnd - incidentStart, 60000),
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
        label: curr.update.label || (curr.status === "outage" ? "严重故障" : "性能降级 / 关注中"),
        message: curr.update.message,
        duration,
      });
    }
  }

  // Proportional widths within outagePct with guaranteed minimum width for each phase
  const totalOutageDuration = rawPhases.reduce((acc, p) => acc + p.duration, 0) || 1;
  const numPhases = rawPhases.length;

  const MIN_SHARE = numPhases > 1 ? 0.15 : 1.0;
  const totalMinShare = Math.min(0.6, numPhases * MIN_SHARE);
  const remainingShare = Math.max(0, 1.0 - totalMinShare);

  const outagePhases: OutagePhase[] = rawPhases.map((phase) => {
    const rawRatio = phase.duration / totalOutageDuration;
    const share = numPhases > 1 ? MIN_SHARE + remainingShare * rawRatio : 1.0;
    const pct = Number((share * outagePct).toFixed(2));
    return {
      ...phase,
      pct,
    };
  });

  // Normalize so sum of outagePhases pct matches outagePct
  const actualOutageSum = outagePhases.reduce((acc, p) => acc + p.pct, 0);
  if (outagePhases.length > 0 && actualOutageSum > 0) {
    const diff = outagePct - actualOutageSum;
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
    if (
      nextPhase.start > incidentStart + 60000 &&
      nextPhase.start < incidentEnd - 60000
    ) {
      intermediateUpdates.push({
        time: nextPhase.start,
        leftPct: runningLeft,
      });
    }
  }

  return (
    <TooltipProvider delay={80}>
      <section className="affected-components-card system-panel" aria-label="Affected components">
        <div className="affected-card-header">
          <h2>Affected components</h2>
        </div>

        <div className="affected-card-body">
          {/* Time axis header matching OpenAI Statuspage */}
          <div className="affected-timeline-axis-container" aria-hidden="true">
            {/* Outage start mark */}
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

            {/* Outage end / Now mark */}
            <div
              className="axis-tick-wrapper"
              style={{ left: isOngoing ? "100%" : `${prePct + outagePct}%` }}
            >
              <span className={`axis-tick-label ${isOngoing ? "axis-label-now" : "axis-label-end"}`}>
                {isOngoing ? "Now · 当前" : formatTimeOnly(incidentEnd)}
              </span>
            </div>
          </div>

          {/* Component rows */}
          <div className="affected-components-list">
            {affectedList.map(item => {
              const liveStatus: HealthStatus = item.liveService?.result.status ?? "unknown";
              const isLiveDown = liveStatus === "error" || liveStatus === "maintenance";
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

                  {/* Segmented timeline bar */}
                  <div className="affected-bar-track relative">
                    {/* Pre-incident segment: ALWAYS GREEN (baseline healthy state before incident) */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className="affected-bar-segment segment-operational"
                            style={{ width: `${prePct}%` }}
                            aria-label={`Pre-incident: ${formatTooltipRange(windowStart, incidentStart)}`}
                          />
                        }
                      />
                      <TooltipContent>
                        <div className="affected-tooltip-body">
                          <div className="affected-tooltip-time">
                            {formatTooltipRange(windowStart, incidentStart)}
                          </div>
                          <div className="affected-tooltip-status text-(--success)">
                            <CheckCircle2 className="size-3.5 shrink-0" />
                            <span>Operational · 故障前正常</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>

                    {/* Outage phases: RED (outage), YELLOW (monitoring), etc. */}
                    {outagePhases.map((phase, idx) => (
                      <Tooltip key={phase.id}>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className={cn(
                                "affected-bar-segment relative",
                                phase.status === "outage" && "segment-outage",
                                phase.status === "monitoring" && "segment-degraded",
                                phase.status === "neutral" && "segment-unknown"
                              )}
                              style={{ width: `${phase.pct}%` }}
                              aria-label={`${phase.label}: ${formatTooltipRange(phase.start, phase.end, isOngoing && idx === outagePhases.length - 1)}`}
                            />
                          }
                        />
                        <TooltipContent>
                          <div className="affected-tooltip-body">
                            <div className="affected-tooltip-time">
                              {formatTooltipRange(
                                phase.start,
                                phase.end,
                                isOngoing && idx === outagePhases.length - 1
                              )}
                            </div>
                            <div
                              className={cn(
                                "affected-tooltip-status",
                                phase.status === "outage" && "text-(--outage)",
                                phase.status === "monitoring" && "text-(--warning)",
                                phase.status === "neutral" && "text-muted-foreground"
                              )}
                            >
                              <AlertTriangle className="size-3.5 shrink-0" />
                              <span>
                                {phase.status === "outage"
                                  ? "Major outage · 严重故障"
                                  : "Monitoring / Degraded · 观察与缓解中"}
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
                    ))}

                    {/* Post-incident segment (only when incident is resolved) */}
                    {!isOngoing && postPct > 0 && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className={`affected-bar-segment ${isLiveDown ? "segment-outage" : "segment-operational"}`}
                              style={{ width: `${postPct}%` }}
                              aria-label={`Post-incident: ${formatTooltipRange(incidentEnd, windowEnd)}`}
                            />
                          }
                        />
                        <TooltipContent>
                          <div className="affected-tooltip-body">
                            <div className="affected-tooltip-time">
                              {formatTooltipRange(incidentEnd, windowEnd)}
                            </div>
                            <div
                              className={`affected-tooltip-status ${isLiveDown ? "text-(--outage)" : "text-(--success)"}`}
                            >
                              {isLiveDown ? (
                                <>
                                  <AlertTriangle className="size-3.5 shrink-0" />
                                  <span>Major outage · 当前探测仍异常</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="size-3.5 shrink-0" />
                                  <span>Operational · 恢复正常</span>
                                </>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
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
