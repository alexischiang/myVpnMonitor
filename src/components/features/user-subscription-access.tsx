import * as React from "react"
import { FileText, Plus, ShieldCheck, ShieldOff } from "lucide-react"
import { Link } from "react-router-dom"

import { deleteJson, fetchJson, postJson } from "@/api"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { EmptyState } from "@/components/features/shared"
import { SimpleTable } from "@/components/features/simple-table"
import { type SubscriptionPlace as Place, placeLabel } from "@/components/features/subscription-place"
import { type RiskFactor, type RiskLevel, ReviewStatusBadge, RiskLevelBadge } from "@/components/features/subscription-reviews"
import { toast } from "@/components/features/toast"
import { formatDateTime } from "@/utils"

type AccessWindow = { requests: number; ips: number; cities: string[]; provinces: string[]; clients: string[] }
type AccessIp = Place & { ip: string; count: number; firstAt: string; lastAt: string; clients: string[]; viaNode: boolean; whitelisted?: boolean }
type CityChange = { at: string; from: string; to: string; fromIp: string; ip: string; minutes: number }
type WhitelistEntry = { ip: string; note?: string; addedBy?: string; addedAt?: string }
type RiskSummary = {
  score: number
  level: RiskLevel
  thresholds: { review: number; alert: number; critical: number }
  factors: RiskFactor[]
  provinces: string[]
  cities: string[]
}
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
  whitelisted?: boolean
  headers: Record<string, string>
}
type ConcurrentEvent = {
  id: string
  kind: "province" | "city"
  startedAt: string
  lastSeenAt: string
  samples: number
  provinces: string[]
  cities: string[]
  locations: Array<Place & { ip: string; nodes: string[]; clients?: string[]; whitelisted?: boolean }>
  ongoing: boolean
}
type SubscriptionAccess = {
  days: number
  retentionDays: number
  lastAlert: { at: string; score?: number; level?: string; provinces: string[]; cities: string[] } | null
  review: { status: "pending" | "normal" | "shared"; province: string; provinces?: string[]; cities: string[]; reviewedAt?: string; reviewedBy?: string; note?: string } | null
  whitelist: WhitelistEntry[]
  risk: RiskSummary
  summary: { suspicious: boolean; crossCity: boolean; windows: Record<"24h" | "all", AccessWindow>; hints: string[]; cityChanges: CityChange[]; viaNodeRequests: number; whitelistedRequests?: number; ips: AccessIp[] }
  rows: AccessRow[]
  concurrent: ConcurrentEvent[]
}

function minutesBetween(from: string, to: string) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000))
}

/** Episodes of live connections from two or more places at the same moment (node-hub presence, sampled every 2 minutes). */
function ConcurrentLocations({ events, range, onAddWhitelist }: { events: ConcurrentEvent[]; range: string; onAddWhitelist: (ip: string) => void }) {
  const crossProvince = events.filter(event => event.kind === "province")
  return <Card className="gap-0 overflow-hidden py-0" title="同时异地在线" description={`节点上同一时刻的在线 IP 分布在多个地点 · ${range} 天 ${events.length} 次`}>
    <div className="grid gap-3">
      {crossProvince.length ? <div className="px-6 pt-3"><Alert tone="warning" title="出现同时跨省在线">{`${crossProvince.length} 次，涉及 ${[...new Set(crossProvince.flatMap(event => event.provinces))].join("、")}`}</Alert></div> : null}
      <SimpleTable caption="同时异地在线列表" minWidth={860} columns={["开始", "持续", "范围", "在线 IP / 客户端"]} rows={events} rowKey={event => event.id}
        cells={event => [
          <span className="grid justify-items-start gap-1 whitespace-nowrap text-muted-foreground tabular-nums"><span>{formatDateTime(event.startedAt)}</span>{event.ongoing ? <Badge size="sm" tone="info">进行中</Badge> : null}</span>,
          <span className="whitespace-nowrap font-medium tabular-nums">{formatGap(minutesBetween(event.startedAt, event.lastSeenAt))}</span>,
          <span className="whitespace-nowrap"><Badge tone={event.kind === "province" ? "warning" : "neutral"}>{event.kind === "province" ? `跨省 · ${event.provinces.join("、")}` : `同省跨市 · ${event.cities.join("、")}`}</Badge></span>,
          <ul className="grid divide-y divide-border/60 whitespace-normal">{event.locations.map(location => <li key={location.ip} className="flex items-start justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono font-medium tabular-nums">{location.ip}</span>
                <span className="text-sm">{placeLabel(location)}</span>
                {location.clients?.length
                  ? location.clients.map(client => <Badge key={client} size="sm" tone="info">{client}</Badge>)
                  : <span className="text-xs text-muted-foreground">客户端未知</span>}
              </div>
              <span className="text-xs text-muted-foreground">{location.nodes.join("、")}</span>
            </div>
            <div className="shrink-0">
              {location.whitelisted ? <Badge size="sm" tone="success">白名单</Badge>
                : <Button type="button" variant="secondary" size="sm" onClick={() => onAddWhitelist(location.ip)} aria-label={`将 ${location.ip} 加入白名单`}><ShieldCheck />加白</Button>}
            </div>
          </li>)}</ul>,
        ]} />
    </div>
  </Card>
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

function IpCell({ ip, viaNode, whitelisted }: { ip: string; viaNode: boolean; whitelisted?: boolean }) {
  return <span className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">{ip || "-"}{viaNode ? <Badge size="sm">经节点</Badge> : null}{whitelisted ? <Badge size="sm" tone="success">白名单</Badge> : null}</span>
}

/** Pulls of one user's subscription link, share risk score breakdown, and per-user IP whitelist. */
export function UserSubscriptionAccess({ userId }: { userId: string }) {
  const [range, setRange] = React.useState("7")
  const [data, setData] = React.useState<SubscriptionAccess | null>(null)
  const [error, setError] = React.useState("")
  const [detail, setDetail] = React.useState<AccessRow | null>(null)
  const [whitelistDialogOpen, setWhitelistDialogOpen] = React.useState(false)
  const [whitelistIp, setWhitelistIp] = React.useState("")
  const [whitelistNote, setWhitelistNote] = React.useState("")
  const [whitelistError, setWhitelistError] = React.useState("")
  const [savingWhitelist, setSavingWhitelist] = React.useState(false)
  const [removingIp, setRemovingIp] = React.useState("")

  const reload = React.useCallback(async () => {
    try {
      const value = await fetchJson<SubscriptionAccess>(`/api/users/${encodeURIComponent(userId)}/subscription-access?days=${range}`)
      setData(value)
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取失败")
    }
  }, [userId, range])

  React.useEffect(() => {
    setData(null)
    setError("")
    void reload()
  }, [reload])

  function openAddWhitelist(prefillIp = "") {
    setWhitelistIp(prefillIp)
    setWhitelistNote("")
    setWhitelistError("")
    setWhitelistDialogOpen(true)
  }

  async function submitWhitelist(event: React.FormEvent) {
    event.preventDefault()
    setSavingWhitelist(true)
    setWhitelistError("")
    try {
      await postJson(`/api/users/${encodeURIComponent(userId)}/subscription-whitelist`, { ip: whitelistIp, note: whitelistNote })
      toast({ type: "success", title: `已加入白名单：${whitelistIp.trim()}` })
      setWhitelistDialogOpen(false)
      await reload()
    } catch (reason) {
      setWhitelistError(reason instanceof Error ? reason.message : "保存白名单失败")
    } finally {
      setSavingWhitelist(false)
    }
  }

  async function removeWhitelist(ip: string) {
    setRemovingIp(ip)
    try {
      await deleteJson(`/api/users/${encodeURIComponent(userId)}/subscription-whitelist?ip=${encodeURIComponent(ip)}`)
      toast({ type: "success", title: `已移出白名单：${ip}` })
      await reload()
    } catch (reason) {
      toast({ type: "error", title: reason instanceof Error ? reason.message : "移除白名单失败" })
    } finally {
      setRemovingIp("")
    }
  }

  const windows = data?.summary.windows
  const stats = windows ? [
    { label: "24 小时请求", value: windows["24h"].requests },
    { label: "24 小时省份 / 城市", value: `${windows["24h"].provinces.length} / ${windows["24h"].cities.length}` },
    { label: `${range} 天请求`, value: windows.all.requests },
    { label: `${range} 天 IP`, value: windows.all.ips },
    { label: `${range} 天境内城市`, value: windows.all.cities.join("、") || "-" },
    { label: `${range} 天客户端`, value: windows.all.clients.join("、") || "-" },
  ] : []

  const risk = data?.risk
  const whitelist = data?.whitelist || []

  return <>
    {data && risk ? <Card title="分享风险评分" description={`阈值：${risk.thresholds.review} 分待复核 · ${risk.thresholds.alert} 分报警 · ${risk.thresholds.critical} 分极高风险`}
      headerAction={<RiskLevelBadge level={risk.level} score={risk.score} />}>
      {!risk.factors.length ? <p className="text-sm text-muted-foreground">当前没有命中的可疑加分项。</p>
        : <ul className="grid gap-2 text-sm">
          {risk.factors.map(factor => <li key={factor.key} className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-medium">{factor.label}</span>
              <span className="break-words text-xs text-muted-foreground">{factor.detail}</span>
            </div>
            <span className="shrink-0 pt-0.5"><Badge size="sm" tone={factor.points >= 40 ? "danger" : factor.points >= 20 ? "warning" : "neutral"}><span className="tabular-nums">+{factor.points} 分</span></Badge></span>
          </li>)}
        </ul>}
    </Card> : null}

    {data ? <Card className="gap-0 overflow-hidden py-0" title="白名单 IP" description="管理员认定的该用户本人设备 IP 或 IPv4 /24 网段，不参与任何可疑分享评分与报警。"
      headerAction={<Button type="button" variant="secondary" size="sm" onClick={() => openAddWhitelist("")}><Plus />添加白名单</Button>}>
      {!whitelist.length ? <EmptyState title="尚未配置白名单 IP" description="可在下方来源 IP 或同时在线列表中一键加白，或点击右上角手动添加。" />
        : <SimpleTable caption="白名单 IP 列表" minWidth={640} columns={["IP / 网段", "备注", "添加人", "添加时间", "操作"]} rows={whitelist} rowKey={entry => entry.ip}
          cells={entry => [
            <span className="font-mono tabular-nums">{entry.ip}</span>,
            <span className="whitespace-normal text-muted-foreground">{entry.note || "-"}</span>,
            <span>{entry.addedBy || "-"}</span>,
            <span className="text-muted-foreground tabular-nums">{entry.addedAt ? formatDateTime(entry.addedAt) : "-"}</span>,
            <Button type="button" variant="secondary" size="sm" loading={removingIp === entry.ip} disabled={Boolean(removingIp)} onClick={() => void removeWhitelist(entry.ip)} aria-label={`移出白名单 ${entry.ip}`}><ShieldOff />移出</Button>,
          ]} />}
    </Card> : null}

    <Card title="订阅访问" description={`拉取订阅链接时的 IP 和请求头 · 保留 ${data?.retentionDays ?? 90} 天`} headerAction={<SegmentedControl label="时间范围" value={range} onValueChange={setRange} options={RANGE_OPTIONS} />}>
      {error ? <Alert tone="danger" title="读取订阅访问失败">{error}</Alert>
        : !data ? <Skeleton lines={1} className="h-40" />
        : !data.rows.length ? <EmptyState title="暂无订阅访问记录" description="订阅访问从启用记录后开始积累，该用户在所选范围内还没有拉取过订阅。" />
        : <div className="grid gap-4">
          {data.summary.suspicious ? <Alert tone="warning" title="境内跨省拉取">{data.summary.hints.join("；")}</Alert>
            : data.summary.crossCity ? <Alert title="同省跨市拉取">{data.summary.hints.join("；")}</Alert> : null}
          {data.review ? <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>订阅复核：</span><ReviewStatusBadge status={data.review.status} />
            <span>{data.review.provinces?.length ? data.review.provinces.join("、") : data.review.province}{data.review.cities?.length ? `：${data.review.cities.join("、")}` : ""}</span>
            {data.review.status !== "pending" && data.review.reviewedAt ? <span className="tabular-nums">{data.review.reviewedBy} · {formatDateTime(data.review.reviewedAt)}{data.review.note ? ` · ${data.review.note}` : ""}</span> : null}
            <Link className="text-foreground underline underline-offset-4" to="/subscription-reviews">前往订阅复核</Link>
          </p> : null}
          {data.lastAlert ? <p className="text-sm text-muted-foreground">最近一次报警提醒：{formatDateTime(data.lastAlert.at)}{data.lastAlert.score ? `（${data.lastAlert.score} 分` : "（"}{(data.lastAlert.provinces.length ? data.lastAlert.provinces : data.lastAlert.cities).join("、") ? `${data.lastAlert.score ? " · " : ""}${(data.lastAlert.provinces.length ? data.lastAlert.provinces : data.lastAlert.cities).join("、")}` : ""}）</p> : null}
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {stats.map(stat => <div key={stat.label} className="min-w-0"><dt className="text-muted-foreground">{stat.label}</dt><dd className="font-medium tabular-nums break-words">{stat.value}</dd></div>)}
          </dl>
          {data.summary.viaNodeRequests || data.summary.whitelistedRequests ? <p className="text-sm text-muted-foreground">
            {data.summary.viaNodeRequests ? `另有 ${data.summary.viaNodeRequests} 次请求来自自家节点` : ""}
            {data.summary.viaNodeRequests && data.summary.whitelistedRequests ? "，" : ""}
            {data.summary.whitelistedRequests ? `${data.summary.whitelistedRequests} 次请求来自白名单 IP` : ""}
            ，未计入以上统计。
          </p> : null}
        </div>}
    </Card>

    {data?.concurrent?.length ? <ConcurrentLocations events={data.concurrent} range={range} onAddWhitelist={openAddWhitelist} /> : null}

    {data?.summary.cityChanges.length ? <Card className="gap-0 overflow-hidden py-0" title="城市切换" description={`共 ${data.summary.cityChanges.length} 次 · 相邻两次境内拉取所在城市不同`}>
      <SimpleTable caption="城市切换列表" minWidth={680} columns={["时间", "间隔", "从", "到"]} rows={data.summary.cityChanges} rowKey={(item, index) => `${item.at}-${index}`}
        cells={item => [<span className="text-muted-foreground tabular-nums">{formatDateTime(item.at)}</span>, <span className="font-medium tabular-nums">{formatGap(item.minutes)}</span>, <span>{item.from} <span className="font-mono text-muted-foreground">{item.fromIp}</span></span>, <span>{item.to} <span className="font-mono text-muted-foreground">{item.ip}</span></span>]} />
    </Card> : null}

    {data?.rows.length ? <Card className="gap-0 overflow-hidden py-0" title="来源 IP" description={`共 ${data.summary.ips.length} 个`}>
      <SimpleTable caption="来源 IP 列表" minWidth={780} columns={["IP", "归属地", "次数", "客户端", "首次", "最近", "操作"]} rows={data.summary.ips} rowKey={item => item.ip || "-"}
        cells={item => [
          <IpCell ip={item.ip} viaNode={item.viaNode} whitelisted={item.whitelisted} />,
          <span className="whitespace-normal">{placeLabel(item)}</span>,
          <span className="tabular-nums">{item.count}</span>,
          <span className="whitespace-normal">{item.clients.join("、")}</span>,
          <span className="text-muted-foreground tabular-nums">{formatDateTime(item.firstAt)}</span>,
          <span className="text-muted-foreground tabular-nums">{formatDateTime(item.lastAt)}</span>,
          item.viaNode || !item.ip ? <span className="text-muted-foreground">-</span>
            : item.whitelisted
              ? <Button type="button" variant="secondary" size="sm" loading={removingIp === item.ip} disabled={Boolean(removingIp)} onClick={() => void removeWhitelist(item.ip)} aria-label={`移出白名单 ${item.ip}`}><ShieldOff />移出</Button>
              : <Button type="button" variant="secondary" size="sm" onClick={() => openAddWhitelist(item.ip)} aria-label={`将 ${item.ip} 加入白名单`}><ShieldCheck />加白</Button>,
        ]} />
    </Card> : null}

    {data?.rows.length ? <Card className="gap-0 overflow-hidden py-0" title="最近请求" description={data.rows.length >= 200 ? "最近 200 条" : `共 ${data.rows.length} 条`}>
      <SimpleTable caption="订阅请求列表" minWidth={760} columns={["时间", "IP", "归属地", "客户端", "结果", "请求头"]} rows={data.rows} rowKey={row => row.id}
        cells={row => [<span className="text-muted-foreground tabular-nums">{formatDateTime(row.at)}</span>, <IpCell ip={row.ip} viaNode={row.viaNode} whitelisted={row.whitelisted} />, <span className="whitespace-normal">{placeLabel(row)}</span>, <span title={row.userAgent}>{row.client}</span>, <ResultBadge row={row} />, <Button type="button" variant="secondary" size="sm" onClick={() => setDetail(row)} aria-label={`查看 ${formatDateTime(row.at)} 的请求头`}><FileText />查看</Button>]} />
    </Card> : null}

    <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open) setDetail(null) }}>
      <DialogContent size="lg" title="请求头" description={detail ? `${formatDateTime(detail.at)} · ${detail.ip || "-"}（取自 ${detail.ipSource || "-"}）${detail.target ? ` · ?${detail.target}` : ""}` : ""}>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">{detail ? Object.entries(detail.headers).map(([name, value]) => `${name}: ${value}`).join("\n") : ""}</pre>
      </DialogContent>
    </Dialog>

    <Dialog open={whitelistDialogOpen} onOpenChange={open => { if (!open && !savingWhitelist) setWhitelistDialogOpen(false) }}>
      <DialogContent title="添加白名单 IP" description="加入白名单后，该 IP 或 IPv4 /24 网段将不再参与分享风险评分与报警。">
        <form className="grid gap-4" onSubmit={event => void submitWhitelist(event)}>
          <Input label="IP 地址或 IPv4 /24 网段" placeholder="例如 113.108.12.34 或 113.108.12.0/24" value={whitelistIp} onChange={event => setWhitelistIp(event.target.value)} error={whitelistError} required />
          <Input label="备注" placeholder="例如：本人公司固定 IP / 家里宽带" value={whitelistNote} onChange={event => setWhitelistNote(event.target.value)} maxLength={200} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={savingWhitelist} onClick={() => setWhitelistDialogOpen(false)}>取消</Button>
            <Button type="submit" variant="primary" loading={savingWhitelist}>保存白名单</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
