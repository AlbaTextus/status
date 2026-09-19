"use client"

import { useState, type FocusEvent, type PointerEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

/** Hover and keyboard focus share one caption; mouse clicks never leave it pinned. */
export function useInteractionCaption() {
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  return {
    title: dismissed ? null : hovered ?? focused,
    dismiss: () => setDismissed(true),
    bind: (title: string) => ({
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") { setHovered(title); setDismissed(false) }
      },
      onPointerLeave: () => setHovered(null),
      onPointerDown: () => setFocused(null),
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (event.currentTarget.matches(":focus-visible")) { setFocused(title); setDismissed(false) }
      },
      onBlur: () => setFocused(null),
    }),
  }
}

export function InteractionCaption({ title }: { title: string | null }) {
  const reducedMotion = Boolean(useReducedMotion())
  return <span className="center-nav-caption-position" aria-hidden="true">
    <AnimatePresence mode="wait">
      {title && <motion.span key={title} className="center-nav-caption"
        initial={reducedMotion ? false : { opacity: 0, y: -5, scale: 0.88 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reducedMotion ? 0 : -3, scale: reducedMotion ? 1 : 0.95 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
        {title}
      </motion.span>}
    </AnimatePresence>
  </span>
}
