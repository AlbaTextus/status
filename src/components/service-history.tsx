"use client";

import { cn } from "cn";
import { availability, shiftTimelineSlot, timelineKey, timelineStatus } from "@/lib/history";
import { statusLabels, type PublicService } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function ServiceHistory({ services, now }: { services: PublicService[]; now: string }) {
  const end = timelineKey(now);
  const start = shiftTimelineSlot(end, -89);
  const slots = Array.from({ length: 90 }, (_, index) => shiftTimelineSlot(start, index));
  const slotLabel = (slot: string) => new Date(slot).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return <TooltipProvider><section className="system-panel history-panel" aria-label="系统状态历史">
    {services.map(service => {
      const history = service.timeline ?? [];
      const selected = history.filter(slice => slice.slot >= start && slice.slot <= end);
      const percentage = availability(selected);
      const score = percentage === null ? null : Number.parseFloat(percentage);
      const percentageLevel = service.result.status === "error" ? "red" : service.result.status === "maintenance" ? "yellow" : score === null ? "unknown" : score >= 99 ? "green" : score >= 90 ? "yellow" : "red";
      const buckets = new Map(history.map(slice => [slice.slot, slice]));
      return <section className="history-service" key={service.id} aria-label={`${service.name} 状态历史`}>
        <div className="history-service-heading"><div className="history-service-name">
          <Tooltip>
            <TooltipTrigger render={<h3 tabIndex={0} className={cn("history-service-title", `health-${service.result.status}`)} />}>
              {service.name}
            </TooltipTrigger>
            <TooltipContent>{statusLabels[service.result.status]}</TooltipContent>
          </Tooltip>
        </div><span className="history-uptime" data-level={percentageLevel}>{percentage ?? "暂无数据"}</span></div>
        <div className="history-bars" aria-label="过去 24 小时，共 90 格，每格代表 16 分钟的检测状态">
          {slots.map(slot => {
            const bucket = buckets.get(slot);
            const current = slot === end;
            const status = current ? service.result.status : timelineStatus(bucket);
            const label = `${slotLabel(slot)} · ${current ? `当前：${statusLabels[status]}` : bucket ? statusLabels[status] : "无检测记录"}`;
            return <Tooltip key={slot}><TooltipTrigger render={<button type="button" className={cn("history-bar", `history-${status}`, current && "history-bar-current")} aria-label={label} />} /><TooltipContent>{label}</TooltipContent></Tooltip>;
          })}
        </div>
      </section>;
    })}
  </section></TooltipProvider>;
}
