"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, History, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "./ui/button";

import { cn } from "@/lib/utils";

type RefreshContextType = {
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  setRefreshHandler: (handler: { onRefresh?: () => void | Promise<void>; refreshing?: boolean } | null) => void;
};

const RefreshContext = createContext<RefreshContextType>({
  setRefreshHandler: () => {},
});

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [handler, setHandler] = useState<{ onRefresh?: () => void | Promise<void>; refreshing?: boolean } | null>(null);
  return (
    <RefreshContext.Provider value={{ onRefresh: handler?.onRefresh, refreshing: handler?.refreshing, setRefreshHandler: setHandler }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useHeaderRefresh() {
  return useContext(RefreshContext);
}

function HeaderRefreshButton({
  onRefresh,
  refreshing = false,
}: {
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  const [rotations, setRotations] = useState(0);

  const handleClick = async () => {
    if (spinning || refreshing || !onRefresh) return;
    setSpinning(true);
    setRotations(r => r + 1);

    const minSpinDuration = 700;
    const start = Date.now();

    try {
      await Promise.resolve(onRefresh());
    } finally {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, minSpinDuration - elapsed);
      if (remaining > 0) {
        setTimeout(() => {
          setSpinning(false);
        }, remaining);
      } else {
        setSpinning(false);
      }
    }
  };

  const isBusy = spinning || refreshing;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="刷新状态"
      title="刷新状态"
      disabled={isBusy}
      onClick={handleClick}
      className="disabled:opacity-100 cursor-pointer"
    >
      <RefreshCw
        style={{
          transform: `rotate(${rotations * 360}deg)`,
        }}
        className={cn(
          "transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
          refreshing && !spinning && "animate-spin"
        )}
      />
    </Button>
  );
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
        <HeaderRefreshButton
          onRefresh={activeRefresh}
          refreshing={activeRefreshing}
        />
      )}
      <ThemeToggle />
    </>
  );

  return (
    <SiteHeader
      items={[
        { href: "/", title: "服务状态", icon: Activity },
        { href: "/history", title: "历史记录", icon: History },
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
