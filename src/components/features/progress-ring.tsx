import * as React from "react"

import { cn } from "@/lib/utils"

type ProgressRingProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Progress from 0 to 100. */
  value: number
  /** Largest outer diameter in pixels; the ring shrinks to fit narrower containers. */
  size?: number
  /** Ring thickness in pixels. */
  strokeWidth?: number
  /** Degrees of the circle the track covers; below 360 leaves a gap centered at the bottom (a gauge). */
  sweep?: number
  /** Accessible description of the progress. */
  label: string
  /** Content centered inside the ring. */
  children?: React.ReactNode
}

/**
 * Circular progress or gauge. The indicator uses the current text color and the track the same
 * color at 20% opacity, so set the color with a `text-*` class.
 */
export function ProgressRing({ value, size = 104, strokeWidth = 10, sweep = 360, label, className, children, ...props }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  const arc = Math.min(360, Math.max(1, sweep))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const trackLength = circumference * arc / 360
  // SVG circles start at 3 o'clock; rotate so the arc starts at the left end of the bottom gap.
  const rotation = 90 + (360 - arc) / 2
  const circle = { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: "currentColor", strokeWidth }
  return <div data-slot="progress-ring" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} className={cn("relative inline-grid aspect-square w-full place-items-center", className)} style={{ maxWidth: size }} {...props}>
    <svg className="absolute inset-0 size-full" style={{ transform: `rotate(${rotation}deg)` }} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle {...circle} strokeOpacity={0.2} strokeLinecap={arc < 360 ? "round" : "butt"} strokeDasharray={`${trackLength} ${circumference}`} />
      <circle {...circle} strokeLinecap={clamped > 0 ? "round" : "butt"} strokeDasharray={`${trackLength * clamped / 100} ${circumference}`} className="transition-[stroke-dasharray] duration-500 motion-reduce:transition-none" />
    </svg>
    {children ? <div className="relative grid place-items-center text-center text-foreground">{children}</div> : null}
  </div>
}
