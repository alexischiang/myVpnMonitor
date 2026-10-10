import * as React from "react"

import { getRequestActivity, subscribeRequestActivity } from "@/api"
import { Progress } from "@/components/ui/progress"

// Requests that finish sooner than this never show the bar.
const SHOW_DELAY_MS = 150
const TRICKLE_INTERVAL_MS = 300
const FINISH_HOLD_MS = 300
// The bar only reaches 100 when every request in the burst has finished.
const WAITING_CEILING = 90

// Page-wide progress bar for requests the user is waiting on. It advances with the share of the
// current burst that has finished and creeps toward the ceiling in between, because a single
// request reports no progress of its own.
export function RequestProgress() {
  const activity = React.useSyncExternalStore(subscribeRequestActivity, getRequestActivity)
  const [value, setValue] = React.useState<number | null>(null)
  const busy = activity.pending > 0
  const finishedShare = activity.started ? (activity.started - activity.pending) / activity.started : 0
  const finishedFloor = React.useRef(0)
  finishedFloor.current = finishedShare * WAITING_CEILING

  React.useEffect(() => {
    if (!busy) {
      setValue(current => current === null ? null : 100)
      const hide = window.setTimeout(() => setValue(null), FINISH_HOLD_MS)
      return () => window.clearTimeout(hide)
    }
    // A burst that starts while the last bar is still finishing gets a bar of its own.
    setValue(current => current === 100 ? null : current)
    const show = window.setTimeout(() => setValue(current => current ?? Math.max(10, finishedFloor.current)), SHOW_DELAY_MS)
    const trickle = window.setInterval(() => setValue(current => current === null ? null : current + (WAITING_CEILING - current) * 0.08), TRICKLE_INTERVAL_MS)
    return () => {
      window.clearTimeout(show)
      window.clearInterval(trickle)
    }
  }, [busy])

  React.useEffect(() => {
    if (busy) setValue(current => current === null ? null : Math.max(current, finishedFloor.current))
  }, [busy, finishedShare])

  if (value === null) return null
  // z-60 sits one tier above Dialog and Sheet (z-50): saves started from a dialog show here too.
  return <Progress value={value} aria-label="请求进度" className="pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 rounded-none bg-transparent motion-reduce:*:transition-none" />
}
