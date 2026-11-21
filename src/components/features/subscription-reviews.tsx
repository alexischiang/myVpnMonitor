import * as React from "react"
import { Link } from "react-router-dom"
import { ClipboardCheck, RefreshCw } from "lucide-react"

import { fetchJson, postJson } from "@/api"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Textarea } from "@/components/arc/textarea/textarea"
import { EmptyState } from "@/components/features/shared"
import { SimpleTable } from "@/components/features/simple-table"
import { toast } from "@/components/features/toast"
import { formatDateTime } from "@/utils"

type ReviewStatus = "pending" | "normal" | "shared"
type Decision = Exclude<ReviewStatus, "pending">
export type RiskLevel = "normal" | "review" | "alert" | "critical"
export type RiskFactor = { key: string; label: string; points: number; detail: string }

type ShareReview = {
  userId: string
  userLabel: string
  userMissing: boolean
  status: ReviewStatus
  score?: number
  level?: RiskLevel
  factors?: RiskFactor[]
  province: string
  provinces?: string[]
  cities: string[]
  sources?: Array<"pull" | "presence">
  firstAt: string
  lastAt: string
  reviewedAt?: string
  reviewedBy?: string
  note?: string
  previousReview?: { status: Decision; reviewedAt: string; note: string; cities: string[]; provinces?: string[]; score?: number }
}
type ReviewsResponse = { reviews: ShareReview[]; counts: { pending: number; reviewed: number } }

const STATUS_BADGES: Record<ReviewStatus, { label: string; tone: "warning" | "success" | "danger" }> = {
  pending: { label: "待复核", tone: "warning" },
  normal: { label: "正常", tone: "success" },
  shared: { label: "分享", tone: "danger" },
}

const RISK_LEVEL_BADGES: Record<RiskLevel, { label: string; tone: "neutral" | "warning" | "danger" }> = {
  normal: { label: "正常", tone: "neutral" },
  review: { label: "待复核", tone: "warning" },
  alert: { label: "疑似分享", tone: "danger" },
  critical: { label: "极高风险", tone: "danger" },
}

const SOURCE_LABELS = { pull: "订阅拉取", presence: "同时在线" } as const

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const badge = STATUS_BADGES[status] || STATUS_BADGES.pending
  return <Badge tone={badge.tone}>{badge.label}</Badge>
}

export function RiskLevelBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const badge = RISK_LEVEL_BADGES[level] || RISK_LEVEL_BADGES.normal
  return <Badge tone={badge.tone}>{score !== undefined ? `${score} 分 · ${badge.label}` : badge.label}</Badge>
}

/** Share risk review queue: users reaching the review/alert score thresholds, ordered by risk score. */
export function SubscriptionReviewsPage() {
  const [data, setData] = React.useState<ReviewsResponse | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState("pending")
  const [reviewing, setReviewing] = React.useState<ShareReview | null>(null)
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState<Decision | "">("")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchJson<ReviewsResponse>("/api/subscription-reviews"))
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取失败")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void refresh() }, [refresh])

  function openReview(review: ShareReview) {
    setReviewing(review)
    setNote(review.note || "")
  }

  async function decide(decision: Decision) {
    if (!reviewing) return
    setSaving(decision)
    try {
      await postJson(`/api/subscription-reviews/${encodeURIComponent(reviewing.userId)}`, { decision, note })
      toast({ type: "success", title: `已标记为${STATUS_BADGES[decision].label}：${reviewing.userLabel}` })
      setReviewing(null)
      await refresh()
    } catch (reason) {
      toast({ type: "error", title: reason instanceof Error ? reason.message : "保存复核结论失败" })
    } finally {
      setSaving("")
    }
  }

  const reviews = (data?.reviews || []).filter(review => filter === "all" || (filter === "pending" ? review.status === "pending" : review.status !== "pending"))
  const filterOptions = [
    { value: "pending", label: `待复核 ${data?.counts.pending ?? 0}` },
    { value: "reviewed", label: `已复核 ${data?.counts.reviewed ?? 0}` },
    { value: "all", label: "全部" },
  ]

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={1} /><Skeleton lines={5} /></div>

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
      <SegmentedControl label="复核状态" value={filter} onValueChange={setFilter} options={filterOptions} />
      <ActionButton variant="secondary" icon={<RefreshCw />} collapse onClick={() => void refresh()} label="刷新列表" pending={loading} />
    </div>

    {error ? <div className="px-4 lg:px-6"><Alert tone="danger" title="无法读取订阅复核列表">{error}</Alert></div> : null}

    <div className="px-4 lg:px-6">
      <Card className="gap-0 overflow-hidden py-0" title="疑似分享复核" description="风险评分达到 40 分自动进入复核，70 分触发报警，90 分标记为极高风险；按风险分从高到低排列。">
        {!reviews.length ? <EmptyState title={filter === "pending" ? "没有待复核的用户" : "暂无复核记录"} description={filter === "pending" ? "当用户的分享风险评分达到 40 分时，会自动加入这里。" : "切换到其他状态查看记录。"} />
          : <SimpleTable caption="订阅复核列表" minWidth={1020} columns={["用户", "风险分", "命中规则", "省份 / 城市", "来源", "最近发现", "状态", "复核", "操作"]} rows={reviews} rowKey={review => review.userId}
            cells={review => {
              const provinceText = review.provinces?.length ? review.provinces.join("、") : review.province
              const score = typeof review.score === "number" ? review.score : undefined
              const level: RiskLevel = review.level || (score !== undefined ? (score >= 90 ? "critical" : score >= 70 ? "alert" : score >= 40 ? "review" : "normal") : "review")
              return [
                review.userMissing ? <span className="text-muted-foreground">{review.userLabel}（已删除）</span>
                  : <Link className="font-medium underline-offset-4 hover:underline" to={`/users/detail/${encodeURIComponent(review.userId)}?tab=subscription-access`}>{review.userLabel}</Link>,
                score !== undefined
                  ? <span className="tabular-nums"><RiskLevelBadge level={level} score={score} /></span>
                  : <span className="text-muted-foreground">-</span>,
                review.factors?.length
                  ? <ul className="grid max-w-xs gap-0.5 text-xs whitespace-normal">{review.factors.slice(0, 3).map(factor => <li key={factor.key}><span className="font-medium">{factor.label}</span> <span className="text-muted-foreground tabular-nums">+{factor.points}</span></li>)}{review.factors.length > 3 ? <li className="text-muted-foreground">等共 {review.factors.length} 项</li> : null}</ul>
                  : <span className="text-muted-foreground">-</span>,
                <span className="grid max-w-xs whitespace-normal text-sm"><span>{provinceText || "-"}</span>{review.cities?.length ? <span className="text-xs text-muted-foreground">{review.cities.join("、")}</span> : null}</span>,
                <span className="flex flex-wrap gap-1">{(review.sources?.length ? review.sources : ["pull" as const]).map(source => <Badge key={source} size="sm" tone={source === "presence" ? "info" : "neutral"}>{SOURCE_LABELS[source]}</Badge>)}</span>,
                <span className="grid text-muted-foreground tabular-nums"><span>{formatDateTime(review.lastAt)}</span>{review.firstAt !== review.lastAt ? <span className="text-xs">首次 {formatDateTime(review.firstAt)}</span> : null}</span>,
                <ReviewStatusBadge status={review.status} />,
                review.status !== "pending" ? <span className="grid max-w-xs text-xs text-muted-foreground"><span className="tabular-nums">{review.reviewedBy || "-"} · {review.reviewedAt ? formatDateTime(review.reviewedAt) : "-"}</span>{review.note ? <span className="whitespace-normal text-foreground">{review.note}</span> : null}</span>
                  : review.previousReview ? <span className="max-w-xs whitespace-normal text-xs text-muted-foreground">曾判定为{STATUS_BADGES[review.previousReview.status]?.label}，出现新地点或风险升高后重新待复核</span>
                  : <span className="text-muted-foreground">-</span>,
                <Button type="button" variant={review.status === "pending" ? "primary" : "secondary"} size="sm" onClick={() => openReview(review)} aria-label={`复核 ${review.userLabel}`}><ClipboardCheck />{review.status === "pending" ? "复核" : "修改"}</Button>,
              ]
            }} />}
      </Card>
    </div>

    <Dialog open={Boolean(reviewing)} onOpenChange={open => { if (!open && !saving) setReviewing(null) }}>
      <DialogContent title="复核疑似分享" description={reviewing ? `${reviewing.userLabel}${typeof reviewing.score === "number" ? ` · ${reviewing.score} 分` : ""} · ${(reviewing.provinces?.length ? reviewing.provinces.join("、") : reviewing.province) || "-"}` : ""}>
        <div className="grid gap-4">
          {reviewing && !reviewing.userMissing ? <p className="text-sm text-muted-foreground">先在 <Link className="text-foreground underline underline-offset-4" to={`/users/detail/${encodeURIComponent(reviewing.userId)}?tab=subscription-access`}>订阅访问</Link> 中查看得分明细、在线 IP、拉取记录或配置白名单 IP，再给出结论。</p> : null}
          {reviewing?.factors?.length ? <ul className="grid gap-1 rounded-md border bg-muted/40 p-3 text-xs">
            {reviewing.factors.map(factor => <li key={factor.key} className="flex items-baseline justify-between gap-2"><span><span className="font-medium">{factor.label}</span>：{factor.detail}</span><span className="shrink-0 font-mono tabular-nums">+{factor.points}</span></li>)}
          </ul> : null}
          <Textarea label="备注" placeholder="例如：本人出差 / 已将家里固定 IP 加入白名单" value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="danger" loading={saving === "shared"} disabled={Boolean(saving)} onClick={() => void decide("shared")}>判定为分享</Button>
            <Button type="button" variant="primary" loading={saving === "normal"} disabled={Boolean(saving)} onClick={() => void decide("normal")}>标记为正常</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
