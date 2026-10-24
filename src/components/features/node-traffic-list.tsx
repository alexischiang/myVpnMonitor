import { Badge } from "@/components/arc/badge/badge"
import { Progress } from "@/components/arc/progress/progress"
import { formatBytes } from "@/utils"

export type NodeTraffic = { key: string; name: string; multiplier: number; rawBytes: number; weightedBytes: number }

/** Per-node usage ranked by counted (weighted) traffic, heaviest first, each with its share of the total. Two columns once the container is wide enough. */
export function NodeTrafficList({ nodes }: { nodes: NodeTraffic[] }) {
  const ranked = [...nodes].sort((a, b) => (b.weightedBytes - a.weightedBytes) || (b.rawBytes - a.rawBytes) || a.name.localeCompare(b.name))
  const total = ranked.reduce((sum, node) => sum + Math.max(0, node.weightedBytes), 0)
  return (
    <div className="@container">
      <ol className="grid gap-x-6 gap-y-4 @xl:grid-cols-2" aria-label="节点流量，按使用量从高到低">
        {ranked.map((node, index) => {
          const share = total > 0 ? Math.max(0, node.weightedBytes) / total : 0
          const idle = node.weightedBytes <= 0 && node.rawBytes <= 0
          return (
            <li key={node.key} className={`grid min-w-0 gap-1.5 ${idle ? "text-muted-foreground" : ""}`}>
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={node.name}>{node.name}</span>
                {node.multiplier !== 1 ? <Badge tone="neutral">× {node.multiplier}</Badge> : null}
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBytes(node.weightedBytes)}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 pl-7">
                <Progress className="min-w-0 flex-1" value={Math.round(share * 1000)} max={1000} aria-label={`${node.name} 占比`} />
                <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {Math.round(share * 100)}%{node.multiplier !== 1 ? ` · 原始 ${formatBytes(node.rawBytes)}` : ""}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
