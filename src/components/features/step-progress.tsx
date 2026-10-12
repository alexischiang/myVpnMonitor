import { Stepper } from "@/components/arc/stepper/stepper"

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed"
export type ProgressStep = { id: string; label: string; status: StepStatus }

const statusText: Record<StepStatus, string> = { pending: "等待中", running: "进行中", done: "已完成", skipped: "无需执行", failed: "失败" }

// Progress of a multi-step operation: the ordered steps with their state. The first step that is neither
// done, skipped nor failed is the current one; when none is left the whole flow reads as complete.
export function StepProgress({ steps, label, className }: { steps: ProgressStep[]; label: string; className?: string }) {
  const open = steps.findIndex(step => step.status === "pending" || step.status === "running")
  return (
    <Stepper
      className={className}
      label={label}
      current={open < 0 ? steps.length : open}
      details="all"
      steps={steps.map(step => ({ id: step.id, label: step.label, description: statusText[step.status], error: step.status === "failed" ? statusText.failed : undefined }))}
    />
  )
}
