"use client"

import { useEffect, useId, useRef } from "react"
import { motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion"

const glyphs = {
  A: { width: 116, path: "M0 138 46 0H70L116 138H90L80 108H36L26 138ZM43 86H73L58 40Z" },
  L: { width: 86, path: "M0 0H26V114H86V138H0Z" },
  B: { width: 104, path: "M0 0H56C84 0 99 13 99 35 99 50 91 60 78 65 95 69 104 81 104 98 104 123 87 138 57 138H0ZM26 23V55H53C66 55 73 50 73 39 73 28 66 23 53 23ZM26 78V115H55C70 115 78 109 78 97 78 84 70 78 55 78Z" },
  T: { width: 104, path: "M0 0H104V24H65V138H39V24H0Z" },
  E: { width: 90, path: "M0 0H89V24H26V55H84V79H26V114H90V138H0Z" },
  X: { width: 110, path: "M0 0H30L55 45 80 0H110L71 67 110 138H80L55 90 30 138H0L39 67Z" },
  U: { width: 108, path: "M0 0H26V85C26 106 35 117 54 117 73 117 82 106 82 85V0H108V87C108 122 89 141 54 141 19 141 0 122 0 87Z" },
  S: { width: 100, path: "M96 14 83 35C73 26 62 21 49 21 35 21 28 27 28 36 28 46 37 50 56 55 84 62 100 73 100 96 100 124 80 141 49 141 28 141 12 134 0 122L14 101C24 111 37 118 51 118 66 118 74 112 74 102 74 92 65 87 46 82 18 75 2 64 2 41 2 15 21-3 50-3 69-3 85 3 96 14Z" },
} as const

const word = [..."ALBATEXTUS"] as (keyof typeof glyphs)[]
const placements = word.map((letter, index) => ({
  ...glyphs[letter], letter,
  x: 62 + word.slice(0, index).reduce((width, key) => width + glyphs[key].width + 13, 0),
}))

function Letter({ index, progress, reduced, dustId, fillId }: { index: number; progress: MotionValue<number>; reduced: boolean; dustId: string; fillId: string }) {
  const { path } = placements[index]
  const offset = useTransform(progress, [index * .05, index * .05 + .54], [1, 0])
  const dustOpacity = useTransform(progress, [index * .05 + .2, index * .05 + .54], [0, .6])
  return <>
    <motion.path className="brand-letter-dust" d={path} fill={`url(#${fillId})`} fillRule="evenodd" stroke="none" mask={`url(#${dustId})`} style={{ opacity: reduced ? .6 : dustOpacity }} />
    <path className="brand-letter-guide" d={path} />
    <motion.path className="brand-letter-ink" d={path} pathLength={1} strokeDasharray="1 1" style={{ strokeDashoffset: reduced ? 0 : offset }} />
  </>
}

function Lettering({ mobile, progress, reduced, gradientId }: { mobile?: boolean; progress: MotionValue<number>; reduced: boolean; gradientId: string }) {
  const id = `${gradientId}-${mobile ? "mobile" : "wide"}`
  return <svg className={`brand-constellation-art${mobile ? " is-mobile" : " is-wide"}`} viewBox={mobile ? "0 0 720 390" : "0 0 1280 260"} fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2={mobile ? "720" : "1280"} y2={mobile ? "390" : "100"} gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--constellation-blue)" /><stop offset=".44" stopColor="var(--constellation-blue)" /><stop offset="1" stopColor="var(--constellation-pink)" />
      </linearGradient>
      <filter id={`${id}-noise`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="23" />
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.5 0 0 0 -1.05" />
      </filter>
      <mask id={`${id}-dust`} maskUnits="userSpaceOnUse" x="-1280" y="-390" width="2560" height="780" style={{ maskType: "alpha" }}>
        <rect x="-1280" y="-390" width="2560" height="780" fill="white" filter={`url(#${id}-noise)`} />
      </mask>
    </defs>
    {placements.map(({ letter, x }, index) => {
      const left = mobile ? index < 4 ? x + 67 : x - placements[4].x + 19 : x
      const top = mobile ? index < 4 ? 33 : 213 : 62
      return <g key={`${letter}-${index}`} transform={`translate(${left} ${top})`}>
        <defs><linearGradient id={`${id}-${index}`} href={`#${id}`} gradientTransform={`translate(${-left} ${-top})`} /></defs>
        <g stroke={`url(#${id}-${index})`}><Letter index={index} progress={progress} reduced={reduced} dustId={`${id}-dust`} fillId={`${id}-${index}`} /></g>
      </g>
    })}
  </svg>
}

/** Scroll draws the outline; fine blue-and-blush grain stays inside the letters. */
export function BrandCard() {
  const titleId = useId()
  const gradientId = useId().replace(/:/g, "")
  const ref = useRef<HTMLElement>(null)
  const reduced = Boolean(useReducedMotion())
  const visible = useInView(ref, { amount: .05 })
  const scrollYProgress = useMotionValue(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let frame = 0
    function update() {
      frame = 0
      if (!element) return
      // Viewport bounds include CSS zoom; layout offsets do not.
      const bounds = element.getBoundingClientRect()
      const height = document.documentElement.clientHeight
      scrollYProgress.set(bounds.height > 0 ? Math.max(0, Math.min(1, (height - bounds.top) / bounds.height)) : 0)
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    observer.observe(document.body)
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [scrollYProgress])
  const progress = useSpring(scrollYProgress, { stiffness: 70, damping: 24, restDelta: .001 })

  return <section ref={ref} className="brand-constellation" aria-labelledby={titleId} data-in-view={visible}>
    <h2 id={titleId} className="sr-only">ALBATEXTUS</h2>
    <div className="brand-constellation-canvas">
      <Lettering progress={progress} reduced={reduced} gradientId={gradientId} />
      <Lettering mobile progress={progress} reduced={reduced} gradientId={gradientId} />
    </div>
  </section>
}
