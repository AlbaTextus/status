"use client"

import { useId, useMemo, type ElementType, type ReactNode } from "react"
import { LayoutGroup, motion, useReducedMotion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { BrandWordmark } from "./brand-wordmark"
import { useHeaderCollapse } from "../hooks/use-header-collapse"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"

export type NavigationItem = { href: string; title: string; icon: LucideIcon }
export const navigationTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const

/** Status navigation and actions. */
export function SiteHeader({ items, activeHref, navigationLabel, routeKey, brandHref = "/", LinkComponent = "a", BrandLinkComponent = LinkComponent, actions }: {
  items: NavigationItem[]; activeHref?: string; navigationLabel: string; routeKey: string;
  brandHref?: string; LinkComponent?: ElementType; BrandLinkComponent?: ElementType; actions: ReactNode
}) {
  const navigationId = useId()
  const reducedMotion = Boolean(useReducedMotion())
  const { brand: collapsed } = useHeaderCollapse(routeKey)
  const MotionLink = useMemo(() => motion.create(LinkComponent), [LinkComponent])
  const transition = reducedMotion ? { duration: 0 } : navigationTransition
  return <header className="center-header" data-collapsed={collapsed}>
    <div className="center-header-inner">
      <BrandWordmark href={brandHref} collapsed={collapsed} LinkComponent={BrandLinkComponent} />
      <LayoutGroup id={navigationId}>
        <TooltipProvider><nav aria-label={navigationLabel} className="center-nav">
          {items.map(item => {
            const active = item.href === activeHref
            return <Tooltip key={item.href}>
              <TooltipTrigger render={<MotionLink href={item.href} {...(LinkComponent !== "a" ? { prefetch: true } : {})}
              className={active ? "center-nav-link is-active" : "center-nav-link"}
              aria-label={item.title} aria-current={active ? "page" : undefined} tabIndex={0}
              transition={transition} whileHover={reducedMotion ? undefined : { y: -1 }} whileTap={reducedMotion ? undefined : { scale: 0.97 }} />}>
              {active && <motion.span className="center-nav-highlight" layoutId={reducedMotion ? undefined : "active-navigation"} transition={transition} aria-hidden="true" />}
              <item.icon className="center-nav-icon" strokeWidth={1.8} aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-sans">{item.title}</TooltipContent>
            </Tooltip>
          })}
        </nav></TooltipProvider>
      </LayoutGroup>
      <div className="center-userbar">{actions}</div>
    </div>
  </header>
}
