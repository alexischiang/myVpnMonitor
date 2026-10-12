import * as React from "react"
import { AlertTriangle, Clock3, History, Loader2, Play, RefreshCw } from "lucide-react"
import { toast } from "@/components/features/toast"

import { fetchJson, postJson } from "@/api"
import { EmptyState } from "@/components/features/shared"
import { formatDateTime, formatDuration } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Card as ArcCard } from "@/components/arc/card/card"
import { SimpleTable } from "@/components/features/simple-table"

type SyncJobRunStatus = "running" | "success" | "partial" | "failed" | "interrupted"

type SyncJobRun = {
  id: string
  jobId: string
  trigger: string
  status: SyncJobRunStatus
  startedAt: string
  finishedAt: string
  durationMs: number | null
  summary: Record<string, unknown>
  error: string
}

type SyncJob = {
  id: string
  name: string
  description: string
  intervalMs: number | null
  configured: boolean
  running: boolean
  runningSince: string
  lastCheckedAt: string
  lastRun: SyncJobRun | null
  lastSuccessAt: string
  stats24h: { total: number; failed: number }
}

type SyncJobsResponse = {
  checkedAt: string
  modules: Array<{ id: string; name: string; jobs: SyncJob[] }>
}

type PanelSyncStep = { id: string; name: string; status: "success" | "failed"; error: string }

const RETENTION_DAYS = 14
const IDLE_POLL_MS = 30_000
const RUNNING_POLL_MS = 5_000

const triggerLabels: Record<string, string> = { schedule: "定时", startup: "启动", manual: "手动", cron: "外部定时" }
const probeStatusLabels: Record<string, string> = { online: "在线", offline: "离线", disabled: "停用", unknown: "未知" }

function RunStatusBadge({ status }: { status: SyncJobRunStatus }) {
  if (status === "success") return <Badge tone="success">成功</Badge>
  if (status === "partial") return <Badge tone="warning">部分失败</Badge>
  if (status === "failed") return <Badge tone="danger">失败</Badge>
  if (status === "interrupted") return <Badge tone="warning">已中断</Badge>
  return <Badge><Loader2 className="animate-spin" />执行中</Badge>
}

function JobStatusBadge({ job }: { job: SyncJob }) {
  if (!job.configured) return <Badge>未配置</Badge>
  if (job.running) return <RunStatusBadge status="running" />
  if (!job.lastRun) return <Badge>暂无记录</Badge>
  return <RunStatusBadge status={job.lastRun.status} />
}

function intervalLabel(job: SyncJob) {
  return job.intervalMs ? `每 ${formatDuration(job.intervalMs)}` : "外部触发"
}

function numberField(summary: Record<string, unknown>, key: string) {
  const value = Number(summary[key])
  return Number.isFinite(value) ? value : 0
}

function summaryText(jobId: string, summary: Record<string, unknown>) {
  if (jobId === "xui-panel-sync") {
    const report = summary.catalogV2 as Record<string, unknown> | null | undefined
    if (!report) return ""
    return `V2 权益：检查 ${numberField(report, "checked")} · 更新 ${numberField(report, "updated")} · 缺失 ${numberField(report, "missing")} · 跳过 ${numberField(report, "skipped")} · 失败 ${numberField(report, "failed")} · 冲突 ${numberField(report, "conflicts")}`
  }
  if (jobId === "xui-inbound-probe") {
    const byStatus = (summary.byStatus || {}) as Record<string, number>
    const parts = Object.entries(byStatus).map(([status, count]) => `${probeStatusLabels[status] || status} ${count}`)
    return [`共 ${numberField(summary, "total")} 个入站`, ...parts].join(" · ")
  }
  if (jobId === "xui-traffic-prune") return `删除 ${numberField(summary, "deleted")} 条${summary.cutoff ? ` · 早于 ${summary.cutoff}` : ""}`
  if (jobId === "subscription-refresh") return `共 ${numberField(summary, "total")} 个订阅 · 失败 ${numberField(summary, "failed")}`
  if (jobId === "referral-settlement") return `结算 ${numberField(summary, "settled")} 笔 · 拒绝 ${numberField(summary, "rejected")} 笔`
  return ""
}

function panelSteps(run: SyncJobRun) {
  return Array.isArray(run.summary.steps) ? run.summary.steps as PanelSyncStep[] : []
}

function LastRunText({ job }: { job: SyncJob }) {
  if (job.running) return <span className="tabular-nums">开始于 {formatDateTime(job.runningSince)}</span>
  if (job.lastRun) return <span className="tabular-nums">{formatDateTime(job.lastRun.startedAt)} · {triggerLabels[job.lastRun.trigger] || job.lastRun.trigger}</span>
  if (job.lastCheckedAt) return <span className="tabular-nums">最近检查 {formatDateTime(job.lastCheckedAt)}</span>
  return <span>-</span>
}

function JobActions({ job, starting, onRun, onHistory, className }: { job: SyncJob; starting: boolean; onRun: (job: SyncJob) => void; onHistory: (job: SyncJob) => void; className?: string }) {
  const busy = starting || job.running
  return <div className={className}>
    <ActionButton variant="secondary" className="min-h-11 md:min-h-0" disabled={!job.configured || busy} onClick={() => onRun(job)} label="立即执行" pendingLabel="执行中" pending={busy} />
    <Button variant="ghost" className="min-h-11 md:min-h-0" onClick={() => onHistory(job)}><History />查看记录</Button>
  </div>
}

function RunHistorySheet({ job, onOpenChange }: { job: SyncJob | null; onOpenChange: (open: boolean) => void }) {
  const [runs, setRuns] = React.useState<SyncJobRun[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const jobId = job?.id || ""
  // Reload when the job's latest run changes, so an open sheet follows a run in progress.
  const latestKey = job ? `${job.lastRun?.id || ""}:${job.lastRun?.status || ""}:${job.running}` : ""

  React.useEffect(() => {
    if (!jobId) return
    let cancelled = false
    setLoading(true)
    fetchJson<{ runs: SyncJobRun[] }>(`/api/sync-jobs/${encodeURIComponent(jobId)}/runs?limit=50`)
      .then(result => { if (!cancelled) { setRuns(result.runs); setError("") } })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "无法读取执行记录") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [jobId, latestKey])

  React.useEffect(() => { if (!jobId) setRuns([]) }, [jobId])

  return <Drawer open={Boolean(job)} onOpenChange={onOpenChange}>
    <DrawerContent title={job?.name || "执行记录"} description={`最近 50 次执行，记录保留 ${RETENTION_DAYS} 天。`} className="w-full gap-0 sm:max-w-xl"><div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <div className="p-4"><Alert tone="danger" title={error} /></div> : null}
        {loading && !runs.length ? <div className="grid gap-3 p-4"><Skeleton lines={3} /><Skeleton lines={3} /><Skeleton lines={3} /></div> : null}
        {!loading && !error && !runs.length ? <div className="p-4"><EmptyState title="暂无执行记录" description={job?.id === "referral-settlement" ? "只记录实际结算了返利或执行失败的轮次。" : "任务执行后会在这里显示结果。"} /></div> : null}
        {runs.length ? <div className="grid gap-3 gap-0">
          {runs.map(run => {
            const steps = panelSteps(run)
            const text = summaryText(run.jobId, run.summary)
            return <ArcCard key={run.id} className="rounded-none border-x-0 border-t-0" title={<><RunStatusBadge status={run.status} />
                  <Badge>{triggerLabels[run.trigger] || run.trigger}</Badge>
                  <span className="tabular-nums">{formatDateTime(run.startedAt)}</span></>} description={`耗时 ${run.status === "running" ? "进行中" : formatDuration(run.durationMs)}${text ? ` · ${text}` : ""}`}>{steps.length ? <div className="flex flex-wrap gap-2">
                  {steps.map(step => <Badge key={step.id} tone={step.status === "success" ? "success" : "danger"} title={step.error || undefined}>{step.name}：{step.status === "success" ? "成功" : "失败"}</Badge>)}
                </div> : null}{run.error ? <p className="text-sm text-muted-foreground line-clamp-none break-all text-destructive">{run.error}</p> : null}</ArcCard>
          })}
        </div> : null}
      </div></DrawerContent>
  </Drawer>
}

export function SyncJobsPage() {
  const [data, setData] = React.useState<SyncJobsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [startingIds, setStartingIds] = React.useState<string[]>([])
  const [historyJobId, setHistoryJobId] = React.useState("")

  const refresh = React.useCallback(async (background = false) => {
    setLoading(true)
    try {
      setData(await fetchJson<SyncJobsResponse>("/api/sync-jobs", { background }))
      setError("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法读取同步任务状态")
    } finally {
      setLoading(false)
    }
  }, [])

  const jobs = React.useMemo(() => data?.modules.flatMap(module => module.jobs) || [], [data])
  const anyRunning = jobs.some(job => job.running)

  React.useEffect(() => {
    const refreshIfVisible = () => { if (!document.hidden) void refresh() }
    refreshIfVisible()
    document.addEventListener("visibilitychange", refreshIfVisible)
    return () => document.removeEventListener("visibilitychange", refreshIfVisible)
  }, [refresh])

  React.useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(true) }, anyRunning ? RUNNING_POLL_MS : IDLE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh, anyRunning])

  async function runJob(job: SyncJob) {
    setStartingIds(current => [...current, job.id])
    try {
      await postJson(`/api/sync-jobs/${encodeURIComponent(job.id)}/run`)
      toast({ type: "success", title: `已开始执行：${job.name}` })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : `无法执行：${job.name}` })
    } finally {
      await refresh()
      setStartingIds(current => current.filter(id => id !== job.id))
    }
  }

  const historyJob = jobs.find(job => job.id === historyJobId) || null
  const unconfigured = jobs.filter(job => !job.configured)

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={2} /><Skeleton lines={5} /><Skeleton lines={4} /></div>

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge><Clock3 />记录保留 {RETENTION_DAYS} 天</Badge>
        <Badge>{anyRunning ? "有任务执行中，每 5 秒更新" : "每 30 秒自动更新"}</Badge>
      </div>
      <ActionButton variant="secondary" className="min-h-11 md:min-h-0" onClick={() => void refresh()} label="刷新状态" pending={loading} />
    </div>

    {error ? <div className="px-4 lg:px-6"><Alert tone="danger" title="无法读取同步任务状态">{error}</Alert></div> : null}
    {unconfigured.length ? <div className="px-4 lg:px-6"><Alert title="部分任务未启用">3x-ui 未配置，{unconfigured.map(job => job.name).join("、")}不会定时执行，也无法手动执行。</Alert></div> : null}

    {data ? data.modules.map(module => <div key={module.id} className="px-4 lg:px-6">
      <Card className="gap-0 overflow-hidden py-0" title={module.name} description={`${module.jobs.length} 个任务 · 24 小时内执行 ${module.jobs.reduce((total, job) => total + job.stats24h.total, 0)} 次，异常 ${module.jobs.reduce((total, job) => total + job.stats24h.failed, 0)} 次`}><div className="grid gap-3 gap-0 md:hidden">
          {module.jobs.map(job => <ArcCard key={job.id} className="flex-wrap rounded-none border-x-0 border-t-0" title={<><JobStatusBadge job={job} /><span>{job.name}</span></>} description={job.description} headerAction={<>
              <JobActions job={job} starting={startingIds.includes(job.id)} onRun={runJob} onHistory={item => setHistoryJobId(item.id)} className="grid w-full grid-cols-2 gap-2" />
            </>}><p className="text-sm text-muted-foreground tabular-nums">{intervalLabel(job)} · <LastRunText job={job} />{job.lastRun && !job.running ? ` · 耗时 ${formatDuration(job.lastRun.durationMs)}` : ""}</p><p className="text-sm text-muted-foreground tabular-nums">24 小时：{job.stats24h.total} 次，异常 {job.stats24h.failed} 次</p>{job.lastRun?.error && !job.running ? <p className="text-sm text-muted-foreground line-clamp-none break-all text-destructive">{job.lastRun.error}</p> : null}</ArcCard>)}
        </div><div className="hidden md:block">
          <SimpleTable caption="任务列表" columns={["任务", "周期", "状态", "上次执行", "耗时", "24 小时", "操作"]} rows={module.jobs} rowKey={(job) => job.id} cells={(job) => [<span className="max-w-sm whitespace-normal"><p className="font-medium">{job.name}</p>
                  <p className="text-xs text-muted-foreground">{job.description}</p>
                  {job.lastRun?.error && !job.running ? <p className="mt-1 break-all text-xs text-destructive">{job.lastRun.error}</p> : null}</span>, <span className="text-muted-foreground">{intervalLabel(job)}</span>, <JobStatusBadge job={job} />, <span className="text-muted-foreground"><LastRunText job={job} /></span>, <span className="text-right tabular-nums">{job.lastRun && !job.running ? formatDuration(job.lastRun.durationMs) : "-"}</span>, <span className="text-right tabular-nums">{job.stats24h.total} 次{job.stats24h.failed ? <span className="text-destructive"> · 异常 {job.stats24h.failed}</span> : null}</span>, <JobActions job={job} starting={startingIds.includes(job.id)} onRun={runJob} onHistory={item => setHistoryJobId(item.id)} className="flex justify-end gap-2" />]} />
        </div></Card>
    </div>) : null}

    <RunHistorySheet job={historyJob} onOpenChange={open => { if (!open) setHistoryJobId("") }} />
  </>
}
