import * as React from "react"
import { Clock3, RefreshCw, Search } from "lucide-react"

import { fetchJson } from "@/api"
import { ListFilterChips, ListFilterMenu, type ListFilter } from "@/components/features/list-filters"
import { EmptyState } from "@/components/features/shared"
import { SimpleTable } from "@/components/features/simple-table"
import { formatDateTime } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { Pagination } from "@/components/arc/pagination/pagination"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { SearchField } from "@/components/arc/search-field/search-field"

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

/** The result, plus the level only when it is not the everyday INFO. */
function StatusBadges({ log }: { log: XuiAuditLog }) {
  return <span className="flex flex-wrap items-center gap-1.5">
    <ResultBadge log={log} />
    {log.level !== "info" ? <Badge tone={log.level === "error" ? "danger" : "warning"}>{log.level.toUpperCase()}</Badge> : null}
  </span>
}

/** An API path that may wrap only after a slash, never mid-segment. */
function ApiPath({ path }: { path: string }) {
  const segments = path.split("/")
  return <code className="font-mono text-xs">{segments.map((segment, index) => <React.Fragment key={index}>{segment}{index < segments.length - 1 ? <>/<wbr /></> : null}</React.Fragment>)}</code>
}

/** The first 8 characters of a request ID, with Arc's copy button for the full ID (to paste into search). */
function RequestId({ id }: { id: string }) {
  if (!id) return null
  return <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">{id.slice(0, 8)}<CopyButton value={id} label="复制请求 ID" iconOnly variant="plain" /></span>
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
  const filters: ListFilter[] = [
    { id: "level", label: "等级", value: level, onChange: value => { setPage(1); setLevel(value) }, options: [{ value: "all", label: "全部等级" }, { value: "info", label: "INFO" }, { value: "warn", label: "WARN" }, { value: "error", label: "ERROR" }] },
    { id: "result", label: "结果", value: result, onChange: value => { setPage(1); setResult(value) }, options: [{ value: "all", label: "全部结果" }, { value: "success", label: "成功" }, { value: "blocked", label: "已拦截" }, { value: "failed", label: "失败" }] },
  ]

  if (loading && !data.items.length) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={3} /><Skeleton lines={6} /></div>

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge><Clock3 />保留 {data.retentionDays} 天</Badge>
        <Badge>{data.total} 条记录</Badge>
      </div>
      <ActionButton variant="secondary" size="sm" icon={<RefreshCw />} collapse onClick={() => void refresh()} label="刷新" pending={loading} />
    </div>

    {error ? <div className="px-4 lg:px-6"><Alert tone="danger" title={error} /></div> : null}

    <div className="px-4 lg:px-6">
      <Card className="gap-0 py-0" title="3x-ui 访问日志" description="记录读取、修改、失败和只读拦截；Token 与请求体不会入库。"><div className="grid gap-5"><div className="grid gap-3">
          <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(draftQuery.trim()) }}>
            <div className="min-w-0 flex-1 lg:max-w-md"><SearchField label="搜索日志" hideLabel id="xui-log-search" value={draftQuery} onValueChange={setDraftQuery} placeholder="搜索路径、主机或请求 ID" /></div>
            <ListFilterMenu filters={filters} />
            <Button type="submit" collapse><Search />查询</Button>
          </form>
          <ListFilterChips filters={filters} />
        </div>{/* One Arc table for every width: below 620px it folds each row into the request as a title and a line of details. */}
        <div>
          {!data.items.length ? <EmptyState scene="search" title="暂无日志" description="当前筛选条件下没有 3x-ui 访问记录。" /> : <SimpleTable
            caption="3x-ui 访问日志"
            columns={["请求", "状态", "时间", "面板", "响应"]}
            rows={data.items}
            rowKey={log => log.id}
            emptyMessage="暂无日志：当前筛选条件下没有 3x-ui 访问记录。"
            cells={log => [
              <span className="grid gap-0.5"><span className="flex items-baseline gap-2"><span className="shrink-0 font-mono text-xs font-semibold">{log.method}</span><ApiPath path={log.apiPath} /></span>{log.userId ? <span className="text-xs font-normal text-muted-foreground max-[620px]:hidden">用户 {log.userId}</span> : null}</span>,
              <StatusBadges log={log} />,
              <span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDateTime(log.createdAt)}</span>,
              <span className="grid gap-0.5"><span className="whitespace-nowrap">{log.panelHost || "-"}</span><span className="text-xs text-muted-foreground max-[620px]:hidden">{log.transport}{log.readOnly ? " · 只读" : ""}</span></span>,
              <span className="grid gap-0.5"><span className="whitespace-nowrap tabular-nums"><span className={log.statusCode >= 400 ? "text-destructive" : undefined}>{log.statusCode}</span> · {log.durationMs} ms</span>{log.error ? <span className="max-w-sm text-xs text-destructive max-[620px]:line-clamp-2">{log.error}</span> : <span className="max-[620px]:hidden"><RequestId id={log.requestId} /></span>}</span>,
            ]}
          />}
        </div><div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground tabular-nums">共 {data.total} 条 · 第 {data.page} / {pageCount} 页</p>
          <Pagination label="分页" page={page} pageCount={pageCount} onPageChange={next => { if (!loading) setPage(Math.min(Math.max(1, next), pageCount)) }} />
        </div></div></Card>
    </div>
  </>
}
