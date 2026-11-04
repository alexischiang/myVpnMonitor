import { Badge } from "@/components/arc/badge/badge"

type OnlineIpNode = { key: string; name: string; source: "hub"; ips: string[] }

// Online IPs grouped by node, each node's count against the device limit (0 = unlimited).
// The limit is checked per node: each node's xray kernel counts only its own IPs.
export function OnlineIpList({ nodes, limit }: { nodes: OnlineIpNode[]; limit: number }) {
  const ranked = [...nodes].sort((a, b) => (b.ips.length - a.ips.length) || a.name.localeCompare(b.name))
  return (
    <ul className="grid gap-4" aria-label="各节点在线IP">
      {ranked.map(node => {
        const tone = limit > 0 && node.ips.length > limit ? "danger" : limit > 0 && node.ips.length === limit ? "warning" : "neutral"
        return (
          <li key={node.key} className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={node.name}>{node.name}</span>
              <Badge tone={tone}><span className="tabular-nums">{node.ips.length} / {limit > 0 ? limit : "不限"}</span></Badge>
            </div>
            <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
              {[...node.ips].sort().map(ip => <span key={ip} className="break-all">{ip}</span>)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
