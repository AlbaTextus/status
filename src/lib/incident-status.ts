import type { Incident, IncidentUpdate, UpdateStatusKind } from "./types";

export const UPDATE_STATUS_COLORS: Record<UpdateStatusKind, string> = {
  resolved: "#24c19a",
  monitoring: "#fbbf24",
  outage: "#f87171",
  neutral: "#91919c",
};

export function formatUpdateTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

export function resolveUpdateStatus(
  update: IncidentUpdate,
  incident: Incident,
  index: number,
  total: number
): UpdateStatusKind {
  if (update.status && update.status in UPDATE_STATUS_COLORS) {
    return update.status;
  }

  const text = (update.label || "").toLowerCase();

  // Resolved keywords
  if (
    text.includes("resolved") ||
    text.includes("解决") ||
    text.includes("恢复") ||
    (incident.resolved && index === 0)
  ) {
    return "resolved";
  }

  // Monitoring / mitigated keywords
  if (
    text.includes("monitoring") ||
    text.includes("监控") ||
    text.includes("观察") ||
    text.includes("缓解") ||
    text.includes("mitigat")
  ) {
    return "monitoring";
  }

  // Investigating / Outage keywords
  if (
    text.includes("investigating") ||
    text.includes("排查") ||
    text.includes("identified") ||
    text.includes("定位") ||
    text.includes("outage") ||
    text.includes("故障") ||
    text.includes("异常")
  ) {
    return "outage";
  }

  // Positional fallback based on incident lifecycle:
  // Update 0 is newest, Update total-1 is oldest (start of incident)
  if (index === total - 1) {
    return incident.color === "red" ? "outage" : "monitoring";
  }

  if (index > 0 && index < total - 1) {
    return "monitoring";
  }

  return incident.color === "red" ? "outage" : "monitoring";
}
