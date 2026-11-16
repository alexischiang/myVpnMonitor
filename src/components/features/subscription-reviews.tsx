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
type ShareReview = {
  userId: string
  userLabel: string
  userMissing: boolean
  status: ReviewStatus
  province: string
  cities: string[]
  sources?: Array<"pull" | "presence">
  firstAt: string
  lastAt: string
  reviewedAt?: string
  reviewedBy?: string
  note?: string
  previousReview?: { status: Decision; reviewedAt: string; note: string; cities: string[] }
}
type ReviewsResponse = { reviews: ShareReview[]; counts: { pending: number; reviewed: number } }

const STATUS_BADGES: Record<ReviewStatus, { label: string; tone: "warning" | "success" | "danger" }> = {
  pending: { label: "待复核", tone: "warning" },
  normal: { label: "正常", tone: "success" },
  shared: { label: "分享", tone: "danger" },
}

const SOURCE_LABELS = { pull: "订阅拉取", presence: "同时在线" } as const

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const badge = STATUS_BADGES[status] || STATUS_BADGES.pending
  return <Badge tone={badge.tone}>{badge.label}</Badge>
}

/** Same-province cross-city subscription pulls (no Telegram alert) waiting for an admin's verdict. */
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
      <Card className="gap-0 overflow-hidden py-0" title="同省跨市" description="同一省份的多个城市：24 小时内的订阅拉取，或节点上同一时刻的在线 IP。相邻城市常共用运营商地址池，不发送提醒，由管理员人工判断；跨省仍会直接提醒。">
        {!reviews.length ? <EmptyState title={filter === "pending" ? "没有待复核的用户" : "暂无复核记录"} description={filter === "pending" ? "出现同省跨市的订阅拉取或同时在线时，用户会自动加入这里。" : "切换到其他状态查看记录。"} />
          : <SimpleTable caption="订阅复核列表" minWidth={900} columns={["用户", "来源", "省份", "城市", "最近发现", "状态", "复核", "操作"]} rows={reviews} rowKey={review => review.userId}
            cells={review => [
              review.userMissing ? <span className="text-muted-foreground">{review.userLabel}（已删除）</span>
                : <Link className="font-medium underline-offset-4 hover:underline" to={`/users/detail/${encodeURIComponent(review.userId)}?tab=subscription-access`}>{review.userLabel}</Link>,
              <span className="flex flex-wrap gap-1">{(review.sources?.length ? review.sources : ["pull" as const]).map(source => <Badge key={source} size="sm" tone={source === "presence" ? "info" : "neutral"}>{SOURCE_LABELS[source]}</Badge>)}</span>,
              <span>{review.province}</span>,
              <span className="whitespace-normal">{review.cities.join("、")}</span>,
              <span className="grid text-muted-foreground tabular-nums"><span>{formatDateTime(review.lastAt)}</span>{review.firstAt !== review.lastAt ? <span className="text-xs">首次 {formatDateTime(review.firstAt)}</span> : null}</span>,
              <ReviewStatusBadge status={review.status} />,
              review.status !== "pending" ? <span className="grid max-w-xs text-xs text-muted-foreground"><span className="tabular-nums">{review.reviewedBy || "-"} · {review.reviewedAt ? formatDateTime(review.reviewedAt) : "-"}</span>{review.note ? <span className="whitespace-normal text-foreground">{review.note}</span> : null}</span>
                : review.previousReview ? <span className="max-w-xs whitespace-normal text-xs text-muted-foreground">曾判定为{STATUS_BADGES[review.previousReview.status]?.label}（{review.previousReview.cities.join("、")}），出现新城市后重新待复核</span>
                : <span className="text-muted-foreground">-</span>,
              <Button type="button" variant={review.status === "pending" ? "primary" : "secondary"} size="sm" onClick={() => openReview(review)} aria-label={`复核 ${review.userLabel}`}><ClipboardCheck />{review.status === "pending" ? "复核" : "修改"}</Button>,
            ]} />}
      </Card>
    </div>

    <Dialog open={Boolean(reviewing)} onOpenChange={open => { if (!open && !saving) setReviewing(null) }}>
      <DialogContent title="复核订阅拉取" description={reviewing ? `${reviewing.userLabel} · ${reviewing.province}：${reviewing.cities.join("、")}` : ""}>
        <div className="grid gap-4">
          {reviewing && !reviewing.userMissing ? <p className="text-sm text-muted-foreground">先在 <Link className="text-foreground underline underline-offset-4" to={`/users/detail/${encodeURIComponent(reviewing.userId)}?tab=subscription-access`}>订阅访问</Link> 中查看拉取时间、IP 和客户端，再给出结论。</p> : null}
          <Textarea label="备注" placeholder="例如：同一运营商移动网络，时间连续" value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="danger" loading={saving === "shared"} disabled={Boolean(saving)} onClick={() => void decide("shared")}>判定为分享</Button>
            <Button type="button" variant="primary" loading={saving === "normal"} disabled={Boolean(saving)} onClick={() => void decide("normal")}>标记为正常</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
