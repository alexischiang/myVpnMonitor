import * as React from "react"
import { AlertTriangle, Clock3, Loader2, RefreshCw, Search } from "lucide-react"

import { fetchJson } from "@/api"
import { EmptyState } from "@/components/features/shared"
import { SimpleTable } from "@/components/features/simple-table"
import { formatDateTime } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Input } from "@/components/arc/input/input"
import { SearchField } from "@/components/arc/search-field/search-field"
import { Select } from "@/components/arc/select/select"
import { Card as ArcCard } from "@/components/arc/card/card"

type XuiAuditLog = {
  id: string
  createdAt: string
  requestId: string
  level: string
  transport: string
  method: string
  apiPath: string
  panelHost: string
  userId: string
  readOnly: boolean
  allowed: boolean
  statusCode: number
  durationMs: number
  error: string
}

type XuiAuditResponse = {
  items: XuiAuditLog[]
  total: number
  page: number
  pageSize: number
  retentionDays: number
}

const emptyResponse: XuiAuditResponse = { items: [], total: 0, page: 1, pageSize: 30, retentionDays: 7 }

function ResultBadge({ log }: { log: XuiAuditLog }) {
  if (!log.allowed) return <Badge tone="warning">已拦截</Badge>
  if (log.statusCode >= 400) return <Badge tone="danger">失败</Badge>
  return <Badge tone="success">成功</Badge>
}

export function XuiLogsPage() {
  const [data, setData] = React.useState<XuiAuditResponse>(emptyResponse)
  const [level, setLevel] = React.useState("all")
  const [result, setResult] = React.useState("all")
  const [query, setQuery] = React.useState("")
  const [draftQuery, setDraftQuery] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "30" })
      if (level !== "all") params.set("level", level)
      if (result !== "all") params.set("result", result)
      if (query) params.set("query", query)
      setData(await fetchJson<XuiAuditResponse>(`/api/xui-logs?${params}`))
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取 3x-ui 日志")
    } finally {
      setLoading(false)
    }
  }, [level, page, query, result])

  React.useEffect(() => { void refresh() }, [refresh])

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize))

  if (loading && !data.items.length) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={3} /><Skeleton lines={6} /></div>

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge><Clock3 />保留 {data.retentionDays} 天</Badge>
        <Badge>{data.total} 条记录</Badge>
      </div>
      <ActionButton variant="secondary" size="sm" onClick={() => void refresh()} label="刷新" pending={loading} />
    </div>

    {error ? <div className="px-4 lg:px-6"><Alert tone="danger" title={error} /></div> : null}

    <div className="px-4 lg:px-6">
      <Card className="gap-0 overflow-hidden py-0" title="3x-ui 访问日志" description="记录读取、修改、失败和只读拦截；Token 与请求体不会入库。"><div className="border-b">
          <form className="grid gap-4 md:grid-cols-2 md:items-end xl:grid-cols-4" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(draftQuery.trim()) }}>
            <SearchField label="搜索" id="xui-log-search" value={draftQuery} onValueChange={setDraftQuery} placeholder="路径、主机、请求 ID 或错误" />
            <Select label="等级" value={level} onValueChange={value => { setPage(1); setLevel(value) }} id="xui-log-level" options={[{ value: "all", label: "全部等级" }, { value: "info", label: "INFO" }, { value: "warn", label: "WARN" }, { value: "error", label: "ERROR" }]} />
            <Select label="结果" value={result} onValueChange={value => { setPage(1); setResult(value) }} id="xui-log-result" options={[{ value: "all", label: "全部结果" }, { value: "success", label: "成功" }, { value: "blocked", label: "已拦截" }, { value: "failed", label: "失败" }]} />
            <Button type="submit"><Search />查询</Button>
          </form>
        </div><div className="grid gap-3 gap-0 md:hidden">
          {data.items.length ? data.items.map(log => <ArcCard key={log.id} className="rounded-none border-x-0 border-t-0" title={<><ResultBadge log={log} /><Badge>{log.method}</Badge><span>{log.apiPath}</span></>} description={`${formatDateTime(log.createdAt)} · ${log.statusCode} · ${log.durationMs} ms · ${log.transport}`}>{log.error ? <p className="text-sm text-muted-foreground text-destructive">{log.error}</p> : null}</ArcCard>) : <ArcCard><EmptyState scene="search" title="暂无日志" description="当前筛选条件下没有 3x-ui 访问记录。" /></ArcCard>}
        </div><div className="hidden md:block">
          <SimpleTable
            caption="3x-ui 访问日志"
            columns={["时间", "等级", "结果", "请求", "面板", "响应"]}
            rows={data.items}
            rowKey={log => log.id}
            emptyMessage="暂无日志：当前筛选条件下没有 3x-ui 访问记录。"
            cells={log => [
              <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(log.createdAt)}</span>,
              <><Badge tone={log.level === "info" ? "neutral" : "warning"}>{log.level.toUpperCase()}</Badge></>,
              <><ResultBadge log={log} /></>,
              <><p className="flex items-center gap-2"><Badge>{log.method}</Badge><code className="break-all text-xs">{log.apiPath}</code></p>{log.userId ? <p className="mt-1 text-xs text-muted-foreground">用户：{log.userId}</p> : null}</>,
              <><p>{log.panelHost || "-"}</p><p className="text-xs text-muted-foreground">{log.transport}{log.readOnly ? " · 只读" : ""}</p></>,
              <><p>{log.statusCode} · {log.durationMs} ms</p>{log.error ? <p className="max-w-sm text-xs text-destructive">{log.error}</p> : <p className="text-xs text-muted-foreground">{log.requestId}</p>}</>,
            ]}
          />
        </div><div className="mt-4 flex items-center gap-2 justify-between border-t">
          <p className="text-sm text-muted-foreground">第 {data.page} / {pageCount} 页</p>
          <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))}>上一页</Button><Button variant="secondary" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage(current => current + 1)}>下一页</Button></div>
        </div></Card>
    </div>
  </>
}
