"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { StatusFooter, StatusHeader } from "./status-chrome";
import { Badge } from "./ui/badge";
import { AffectedComponents } from "./affected-components";
import type { Incident, IncidentUpdate, PublicService, UpdateStatusKind } from "@/lib/types";

interface IncidentPageProps {
  incident: Incident;
  service?: PublicService;
  allServices?: PublicService[];
}

import {
  UPDATE_STATUS_COLORS,
  formatUpdateTimestamp,
  resolveUpdateStatus,
} from "@/lib/incident-status";

export { UPDATE_STATUS_COLORS, formatUpdateTimestamp, resolveUpdateStatus };

export function UpdatesTimeline({ incident }: { incident: Incident }) {
  const total = incident.updates.length;
  const statuses = incident.updates.map((u, i) => resolveUpdateStatus(u, incident, i, total));

  return (
    <section className="incident-updates-card system-panel" aria-label="Updates">
      <div className="updates-card-header">
        <h2>Updates</h2>
      </div>
      <div className="updates-timeline-list">
        {incident.updates.map((update, index) => {
          const currentStatus = statuses[index];
          const nextStatus = index < total - 1 ? statuses[index + 1] : null;

          const topColor = UPDATE_STATUS_COLORS[currentStatus];
          const bottomColor = nextStatus ? UPDATE_STATUS_COLORS[nextStatus] : topColor;

          // Half top color, half bottom color with subtle transition in between!
          const lineBackground = topColor === bottomColor
            ? topColor
            : `linear-gradient(to bottom, ${topColor} 0%, ${topColor} 46%, ${bottomColor} 54%, ${bottomColor} 100%)`;

          return (
            <article key={update.id} className="update-timeline-item">
              <div className="update-timeline-track" aria-hidden="true">
                <span className={`update-node-dot node-${currentStatus}`} />
                {index !== total - 1 && (
                  <span
                    className="update-node-line"
                    style={{ background: lineBackground }}
                  />
                )}
              </div>
              <div className="update-timeline-content">
                <h3 className={`update-timeline-label label-${currentStatus}`}>{update.label}</h3>
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
