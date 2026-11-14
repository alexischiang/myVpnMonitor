import * as React from "react"
import { Link } from "react-router-dom"

import { fetchJson } from "@/api"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Card } from "@/components/arc/card/card"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Select } from "@/components/arc/select/select"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { EmptyState } from "@/components/features/shared"
import type { NodeHubMachine } from "@/types"
import { formatBytes } from "@/utils"

type MachineNode = { guid: string; name: string; deleted: boolean; bytes: number }
type MachineUser = { key: string; userId: string; label: string; email: string; upBytes: number; downBytes: number; totalBytes: number; nodes: Array<{ guid: string; bytes: number }> }
type MachineUserTraffic = {
  machine: { id: number; guid: string; name: string }
  from: string
  to: string
  days: number
  totalBytes: number
  userCount: number
  nodes: MachineNode[]
  users: MachineUser[]
}

const RANGE_OPTIONS = [{ value: "1", label: "今天" }, { value: "7", label: "7 天" }, { value: "30", label: "30 天" }]
// The machine's nodes take the chart series in order of traffic; beyond five they share the neutral "other" color.
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"]
const seriesColor = (index: number) => SERIES[index] ?? "var(--series-other)"

/**
 * One machine's traffic by user: the heaviest users first, each bar split by the machine's nodes they used. Raw bytes (no node
 * multipliers), since this is what the machine itself carried.
 */
export function NodeHubMachineTraffic({ machines, machineId, onMachineChange, refreshKey }: {
  machines: NodeHubMachine[]
  /** The selected machine id, or "" for the first one. */
  machineId: string
  onMachineChange: (machineId: string) => void
  refreshKey: number
}) {
  const [range, setRange] = React.useState("7")
  const [data, setData] = React.useState<MachineUserTraffic | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const selected = machines.find(machine => String(machine.id) === machineId) ?? machines[0]

  React.useEffect(() => {
    if (!selected) return
    let active = true
    setLoading(true)
    setError("")
    void fetchJson<MachineUserTraffic>(`/api/node-hub/machine-user-traffic?machine=${selected.id}&days=${range}`)
      .then(result => { if (active) setData(result) })
      .catch(reason => { if (active) { setData(null); setError(reason instanceof Error ? reason.message : "机器流量加载失败") } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [selected?.id, range, refreshKey])

  if (!selected) return <EmptyState title="还没有机器" description="先在「机器」中新建机器。" />

  // Data from an earlier selection stays hidden while the new one loads.
  const current = data && data.machine.id === selected.id && String(data.days) === range ? data : null
  const nodeIndex = new Map(current?.nodes.map((node, index) => [node.guid, index]) ?? [])
  const nodeByGuid = new Map(current?.nodes.map(node => [node.guid, node]) ?? [])
  const top = current?.users[0]?.totalBytes ?? 0

  return (
    <Card
      title="机器用户流量"
      description={current ? `${current.from === current.to ? current.to : `${current.from} 至 ${current.to}`} · ${current.userCount} 个用户 · 共 ${formatBytes(current.totalBytes)}（原始流量，不计倍率）` : "按用户统计这台机器承载的流量"}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Arc's trigger fills its field, so the wrapper sets the width. */}
          <div className="w-full sm:w-64"><Select label="机器" hideLabel id="machine-traffic-machine" value={String(selected.id)} onValueChange={onMachineChange} options={machines.map(machine => ({ value: String(machine.id), label: machine.isActive ? machine.name : `${machine.name}（已停用）` }))} /></div>
          <SegmentedControl label="时间范围" value={range} onValueChange={setRange} options={RANGE_OPTIONS} />
        </div>
        {error ? <Alert tone="danger" title={error} /> : null}
        {!current && loading ? <Skeleton lines={6} /> : null}
        {current && !current.users.length ? <EmptyState title="这段时间没有流量" description="换一个时间范围，或确认机器上的节点已在上报流量。" /> : null}
        {current?.users.length ? <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="节点图例">
            {current.nodes.map((node, index) => (
              <li key={node.guid} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: seriesColor(index) }} aria-hidden="true" />
                <span className="truncate">{node.name}{node.deleted ? "（已删除）" : ""}</span>
                <span className="tabular-nums">{formatBytes(node.bytes)}</span>
              </li>
            ))}
          </ul>
          <ol className={`grid gap-4 ${loading ? "opacity-60" : ""}`} aria-label={`${current.machine.name} 的用户流量，从高到低`}>
            {current.users.map((user, rank) => (
              <li key={user.key} className="grid min-w-0 gap-1.5">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">{rank + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {user.userId ? <Link to={`/users/detail/${encodeURIComponent(user.userId)}`} className="underline-offset-4 hover:underline" title={user.email}>{user.label}</Link> : <span title={user.email}>{user.label || "未知用户"}</span>}
                  </span>
                  {!user.userId ? <Badge size="sm">未关联用户</Badge> : null}
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBytes(user.totalBytes)}</span>
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{current.totalBytes ? Math.round(user.totalBytes / current.totalBytes * 100) : 0}%</span>
                </div>
                {/* Bars scale to the heaviest user so lengths compare down the list. */}
                <div className="ml-8 flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={user.nodes.map(node => `${nodeByGuid.get(node.guid)?.name || node.guid} ${formatBytes(node.bytes)}`).join("，")}>
                  <div className="flex h-full" style={{ width: `${top ? Math.max(1, user.totalBytes / top * 100) : 0}%` }}>
                    {user.nodes.map(node => <span key={node.guid} className="h-full" style={{ width: `${node.bytes / user.totalBytes * 100}%`, background: seriesColor(nodeIndex.get(node.guid) ?? SERIES.length) }} />)}
                  </div>
                </div>
                <p className="ml-8 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {user.nodes.map(node => (
                    <span key={node.guid} className="inline-flex items-center gap-1">
                      <span className="size-2 shrink-0 rounded-sm" style={{ background: seriesColor(nodeIndex.get(node.guid) ?? SERIES.length) }} aria-hidden="true" />
                      {nodeByGuid.get(node.guid)?.name || node.guid}<span className="tabular-nums">{formatBytes(node.bytes)}</span>
                    </span>
                  ))}
                  <span className="tabular-nums">↑ {formatBytes(user.upBytes)} ↓ {formatBytes(user.downBytes)}</span>
                </p>
              </li>
            ))}
          </ol>
          {current.userCount > current.users.length ? <p className="text-xs text-muted-foreground">只显示流量最多的 {current.users.length} 个用户。</p> : null}
        </> : null}
      </div>
    </Card>
  )
}
