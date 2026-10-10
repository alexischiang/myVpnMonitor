import { Circle, CircleCheck, CircleSlash, CircleX, Loader2 } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed"
export type ProgressStep = { id: string; label: string; status: StepStatus }

const statusText: Record<StepStatus, string> = { pending: "等待中", running: "进行中", done: "已完成", skipped: "无需执行", failed: "失败" }

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
  if (status === "done") return <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
  if (status === "failed") return <CircleX className="size-4 text-destructive" aria-hidden="true" />
  if (status === "skipped") return <CircleSlash className="size-4" aria-hidden="true" />
  return <Circle className="size-4" aria-hidden="true" />
}

// Progress of a multi-step operation: a bar for the share of steps that are over (a running step
// counts as half) and the ordered steps with their state.
export function StepProgress({ steps, label, className }: { steps: ProgressStep[]; label: string; className?: string }) {
  const settled = steps.reduce((total, step) => total + (step.status === "pending" ? 0 : step.status === "running" ? 0.5 : 1), 0)
  return (
    <div className={cn("grid gap-2", className)}>
      <Progress value={steps.length ? (settled / steps.length) * 100 : 0} aria-label={label} />
      <ol className="flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-live="polite">
        {steps.map((step, index) => (
          <li key={step.id} className={cn("flex items-center gap-1.5", step.status === "pending" || step.status === "skipped" ? "text-muted-foreground" : step.status === "failed" ? "text-destructive" : "")}>
            <StepIcon status={step.status} />
            <span className="font-medium">{index + 1}. {step.label}</span>
            <span className="text-muted-foreground">{statusText[step.status]}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
