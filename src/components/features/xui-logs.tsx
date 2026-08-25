import * as React from "react"
import { AlertTriangle, Clock3, Loader2, RefreshCw, Search } from "lucide-react"

import { fetchJson } from "@/api"
import { EmptyState } from "@/components/features/shared"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/utils"

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
  if (!log.allowed) return <Badge variant="warning">已拦截</Badge>
  if (log.statusCode >= 400) return <Badge variant="destructive">失败</Badge>
  return <Badge variant="success">成功</Badge>
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

  if (loading && !data.items.length) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline"><Clock3 />保留 {data.retentionDays} 天</Badge>
        <Badge variant="secondary">{data.total} 条记录</Badge>
      </div>
      <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新</Button>
    </div>

    {error ? <div className="px-4 lg:px-6"><Alert variant="destructive"><AlertTriangle /><AlertDescription>{error}</AlertDescription></Alert></div> : null}

    <div className="px-4 lg:px-6">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>3x-ui 访问日志</CardTitle>
          <CardDescription>记录读取、修改、失败和只读拦截；Token 与请求体不会入库。</CardDescription>
        </CardHeader>
        <CardContent className="border-b p-4 lg:p-6">
          <form className="grid gap-4 md:grid-cols-2 md:items-end xl:grid-cols-4" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(draftQuery.trim()) }}>
            <Field><FieldLabel htmlFor="xui-log-search">搜索</FieldLabel><Input id="xui-log-search" value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="路径、主机、请求 ID 或错误" /></Field>
            <Field><FieldLabel htmlFor="xui-log-level">等级</FieldLabel><Select value={level} onValueChange={value => { setPage(1); setLevel(value) }}><SelectTrigger id="xui-log-level"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部等级</SelectItem><SelectItem value="info">INFO</SelectItem><SelectItem value="warn">WARN</SelectItem><SelectItem value="error">ERROR</SelectItem></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="xui-log-result">结果</FieldLabel><Select value={result} onValueChange={value => { setPage(1); setResult(value) }}><SelectTrigger id="xui-log-result"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部结果</SelectItem><SelectItem value="success">成功</SelectItem><SelectItem value="blocked">已拦截</SelectItem><SelectItem value="failed">失败</SelectItem></SelectContent></Select></Field>
            <Button type="submit"><Search />查询</Button>
          </form>
        </CardContent>

        <ItemGroup className="gap-0 md:hidden">
          {data.items.length ? data.items.map(log => <Item key={log.id} variant="outline" className="rounded-none border-x-0 border-t-0"><ItemContent><ItemTitle className="flex flex-wrap items-center gap-2"><ResultBadge log={log} /><Badge variant="outline">{log.method}</Badge><span>{log.apiPath}</span></ItemTitle><ItemDescription>{formatDateTime(log.createdAt)} · {log.statusCode} · {log.durationMs} ms · {log.transport}</ItemDescription>{log.error ? <ItemDescription className="text-destructive">{log.error}</ItemDescription> : null}</ItemContent></Item>) : <Item><ItemContent><EmptyState title="暂无日志" description="当前筛选条件下没有 3x-ui 访问记录。" /></ItemContent></Item>}
        </ItemGroup>

        <CardContent className="hidden p-0 md:block">
          <Table>
            <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>等级</TableHead><TableHead>结果</TableHead><TableHead>请求</TableHead><TableHead>面板</TableHead><TableHead>响应</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.items.length ? data.items.map(log => <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                <TableCell><Badge variant={log.level === "info" ? "secondary" : "warning"}>{log.level.toUpperCase()}</Badge></TableCell>
                <TableCell><ResultBadge log={log} /></TableCell>
                <TableCell><p className="flex items-center gap-2"><Badge variant="outline">{log.method}</Badge><code className="break-all text-xs">{log.apiPath}</code></p>{log.userId ? <p className="mt-1 text-xs text-muted-foreground">用户：{log.userId}</p> : null}</TableCell>
                <TableCell><p>{log.panelHost || "-"}</p><p className="text-xs text-muted-foreground">{log.transport}{log.readOnly ? " · 只读" : ""}</p></TableCell>
                <TableCell><p>{log.statusCode} · {log.durationMs} ms</p>{log.error ? <p className="max-w-sm text-xs text-destructive">{log.error}</p> : <p className="text-xs text-muted-foreground">{log.requestId}</p>}</TableCell>
              </TableRow>) : <TableRow><TableCell colSpan={6}><EmptyState title="暂无日志" description="当前筛选条件下没有 3x-ui 访问记录。" /></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>

        <CardFooter className="justify-between border-t py-4">
          <CardDescription>第 {data.page} / {pageCount} 页</CardDescription>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))}>上一页</Button><Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage(current => current + 1)}>下一页</Button></div>
        </CardFooter>
      </Card>
    </div>
  </>
}
