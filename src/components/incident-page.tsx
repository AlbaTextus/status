"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { StatusFooter, StatusHeader } from "./status-chrome";
import { HealthLabel, DisplayTime } from "./health-label";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import type { Incident, PublicService } from "@/lib/types";
export function IncidentPage({incident,service}: {incident:Incident;service?:PublicService}) {
  return <><StatusHeader /><div className="status-shell"><main><Link href="/history" className="back-link"><ChevronLeft className="size-4" />返回历史记录</Link><section className="system-panel event-overview"><div className="event-title"><h1>{incident.title}</h1><Badge variant="secondary">{incident.resolved ? "已结束" : "进行中"}</Badge></div><p className="event-summary">{incident.updates[0]?.message}</p><div className="event-meta">最近更新：<DisplayTime value={incident.updatedAt} /></div></section>
    {service&&<section className="live-service mt-6"><div className="live-service-heading"><h2>{service.name}</h2><HealthLabel result={service.result}/></div></section>}
    <section className="system-panel updates-panel"><div className="panel-heading"><h2>更新记录</h2></div><Separator/><div className="incident-updates">{incident.updates.map(update=><article className="incident-update" key={update.id}><span className="update-track" aria-hidden="true"><span/></span><div className="update-copy"><h3>{update.label}</h3><p>{update.message}</p><div className="update-date"><DisplayTime value={update.createdAt}/></div></div></article>)}</div></section>
    </main><StatusFooter/></div></>;
}
