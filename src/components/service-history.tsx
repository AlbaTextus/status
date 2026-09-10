"use client";

import { Check, CircleHelp, TriangleAlert, X } from "lucide-react";
import { cn } from "cn";
import { availability, shiftTimelineSlot, timelineKey, timelineStatus } from "@/lib/history";
import { statusLabels, type PublicService } from "@/lib/types";
import { Separator } from "./ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function ServiceHistory({ services, now }: { services: PublicService[]; now: string }) {
  const end = timelineKey(now);
  const start = shiftTimelineSlot(end, -89);
  const slots = Array.from({ length: 90 }, (_, index) => shiftTimelineSlot(start, index));
  const slotLabel = (slot: string) => new Date(slot).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return <TooltipProvider><section className="system-panel history-panel" aria-label="系统状态历史">
    <div className="history-heading"><h2>System status</h2></div>
    <Separator />
    {services.map(service => {
      const history = service.timeline ?? [];
      const selected = history.filter(slice => slice.slot >= start && slice.slot <= end);
      const percentage = availability(selected);
      const score = percentage === null ? null : Number.parseFloat(percentage);
      const percentageLevel = score === null ? "unknown" : score > 66 ? "green" : score >= 34 ? "yellow" : "red";
      const Icon = { operational: Check, maintenance: TriangleAlert, error: X, unknown: CircleHelp }[service.result.status];
      const buckets = new Map(history.map(slice => [slice.slot, slice]));
      return <section className="history-service" key={service.id} aria-label={`${service.name} 状态历史`}>
        <div className="history-service-heading"><div className="history-service-name">
          <Tooltip><TooltipTrigger render={<span tabIndex={0} className={cn("history-status-icon", `history-${service.result.status}`)} aria-label={statusLabels[service.result.status]} />}><Icon aria-hidden="true" /></TooltipTrigger><TooltipContent>{statusLabels[service.result.status]}</TooltipContent></Tooltip>
          <h3>{service.name}</h3>
        </div><span className="history-uptime" data-level={percentageLevel}>{percentage ?? "暂无数据"}</span></div>
        <div className="history-bars" aria-label="过去 24 小时，共 90 格，每格代表 16 分钟的检测状态">
          {slots.map(slot => {
            const bucket = buckets.get(slot);
            const status = timelineStatus(bucket);
            const label = `${slotLabel(slot)} · ${bucket ? statusLabels[status] : "无检测记录"}`;
            return <Tooltip key={slot}><TooltipTrigger render={<button type="button" className={cn("history-bar", `history-${status}`)} aria-label={label} />} /><TooltipContent><div><p>{label}</p>{bucket && <p>正常 {bucket.operational} 次 · 维护 {bucket.maintenance} 次 · 异常 {bucket.error} 次</p>}</div></TooltipContent></Tooltip>;
          })}
        </div>
      </section>;
    })}
  </section></TooltipProvider>;
}
