export type HealthStatus = "operational" | "maintenance" | "error" | "unknown";
export type HealthResult = { status: HealthStatus; code: number | null; latency: number | null; checkedAt: string | null; message: string };
export type HealthDay = { date: string; operational: number; maintenance: number; error: number };
export type HealthSlice = { slot: string; operational: number; maintenance: number; error: number };
export type Service = {
  id: string;
  name: string;
  url: string;
  revision: string;
  result: HealthResult;
  history?: HealthDay[];
  timeline?: HealthSlice[];
  failingSince?: string | null;
  lastAutoIncidentAt?: string | null;
  maintenanceSince?: string | null;
  lastAutoMaintenanceAt?: string | null;
  autoMaintenanceIncidentId?: string | null;
  maintenanceRecoveringSince?: string | null;
  rules?: AutoPublishRules | null;
};
export type UpdateStatusKind = "resolved" | "monitoring" | "outage" | "neutral";
export type IncidentUpdate = { id: string; label: string; message: string; createdAt: string; status?: UpdateStatusKind };
export type Incident = { id: string; title: string; color?: "red" | "yellow"; serviceId: string | null; resolved: boolean; published: boolean; publishedAt: string | null; updatedAt: string; updates: IncidentUpdate[] };
export type AutoPublishRules = {
  enabled: boolean;
  errorThresholdMinutes: number;
  maintenanceThresholdMinutes: number;
  recoveryThresholdMinutes: number;
  errorMessageTemplate: string;
  maintenanceMessageTemplate: string;
  recoveryMessageTemplate: string;
};

export const defaultAutoPublishRules: AutoPublishRules = {
  enabled: true,
  errorThresholdMinutes: 5,
  maintenanceThresholdMinutes: 5,
  recoveryThresholdMinutes: 5,
  errorMessageTemplate: "检测到 {service} 持续异常已超过 {minutes} 分钟（{reason}），系统已自动发布红色预警事态。",
  maintenanceMessageTemplate: "检测到 {service} 进入维护状态已持续超过 {minutes} 分钟，系统已自动发布维护事态。",
  recoveryMessageTemplate: "检测到 {service} 服务已持续恢复正常运行满 {minutes} 分钟，相关事态已自动取消并恢复。",
};

export type Store = { version: 1; services: Service[]; incidents: Incident[]; rules?: AutoPublishRules };
export type PublicService = Omit<Service, "url" | "revision"> & { websiteUrl?: string };
export type PublicState = { services: PublicService[]; incidents: Incident[]; generatedAt: string; intervalSeconds: number };
export const statusLabels: Record<HealthStatus, string> = { operational: "运行正常", maintenance: "维护中", error: "服务异常", unknown: "等待检测" };
export const unchecked: HealthResult = { status: "unknown", code: null, latency: null, checkedAt: null, message: "尚未检测" };
