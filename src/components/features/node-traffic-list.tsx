import { Badge } from "@/components/arc/badge/badge"
import { Progress } from "@/components/arc/progress/progress"
import { formatBytes } from "@/utils"

export type NodeTraffic = { key: string; name: string; multiplier: number; rawBytes: number; weightedBytes: number; deleted?: boolean }

// Rows synced before the server flagged deleted nodes only carry the suffix in their name.
const isDeleted = (node: NodeTraffic) => node.deleted === true || node.name.endsWith("（已删除节点）")

/**
 * Per-node usage ranked by counted (weighted) traffic, heaviest first, each with its share of the total. Nodes that no longer
 * exist are merged into one unranked row at the bottom. Two columns once the container is wide enough.
 */
export function NodeTrafficList({ nodes }: { nodes: NodeTraffic[] }) {
  const ranked = nodes.filter(node => !isDeleted(node)).sort((a, b) => (b.weightedBytes - a.weightedBytes) || (b.rawBytes - a.rawBytes) || a.name.localeCompare(b.name))
  const deleted = nodes.filter(isDeleted)
  const rows = deleted.length ? [...ranked, {
    key: "__deleted",
    name: `已删除节点（${deleted.length} 个）`,
    multiplier: 1,
    rawBytes: deleted.reduce((sum, node) => sum + node.rawBytes, 0),
    weightedBytes: deleted.reduce((sum, node) => sum + node.weightedBytes, 0),
    deleted: true,
  }] : ranked
  const total = rows.reduce((sum, node) => sum + Math.max(0, node.weightedBytes), 0)
  return (
    <div className="@container">
      <ol className="grid gap-x-6 gap-y-4 @xl:grid-cols-2" aria-label="节点流量，按使用量从高到低">
        {rows.map((node, index) => {
          const share = total > 0 ? Math.max(0, node.weightedBytes) / total : 0
          const idle = node.weightedBytes <= 0 && node.rawBytes <= 0
          const merged = node.key === "__deleted"
          return (
            <li key={node.key} className={`grid min-w-0 gap-1.5 ${idle || merged ? "text-muted-foreground" : ""} ${merged ? "@xl:col-span-2 border-t pt-4" : ""}`}>
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{merged ? "–" : index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={node.name}>{node.name}</span>
                {node.multiplier !== 1 ? <Badge tone="neutral">× {node.multiplier}</Badge> : null}
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBytes(node.weightedBytes)}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 pl-7">
                <Progress className="min-w-0 flex-1" value={Math.round(share * 1000)} max={1000} aria-label={`${node.name} 占比`} />
                <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {Math.round(share * 100)}%{node.multiplier !== 1 || (merged && node.rawBytes !== node.weightedBytes) ? ` · 原始 ${formatBytes(node.rawBytes)}` : ""}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
