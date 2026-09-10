"use client"

import { useSyncExternalStore, type ElementType } from "react"
import { motion } from "framer-motion"

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const getServerReducedMotion = () => true

/** Shared wordmark; each app supplies its own routing link. */
export function BrandWordmark({ footer = false, collapsed = false, href = "/", LinkComponent = "a" }: {
  footer?: boolean; collapsed?: boolean; href?: string; LinkComponent?: ElementType
}) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion)
  const compact = !footer && collapsed
  const transition = { duration: reducedMotion ? 0 : 0.56, ease: [0.22, 1, 0.36, 1] as const }
  return <LinkComponent href={href} aria-label="ALBATEXTUS 首页" className="home-brand" data-collapsed={compact}>
    <span className="home-wordmark" aria-hidden="true">
      <span>A</span>
      <motion.span className="home-wordmark-part" initial={false} animate={{ width: compact ? 0 : "auto", opacity: compact ? 0 : 1 }} transition={transition}>LBA</motion.span>
      <span>T</span>
      <motion.span className="home-wordmark-part" initial={false} animate={{ width: compact ? 0 : "auto", opacity: compact ? 0 : 1 }} transition={transition}>EXTUS</motion.span>
    </span>
  </LinkComponent>
}
