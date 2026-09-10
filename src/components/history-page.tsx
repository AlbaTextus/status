"use client";
import { useState } from "react";

import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { StatusHeader, StatusFooter } from "./status-chrome";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "./ui/empty";
import { beijingDate, shiftDate } from "@/lib/history";
import type { PublicState, Incident } from "@/lib/types";

export function HistoryPage({data}: {data:PublicState}) {
  const [page,setPage] = useState(0);
  const [service,setService] = useState("all");
  const end = shiftDate(beijingDate(data.generatedAt), -page*90);
  const start = shiftDate(end,-89);
  const published = data.incidents.filter(item=>item.published);
  const dateOf = (item:Incident)=>beijingDate(item.publishedAt??item.updatedAt);
  const earliest = published.map(dateOf).sort()[0];
  const visible = published.filter(item=>dateOf(item)>=start&&dateOf(item)<=end&&(service==="all"||(service==="global"?!item.serviceId:item.serviceId===service))).sort((a,b)=>(b.publishedAt??b.updatedAt).localeCompare(a.publishedAt??a.updatedAt));
  const months = new Map<string,Map<string,Incident[]>>();
  for(const item of visible){const date=dateOf(item);const month=date.slice(0,7);if(!months.has(month))months.set(month,new Map());const days=months.get(month)!;days.set(date,[...(days.get(date)??[]),item]);}
  const monthLabel = (date:string)=>{
    const d = new Date(`${date}T12:00:00Z`);
    return `${d.getUTCFullYear()}年${d.getUTCMonth()+1}月`;
  };
  return <><StatusHeader/><div className="status-shell"><main>
    <nav className="archive-breadcrumb" aria-label="面包屑"><Link href="/">AlbaTextus</Link><span>/</span><span>历史记录</span></nav>
    <div className="archive-toolbar"><div className="archive-period"><h1>历史记录</h1><Button variant="ghost" size="icon-sm" aria-label="前 90 天" disabled={!earliest||earliest>=start} onClick={()=>setPage(page+1)}><ChevronLeft/></Button><span>{monthLabel(start)} - {monthLabel(end)}</span><Button variant="ghost" size="icon-sm" aria-label="后 90 天" disabled={page===0} onClick={()=>setPage(page-1)}><ChevronRight/></Button></div>
      <div className="w-[180px]">
        <Select aria-label="筛选服务" value={service} onValueChange={val=>setService(val??"all")}>
          <SelectTrigger className="w-full h-8 text-xs sm:text-sm">
            <SelectValue placeholder="全部服务"/>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部服务</SelectItem>
            <SelectItem value="global">全站公告</SelectItem>
            {data.services.map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
    {months.size ? [...months].map(([month,days])=><section className="archive-month" key={month}><h2>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString("zh-CN",{year:"numeric",month:"long",timeZone:"UTC"})}</h2>{[...days].map(([date,items])=><div className="archive-day" key={date}><div className="archive-date"><strong>{date.slice(8)}</strong><span>{new Date(`${date}T12:00:00Z`).toLocaleDateString("zh-CN",{weekday:"short",timeZone:"UTC"})}</span></div><div className="archive-events">{items.map(item=><Link key={item.id} href={`/incidents/${item.id}`} className={`archive-event archive-${item.color??"yellow"}`}><div className="archive-event-heading"><h3>{item.title}</h3><time dateTime={item.publishedAt??item.updatedAt}>{new Date(item.publishedAt??item.updatedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Shanghai"})}</time></div><p>{item.updates[0]?.message}</p></Link>)}</div></div>)}</section>) : <Empty><EmptyHeader><EmptyMedia variant="icon"><FileText/></EmptyMedia><EmptyTitle>此时段暂无事件</EmptyTitle><EmptyDescription>所选时段和服务下没有已发布的公告或事件。</EmptyDescription></EmptyHeader></Empty>}
  </main><StatusFooter/></div></>;
}
