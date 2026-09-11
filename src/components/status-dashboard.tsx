"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import { ArrowUpRight, Server, TriangleAlert } from "lucide-react";
import { useHeaderRefresh } from "./status-chrome";
import { HealthLabel, DisplayTime } from "./health-label";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "./ui/empty";
import type { PublicState } from "@/lib/types";
import { ServiceHistory } from "./service-history";
import { resolveIncidentColor } from "@/lib/incident-status";

export function StatusDashboard({initial}: {initial: PublicState}) {
  const [data,setData] = useState(initial);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  const { setRefreshHandler } = useHeaderRefresh();

  async function refresh() { setLoading(true); try { const response = await fetch("/api/status",{cache:"no-store"}); if(!response.ok) throw new Error(); setData(await response.json()); setError(""); } catch { setError("暂时无法获取最新状态，以下为上次成功读取的结果。"); } finally {setLoading(false);} }

  useEffect(() => {
    setRefreshHandler({ onRefresh: refresh, refreshing: loading });
    return () => setRefreshHandler(null);
  }, [loading, setRefreshHandler]);

  useEffect(() => { let active=true; const controller=new AbortController(); const timer=setInterval(async()=>{try {const response=await fetch("/api/status",{cache:"no-store",signal:controller.signal}); if(!response.ok) throw new Error();const next:PublicState=await response.json();if(active){setData(next);setError("");}}catch{if(active)setError("暂时无法获取最新状态，以下为上次成功读取的结果。");}},10000);return()=>{active=false;controller.abort();clearInterval(timer);};},[]);
  const aggregate = data.services.some(s=>s.result.status==="error") ? "error" : data.services.some(s=>s.result.status==="maintenance") ? "maintenance" : data.services.some(s=>s.result.status==="unknown") || !data.services.length ? "unknown" : "operational";
  const activeIncidents = data.incidents.filter(incident=>incident.published&&!incident.resolved);
  return <MotionConfig reducedMotion="user"><div className="status-shell"><main>
    <div className="page-heading status-page-heading"><div><h1>服务状态</h1></div></div>
    {error && <Alert variant="destructive" className="mb-5"><AlertTitle>状态读取失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {activeIncidents.length ? (
      <div className="active-announcements">
        {(() => {
          const overallColor = activeIncidents.some(inc => resolveIncidentColor(inc) === "red") ? "red" : "yellow";
          const affectedServices = Array.from(new Set(
            activeIncidents.map(inc => {
              const s = data.services.find(service => service.id === inc.serviceId);
              return s?.name ?? "全站公告";
            })
          ));

          return (
            <section className={`announcement announcement-${overallColor}`} aria-label="进行中的公告">
              <div className="announcement-heading">
                <TriangleAlert aria-hidden="true"/>
                <h2>{overallColor === "red" ? "当前有服务异常" : "当前有服务需要关注"}</h2>
              </div>
              <div className="announcement-services">
                {affectedServices.map(name => (
                  <span key={name}>{name}</span>
                ))}
              </div>
              <div className="announcement-list">
                {activeIncidents.map(incident => {
                  const service = data.services.find(service => service.id === incident.serviceId);
                  const incidentColor = resolveIncidentColor(incident);

                  return (
                    <Link
                      key={incident.id}
                      href={`/incidents/${incident.id}`}
                      className="announcement-body"
                    >
                      <TriangleAlert
                        aria-hidden="true"
                        style={{ color: incidentColor === "red" ? "var(--outage)" : "var(--warning)" }}
                      />
                      <div>
                        <h3>{incident.title}</h3>
                        <p>{incident.updates[0]?.message}</p>
                        <div className="announcement-meta">
                          {incident.updates[0]?.label} · 最近更新 <DisplayTime value={incident.updatedAt}/>{service && ` · 影响 ${service.name}`}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })()}
      </div>
    ) : (
      <div className={`health-overview health-${aggregate}`}>
        <HealthLabel result={{status:aggregate,code:null,latency:null,checkedAt:null,message:""}} />
        <span>{aggregate==="operational" ? "所有服务运行正常" : aggregate==="maintenance" ? "部分服务正在维护" : aggregate==="error" ? "部分服务当前不可用" : "正在等待服务检测"}</span>
      </div>
    )}
    {data.services.length ? <ServiceHistory services={data.services} now={data.generatedAt} /> : <section className="system-panel"><Empty><EmptyHeader><EmptyMedia variant="icon"><Server /></EmptyMedia><EmptyTitle>尚未添加服务</EmptyTitle><EmptyDescription>添加服务后，这里会显示实际检测状态。</EmptyDescription></EmptyHeader></Empty></section>}
    <Link href="/history" className="history-all-link">查看全部事件历史<ArrowUpRight className="size-4"/></Link>
  </main></div></MotionConfig>;
}
