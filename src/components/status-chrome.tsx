"use client";
import Link from "next/link";
import { Activity, History, RefreshCw, Settings2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "./ui/button";
export function StatusHeader({ admin = false, onRefresh, refreshing = false }: { admin?: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  const pathname = usePathname();
  const activeHref = admin ? "/admin" : (pathname.startsWith("/incidents") || pathname==="/history") ? "/history" : "/";
  const actions = <>{onRefresh && <Button type="button" variant="ghost" size="icon" aria-label="刷新状态" title="刷新状态" disabled={refreshing} onClick={onRefresh}><RefreshCw className={refreshing ? "animate-spin" : undefined} /></Button>}<ThemeToggle /></>;
  return <SiteHeader items={[{href:"/",title:"服务状态",icon:Activity},{href:"/history",title:"历史记录",icon:History},{href:"/admin",title:"后台管理",icon:Settings2}]} activeHref={activeHref} navigationLabel="状态服务导航" routeKey={pathname} LinkComponent={Link} actions={actions} />;
}
export function StatusFooter() { return <footer className="site-footer"><span>AlbaTextus Status</span><p>服务状态自动检测 · 事件更新由管理员发布</p></footer>; }
