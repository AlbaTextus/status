"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { StatusFooter, StatusHeader } from "./status-chrome";
import { Badge } from "./ui/badge";
import { AffectedComponents } from "./affected-components";
import type { Incident, PublicService } from "@/lib/types";

interface IncidentPageProps {
  incident: Incident;
  service?: PublicService;
  allServices?: PublicService[];
}

export function formatUpdateTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Shanghai",
  });
}

export function getUpdateStatusKind(label: string, resolved: boolean, index: number): "resolved" | "monitoring" | "neutral" {
  const text = label.toLowerCase();
  if (text.includes("resolved") || text.includes("解决") || text.includes("恢复") || (resolved && index === 0)) {
    return "resolved";
  }
  if (
    text.includes("monitoring") ||
    text.includes("监控") ||
    text.includes("investigating") ||
    text.includes("排查") ||
    text.includes("identified") ||
    text.includes("定位") ||
    text.includes("update") ||
    text.includes("更新")
  ) {
    return "monitoring";
  }
  return "neutral";
}

export function UpdatesTimeline({ incident }: { incident: Incident }) {
  return (
    <section className="incident-updates-card system-panel" aria-label="Updates">
      <div className="updates-card-header">
        <h2>Updates</h2>
      </div>
      <div className="updates-timeline-list">
        {incident.updates.map((update, index) => {
          const statusKind = getUpdateStatusKind(update.label, incident.resolved, index);
          return (
            <article key={update.id} className="update-timeline-item">
              <div className="update-timeline-track" aria-hidden="true">
                <span className={`update-node-dot node-${statusKind}`} />
                {index !== incident.updates.length - 1 && <span className="update-node-line" />}
              </div>
              <div className="update-timeline-content">
                <h3 className={`update-timeline-label label-${statusKind}`}>{update.label}</h3>
                <div className="update-timeline-message">{update.message}</div>
                <time className="update-timeline-time" dateTime={update.createdAt}>
                  {formatUpdateTimestamp(update.createdAt)}
                </time>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function IncidentPage({ incident, service, allServices = [] }: IncidentPageProps) {
  const isServiceDown = service ? service.result.status !== "operational" : false;

  return (
    <>
      <StatusHeader />
      <div className="status-shell">
        <main>
          <div className="incident-nav-bar">
            <Link href="/incidents" className="back-link">
              <ChevronLeft className="size-4" />
              返回事件列表
            </Link>
          </div>

          <div className="incident-header-section">
            <div className="incident-title-row">
              <h1>{incident.title}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={incident.resolved ? "secondary" : "destructive"}>
                  {incident.resolved ? "已解决 · Resolved" : "故障处理中 · Active Outage"}
                </Badge>
                {service && isServiceDown && (
                  <Badge variant="destructive" className="bg-(--outage)/15 text-(--outage) border-(--outage)/40">
                    {service.name} 实时探测异常
                  </Badge>
                )}
              </div>
            </div>
            {incident.updates[0]?.message && (
              <p className="incident-lede-text">{incident.updates[0].message}</p>
            )}
          </div>

          {/* Affected Components Card */}
          <AffectedComponents incident={incident} service={service} allServices={allServices} />

          {/* Updates Card */}
          <UpdatesTimeline incident={incident} />
        </main>
        <StatusFooter />
      </div>
    </>
  );
}
