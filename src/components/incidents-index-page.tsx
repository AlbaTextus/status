"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ChevronRight, FileText, TriangleAlert } from "lucide-react";
import { StatusHeader, StatusFooter } from "./status-chrome";
import { Badge } from "./ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "./ui/empty";
import { AffectedComponents } from "./affected-components";
import { UpdatesTimeline } from "./incident-page";
import { statusLabels, type PublicState } from "@/lib/types";
import { resolveIncidentColor } from "@/lib/incident-status";

interface IncidentsIndexPageProps {
  data: PublicState;
  initialSelectedId?: string;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function IncidentsIndexPage({ data, initialSelectedId }: IncidentsIndexPageProps) {
  const published = React.useMemo(() => data.incidents.filter(i => i.published), [data.incidents]);

  const [selectedId, setSelectedId] = React.useState<string>(() => {
    if (initialSelectedId && published.some(i => i.id === initialSelectedId)) {
      return initialSelectedId;
    }
    const firstActive = published.find(i => !i.resolved);
    if (firstActive) return firstActive.id;
    return published[0]?.id ?? "";
  });

  const featuredIncident = published.find(i => i.id === selectedId) ?? published[0];
  const featuredService = featuredIncident ? data.services.find(s => s.id === featuredIncident.serviceId) : undefined;
  const isFeaturedMaintenance = featuredIncident ? (resolveIncidentColor(featuredIncident) === "yellow" || featuredIncident.title.includes("维护")) : false;

  const otherIncidents = published.filter(i => i.id !== featuredIncident?.id);

  return (
    <>
      <StatusHeader />
      <div className="status-shell">
        <main>
          <nav className="archive-breadcrumb" aria-label="面包屑导航">
            <Link href="/">AlbaTextus</Link>
            <span>/</span>
            <span>事件动态</span>
          </nav>

          {featuredIncident ? (
            <>
              {/* Incident Header */}
              <div className="incident-header-section">
                <div className="incident-title-row">
                  <h1>{featuredIncident.title}</h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={featuredIncident.resolved ? "secondary" : isFeaturedMaintenance ? "outline" : "destructive"}
                      className={!featuredIncident.resolved && isFeaturedMaintenance ? "bg-(--warning)/15 text-(--warning) border-(--warning)/40" : undefined}
                    >
                      {featuredIncident.resolved ? "已解决" : isFeaturedMaintenance ? "计划维护中" : "故障处理中"}
                    </Badge>
                    {featuredService && (
                      featuredService.result.status === "error" ? (
                        <Badge variant="destructive" className="bg-(--outage)/15 text-(--outage) border-(--outage)/40">
                          {featuredService.name} 实时探测异常
                        </Badge>
                      ) : featuredService.result.status === "maintenance" ? (
                        <Badge variant="outline" className="bg-(--warning)/15 text-(--warning) border-(--warning)/40">
                          {featuredService.name} 维护中
                        </Badge>
                      ) : null
                    )}
                  </div>
                </div>
                {featuredIncident.updates[0]?.message && (
                  <p className="incident-lede-text">{featuredIncident.updates[0].message}</p>
                )}
              </div>

              {/* Affected Components */}
              <AffectedComponents
                incident={featuredIncident}
                service={featuredService}
                allServices={data.services}
              />

              {/* Updates Timeline */}
              <UpdatesTimeline incident={featuredIncident} />

              {/* Other Incidents List */}
              {otherIncidents.length > 0 && (
                <section className="past-incidents-block mt-10" aria-label="其他事件记录">
                  <div className="section-title-tag text-muted-foreground flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4" />
                      <h2>其他事件记录 ({otherIncidents.length})</h2>
                    </div>
                    <Link href="/history" className="history-link-btn text-xs">
                      查看历史归档
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>

                  <div className="past-incidents-list system-panel mt-3">
                    {otherIncidents.map(incident => {
                      const service = data.services.find(s => s.id === incident.serviceId);
                      const isItemMaintenance = resolveIncidentColor(incident) === "yellow" || incident.title.includes("维护");
                      return (
                        <button
                          key={incident.id}
                          type="button"
                          onClick={() => setSelectedId(incident.id)}
                          className="past-incident-item w-full text-left cursor-pointer"
                        >
                          <div className="past-incident-main">
                            <div className="past-incident-title-row">
                              <h3 className="past-incident-title">{incident.title}</h3>
                              <Badge
                                variant={incident.resolved ? "secondary" : isItemMaintenance ? "outline" : "destructive"}
                                className={!incident.resolved && isItemMaintenance ? "bg-(--warning)/15 text-(--warning) border-(--warning)/40" : undefined}
                              >
                                {incident.resolved ? "已解决" : isItemMaintenance ? "维护中" : "故障中"}
                              </Badge>
                              {service && (
                                <span
                                  className={`service-tag ${service.result.status === "error" ? "text-(--outage) bg-(--outage)/10 border border-(--outage)/30" : service.result.status === "maintenance" ? "text-(--warning) bg-(--warning)/10 border border-(--warning)/30" : ""}`}
                                >
                                  {service.name}{" "}
                                  {service.result.status !== "operational"
                                    ? `· ${service.result.message || statusLabels[service.result.status]}`
                                    : ""}
                                </span>
                              )}
                            </div>
                            {incident.updates[0]?.message && (
                              <p className="past-incident-summary">{incident.updates[0].message}</p>
                            )}
                            <div className="past-incident-meta">
                              <span>{incident.updates.length} 条更新</span>
                              <span>·</span>
                              <time>{formatShortDate(incident.updatedAt)}</time>
                            </div>
                          </div>
                          <ChevronRight className="past-incident-arrow size-5" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>暂无发布中的事件或公告</EmptyTitle>
                <EmptyDescription>所有服务运行良好，近期没有记录到故障或维护事件。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </main>
        <StatusFooter />
      </div>
    </>
  );
}
