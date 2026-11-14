import * as React from "react"
import { FileText } from "lucide-react"

import { fetchJson } from "@/api"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { EmptyState } from "@/components/features/shared"
import { SimpleTable } from "@/components/features/simple-table"
import { type SubscriptionPlace as Place, placeLabel } from "@/components/features/subscription-place"
import { formatDateTime } from "@/utils"

type AccessWindow = { requests: number; ips: number; cities: string[]; clients: string[] }
type AccessIp = Place & { ip: string; count: number; firstAt: string; lastAt: string; clients: string[]; viaNode: boolean }
type CityChange = { at: string; from: string; to: string; fromIp: string; ip: string; minutes: number }
type AccessRow = Place & {
  id: string
  at: string
  ip: string
  ipSource: string
  country: string
  userAgent: string
  client: string
  target: string
  result: string
  statusCode: number | null
  viaNode: boolean
  headers: Record<string, string>
}
type SubscriptionAccess = {
  days: number
  retentionDays: number
  lastAlert: { at: string; cities: string[] } | null
  summary: { suspicious: boolean; windows: Record<"24h" | "all", AccessWindow>; hints: string[]; cityChanges: CityChange[]; viaNodeRequests: number; ips: AccessIp[] }
  rows: AccessRow[]
}

const RANGE_OPTIONS = [{ value: "7", label: "7 天" }, { value: "30", label: "30 天" }, { value: "90", label: "90 天" }]
const RESULT_LABELS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ok: { label: "成功", tone: "success" },
  expired: { label: "已到期", tone: "warning" },
  disabled: { label: "已停用", tone: "warning" },
  "activation-required": { label: "待激活", tone: "warning" },
  "migration-failed": { label: "迁移失败", tone: "danger" },
  error: { label: "失败", tone: "danger" },
  aborted: { label: "已中断", tone: "neutral" },
}

function ResultBadge({ row }: { row: AccessRow }) {
  const result = RESULT_LABELS[row.result] || { label: row.result || "-", tone: "neutral" as const }
  return <Badge tone={result.tone}>{result.label}{row.statusCode && row.result !== "ok" ? ` ${row.statusCode}` : ""}</Badge>
}

function formatGap(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  if (minutes < 48 * 60) return `${Math.round(minutes / 6) / 10} 小时`
  return `${Math.round(minutes / 1440)} 天`
}

function IpCell({ ip, viaNode }: { ip: string; viaNode: boolean }) {
  return <span className="flex items-center gap-2 font-mono tabular-nums">{ip || "-"}{viaNode ? <Badge size="sm">经节点</Badge> : null}</span>
}

/** Pulls of one user's subscription link: who fetched it from where, to spot a link shared with other people. */
export function UserSubscriptionAccess({ userId }: { userId: string }) {
  const [range, setRange] = React.useState("7")
  const [data, setData] = React.useState<SubscriptionAccess | null>(null)
  const [error, setError] = React.useState("")
  const [detail, setDetail] = React.useState<AccessRow | null>(null)

  React.useEffect(() => {
    let current = true
    setData(null)
    setError("")
    fetchJson<SubscriptionAccess>(`/api/users/${userId}/subscription-access?days=${range}`)
      .then(value => { if (current) setData(value) })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "读取失败") })
    return () => { current = false }
  }, [userId, range])

  const windows = data?.summary.windows
  const stats = windows ? [
    { label: "24 小时请求", value: windows["24h"].requests },
    { label: "24 小时城市", value: windows["24h"].cities.length },
    { label: `${range} 天请求`, value: windows.all.requests },
    { label: `${range} 天 IP`, value: windows.all.ips },
    { label: `${range} 天境内城市`, value: windows.all.cities.join("、") || "-" },
    { label: `${range} 天客户端`, value: windows.all.clients.join("、") || "-" },
  ] : []

  return <>
    <Card title="订阅访问" description={`拉取订阅链接时的 IP 和请求头 · 保留 ${data?.retentionDays ?? 90} 天`} headerAction={<SegmentedControl label="时间范围" value={range} onValueChange={setRange} options={RANGE_OPTIONS} />}>
      {error ? <Alert tone="danger" title="读取订阅访问失败">{error}</Alert>
        : !data ? <Skeleton lines={1} className="h-40" />
        : !data.rows.length ? <EmptyState title="暂无订阅访问记录" description="订阅访问从启用记录后开始积累，该用户在所选范围内还没有拉取过订阅。" />
        : <div className="grid gap-4">
          {data.summary.suspicious ? <Alert tone="warning" title="疑似分享：境内跨城市拉取">{data.summary.hints.join("；")}</Alert> : null}
          {data.lastAlert ? <p className="text-sm text-muted-foreground">最近一次 Telegram 提醒：{formatDateTime(data.lastAlert.at)}（{data.lastAlert.cities.join("、")}）</p> : null}
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {stats.map(stat => <div key={stat.label} className="min-w-0"><dt className="text-muted-foreground">{stat.label}</dt><dd className="font-medium tabular-nums break-words">{stat.value}</dd></div>)}
          </dl>
          {data.summary.viaNodeRequests ? <p className="text-sm text-muted-foreground">另有 {data.summary.viaNodeRequests} 次请求来自自家节点（客户端经代理更新订阅），未计入以上统计。</p> : null}
        </div>}
    </Card>

    {data?.summary.cityChanges.length ? <Card className="gap-0 overflow-hidden py-0" title="城市切换" description={`共 ${data.summary.cityChanges.length} 次 · 相邻两次境内拉取所在城市不同`}>
      <SimpleTable caption="城市切换列表" minWidth={680} columns={["时间", "间隔", "从", "到"]} rows={data.summary.cityChanges} rowKey={(item, index) => `${item.at}-${index}`}
        cells={item => [<span className="text-muted-foreground tabular-nums">{formatDateTime(item.at)}</span>, <span className="font-medium tabular-nums">{formatGap(item.minutes)}</span>, <span>{item.from} <span className="font-mono text-muted-foreground">{item.fromIp}</span></span>, <span>{item.to} <span className="font-mono text-muted-foreground">{item.ip}</span></span>]} />
    </Card> : null}

    {data?.rows.length ? <Card className="gap-0 overflow-hidden py-0" title="来源 IP" description={`共 ${data.summary.ips.length} 个`}>
      <SimpleTable caption="来源 IP 列表" minWidth={720} columns={["IP", "归属地", "次数", "客户端", "首次", "最近"]} rows={data.summary.ips} rowKey={item => item.ip || "-"}
        cells={item => [<IpCell ip={item.ip} viaNode={item.viaNode} />, <span className="whitespace-normal">{placeLabel(item)}</span>, <span className="tabular-nums">{item.count}</span>, <span className="whitespace-normal">{item.clients.join("、")}</span>, <span className="text-muted-foreground tabular-nums">{formatDateTime(item.firstAt)}</span>, <span className="text-muted-foreground tabular-nums">{formatDateTime(item.lastAt)}</span>]} />
    </Card> : null}

    {data?.rows.length ? <Card className="gap-0 overflow-hidden py-0" title="最近请求" description={data.rows.length >= 200 ? "最近 200 条" : `共 ${data.rows.length} 条`}>
      <SimpleTable caption="订阅请求列表" minWidth={760} columns={["时间", "IP", "归属地", "客户端", "结果", "请求头"]} rows={data.rows} rowKey={row => row.id}
        cells={row => [<span className="text-muted-foreground tabular-nums">{formatDateTime(row.at)}</span>, <IpCell ip={row.ip} viaNode={row.viaNode} />, <span className="whitespace-normal">{placeLabel(row)}</span>, <span title={row.userAgent}>{row.client}</span>, <ResultBadge row={row} />, <Button type="button" variant="secondary" size="sm" onClick={() => setDetail(row)} aria-label={`查看 ${formatDateTime(row.at)} 的请求头`}><FileText />查看</Button>]} />
    </Card> : null}

    <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open) setDetail(null) }}>
      <DialogContent size="lg" title="请求头" description={detail ? `${formatDateTime(detail.at)} · ${detail.ip || "-"}（取自 ${detail.ipSource || "-"}）${detail.target ? ` · ?${detail.target}` : ""}` : ""}>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">{detail ? Object.entries(detail.headers).map(([name, value]) => `${name}: ${value}`).join("\n") : ""}</pre>
      </DialogContent>
    </Dialog>
  </>
}
