"use client"

import { useEffect, useId, useMemo, useState, type ElementType, type ReactNode } from "react"
import { LayoutGroup, motion, useReducedMotion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { BrandWordmark } from "./brand-wordmark"
import { InteractionCaption, useInteractionCaption } from "./interaction-caption"

export type NavigationItem = { href: string; title: string; icon: LucideIcon }
export const navigationTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const

/** The account center and other AlbaTextus apps render the exact same header. */
export function SiteHeader({ items, activeHref, navigationLabel, routeKey, brandHref = "/", LinkComponent = "a", BrandLinkComponent = LinkComponent, actions }: {
  items: NavigationItem[]; activeHref?: string; navigationLabel: string; routeKey: string;
  brandHref?: string; LinkComponent?: ElementType; BrandLinkComponent?: ElementType; actions: ReactNode
}) {
  const navigationId = useId()
  const reducedMotion = Boolean(useReducedMotion())
  const [collapsed, setCollapsed] = useState(false)
  const caption = useInteractionCaption()
  const MotionLink = useMemo(() => motion.create(LinkComponent), [LinkComponent])
  const transition = reducedMotion ? { duration: 0 } : navigationTransition
  useEffect(() => {
    let frame = 0
    function update() {
      frame = 0
      setCollapsed(current => window.scrollY > 80 ? true : window.scrollY < 20 ? false : current)
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [routeKey])
  return <header className="center-header" data-collapsed={collapsed} onKeyDown={event => { if (event.key === "Escape") caption.dismiss() }}>
    <div className="center-header-inner">
      <BrandWordmark href={brandHref} collapsed={collapsed} LinkComponent={BrandLinkComponent} />
      <LayoutGroup id={navigationId}>
        <nav aria-label={navigationLabel} className="center-nav">
          {items.map(item => {
            const active = item.href === activeHref
            return <MotionLink key={item.href} href={item.href} {...(LinkComponent !== "a" ? { prefetch: true } : {})}
              className={active ? "center-nav-link is-active" : "center-nav-link"}
              aria-label={item.title} aria-current={active ? "page" : undefined} tabIndex={0}
              {...caption.bind(item.title)}
              transition={transition} whileHover={reducedMotion ? undefined : { y: -1 }} whileTap={reducedMotion ? undefined : { scale: 0.97 }}>
              {active && <motion.span className="center-nav-highlight" layoutId={reducedMotion ? undefined : "active-navigation"} transition={transition} aria-hidden="true" />}
              <item.icon className="center-nav-icon" strokeWidth={1.8} aria-hidden="true" />
            </MotionLink>
          })}
        </nav>
      </LayoutGroup>
      <div className="center-userbar">{actions}</div>
    </div>
    <InteractionCaption title={caption.title} />
  </header>
}
