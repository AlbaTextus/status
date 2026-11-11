"use client"

import { useEffect, useState } from "react"

/** Preserve the hysteresis bands while sharing one RAF-scheduled listener per header. */
export function useHeaderCollapse(routeKey?: string, home = false) {
  const [collapsed, setCollapsed] = useState({ brand: false, header: false })
  useEffect(() => {
    let frame = 0
    function update() {
      frame = 0
      const y = window.scrollY
      setCollapsed(current => {
        const brand = y > 80 ? true : y < 20 ? false : current.brand
        const header = home ? y > 320 ? true : y < 260 ? false : current.header : brand
        return brand === current.brand && header === current.header ? current : { brand, header }
      })
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    if (home) window.addEventListener("hashchange", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (home) window.removeEventListener("hashchange", schedule)
      window.cancelAnimationFrame(frame)
    }
  }, [routeKey, home])
  return collapsed
}
