"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, History, RefreshCw, Settings2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "./ui/button";

type RefreshContextType = {
  onRefresh?: () => void;
  refreshing?: boolean;
  setRefreshHandler: (handler: { onRefresh?: () => void; refreshing?: boolean } | null) => void;
};

const RefreshContext = createContext<RefreshContextType>({
  setRefreshHandler: () => {},
});

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [handler, setHandler] = useState<{ onRefresh?: () => void; refreshing?: boolean } | null>(null);
  return (
    <RefreshContext.Provider value={{ onRefresh: handler?.onRefresh, refreshing: handler?.refreshing, setRefreshHandler: setHandler }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useHeaderRefresh() {
  return useContext(RefreshContext);
}

export function StatusHeader({ admin = false, onRefresh, refreshing = false }: { admin?: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  const pathname = usePathname();
  const context = useHeaderRefresh();
  const activeRefresh = onRefresh ?? context.onRefresh;
  const activeRefreshing = refreshing || (context.refreshing ?? false);

  const activeHref = admin || pathname.startsWith("/admin")
    ? "/admin"
    : (pathname.startsWith("/incidents") || pathname === "/history")
    ? "/history"
    : "/";

  const isStatusPage = pathname === "/" || pathname === "";

  const actions = (
    <>
      {isStatusPage && activeRefresh && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="刷新状态"
          title="刷新状态"
          disabled={activeRefreshing}
          onClick={activeRefresh}
        >
          <RefreshCw className={activeRefreshing ? "animate-spin" : undefined} />
        </Button>
      )}
      <ThemeToggle />
    </>
  );

  return (
    <SiteHeader
      items={[
        { href: "/", title: "服务状态", icon: Activity },
        { href: "/history", title: "历史记录", icon: History },
        { href: "/admin", title: "后台管理", icon: Settings2 },
      ]}
      activeHref={activeHref}
      navigationLabel="状态服务导航"
      routeKey={pathname}
      LinkComponent={Link}
      actions={actions}
    />
  );
}

export { SiteFooter, StatusFooter } from "./site-footer";
