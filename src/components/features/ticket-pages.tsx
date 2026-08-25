import * as React from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { AlertCircle, Clock3, Image as ImageIcon, ImageUp, LifeBuoy, Loader2, Plus, Search, Send, UserRound, X, XCircle } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader } from "@/components/ui/message"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime, formatMoney } from "@/utils"
import { BackButton } from "@/components/features/back-button"

type TicketStatus = "pending_support" | "pending_user" | "closed"
type TicketStage = "active" | "ended"
type TicketAttachment = { url: string; name: string }
type TicketMessage = { id: string; sender: "user" | "admin"; senderName: string; message: string; attachments?: TicketAttachment[]; createdAt: string }
type TicketOrder = { id: string; merOrderTid: string; planName: string; optionLabel: string; totalAmount?: number; amount: number; statusText: string; status: string; createdAt: string }
type Ticket = {
  id: string
  accountId: string
  email: string
  subject: string
  status: TicketStatus
  relatedOrderId?: string
  relatedOrder?: TicketOrder | null
  messages: TicketMessage[]
  user?: { id: string; email: string; customerID?: string }
  createdAt: string
  updatedAt: string
  closedAt?: string
}

const statusLabels: Record<TicketStatus, string> = {
  pending_support: "待客服回复",
  pending_user: "待用户回复",
  closed: "已解决",
}

function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={status === "pending_support" ? "warning" : status === "pending_user" ? "default" : "success"}>{statusLabels[status]}</Badge>
}

function LoadingPage() {
  return <section className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-24" /><Skeleton className="h-80" /></section>
}

function ErrorAlert({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertCircle /><AlertTitle>无法加载工单</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>
}

function TicketMessageThread({ ticket, showAvatar = true }: { ticket: Ticket; showAvatar?: boolean }) {
  return (
    <MessageGroup className="gap-4">
      {ticket.messages.map(message => {
        const fromUser = message.sender === "user"
        return (
          <Message key={message.id} align={fromUser ? "end" : "start"}>
            {showAvatar ? <MessageAvatar><Avatar className="size-8"><AvatarFallback>{fromUser ? "我" : "客服"}</AvatarFallback></Avatar></MessageAvatar> : null}
            <MessageContent>
              <MessageHeader>{fromUser ? "你" : "NEXORA 团队"}</MessageHeader>
              <Bubble variant={fromUser ? "default" : "muted"} align={fromUser ? "end" : "start"}>
                <BubbleContent className="whitespace-pre-wrap">{message.message}</BubbleContent>
              </Bubble>
              {message.attachments?.map(attachment => <Bubble key={attachment.url} variant="outline" align={fromUser ? "end" : "start"}><BubbleContent asChild className="p-0"><a href={attachment.url} target="_blank" rel="noreferrer" aria-label={`打开截图：${attachment.name}`}><img src={attachment.url} alt={attachment.name} loading="lazy" decoding="async" className="max-h-64 w-auto max-w-full object-contain" /></a></BubbleContent></Bubble>)}
              <MessageFooter><time>{formatDateTime(message.createdAt)}</time></MessageFooter>
            </MessageContent>
          </Message>
        )
      })}
    </MessageGroup>
  )
}

function TicketListTable({ tickets, admin = false }: { tickets: Ticket[]; admin?: boolean }) {
  const base = admin ? "/tickets" : "/account/tickets"
  if (!tickets.length) return (
    <Item variant="muted" className="justify-center py-12 text-center">
      <ItemContent className="items-center"><LifeBuoy className="size-8 text-muted-foreground" /><ItemTitle>暂无工单</ItemTitle><ItemDescription>{admin ? "当前筛选条件下没有需要处理的工单。" : "遇到订阅、连接或付款问题时，可以创建工单联系支持人员。"}</ItemDescription></ItemContent>
    </Item>
  )
  return (
    <>
      <ItemGroup className="md:hidden">
        {tickets.map(ticket => (
          <Item key={ticket.id} asChild variant="outline">
            <Link to={`${base}/${encodeURIComponent(ticket.id)}`}>
              <ItemContent><ItemTitle className="line-clamp-1">{ticket.subject}</ItemTitle><ItemDescription>{ticket.id} · {formatDateTime(ticket.updatedAt)}</ItemDescription></ItemContent>
              <ItemActions><TicketStatusBadge status={ticket.status} /></ItemActions>
            </Link>
          </Item>
        ))}
      </ItemGroup>
      <section className="hidden overflow-x-auto md:block" aria-label="工单列表">
        <Table>
          <TableHeader><TableRow><TableHead>工单</TableHead>{admin ? <TableHead>用户</TableHead> : null}<TableHead>状态</TableHead><TableHead>最后更新</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
          <TableBody>{tickets.map(ticket => (
            <TableRow key={ticket.id}>
              <TableCell><span className="block font-medium">{ticket.subject}</span><span className="font-mono text-xs text-muted-foreground">{ticket.id}</span></TableCell>
              {admin ? <TableCell>{ticket.user?.email || ticket.email}</TableCell> : null}
              <TableCell><TicketStatusBadge status={ticket.status} /></TableCell>
              <TableCell>{formatDateTime(ticket.updatedAt)}</TableCell>
              <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link to={`${base}/${encodeURIComponent(ticket.id)}`}>查看工单</Link></Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </section>
    </>
  )
}

export function AccountTicketsPage() {
  const [tickets, setTickets] = React.useState<Ticket[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedStatus = searchParams.get("status")
  const status: "all" | TicketStage = requestedStatus === "ended" || requestedStatus === "closed" ? "ended" : requestedStatus && requestedStatus !== "all" ? "active" : "all"
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  React.useEffect(() => { fetchJson<Ticket[]>("/api/account/tickets").then(setTickets).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [])
  if (loading) return <LoadingPage />
  const filtered = status === "all" ? tickets : tickets.filter(ticket => status === "ended" ? ticket.status === "closed" : ticket.status !== "closed")
  return (
    <section className="grid gap-4 px-4 lg:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">记录需要持续跟进的连接、订阅和付款问题。</p><Button asChild><Link to="/account/tickets/new"><Plus />创建工单</Link></Button></header>
      {error ? <ErrorAlert message={error} /> : null}
      <Card><CardHeader><CardTitle>我的工单</CardTitle><CardDescription>进行中工单会标明当前等待哪一方回复。</CardDescription></CardHeader><CardContent className="grid gap-4">
        <Tabs value={status} onValueChange={value => setSearchParams(value === "all" ? {} : { status: value }, { replace: true })}><TabsList className="h-auto flex-wrap"><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="active">进行中</TabsTrigger><TabsTrigger value="ended">已结束</TabsTrigger></TabsList></Tabs>
        <TicketListTable tickets={filtered} />
      </CardContent></Card>
    </section>
  )
}

export function AccountTicketCreatePage() {
  const navigate = useNavigate()
  const [orders, setOrders] = React.useState<TicketOrder[]>([])
  const [relatedOrderId, setRelatedOrderId] = React.useState("none")
  const [subject, setSubject] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [screenshots, setScreenshots] = React.useState<File[]>([])
  const [saving, setSaving] = React.useState(false)
  const screenshotInput = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { fetchJson<TicketOrder[]>("/api/account/orders").then(setOrders).catch(() => undefined) }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const attachments = await Promise.all(screenshots.map(async file => {
        const { url } = await fetchJson<{ url: string }>("/api/account/ticket-images", { method: "POST", body: file, headers: { "content-type": file.type } })
        return { url, name: file.name.slice(0, 100) }
      }))
      const ticket = await postJson<Ticket>("/api/account/tickets", { relatedOrderId: relatedOrderId === "none" ? "" : relatedOrderId, subject, message, attachments })
      toast.success("工单已提交")
      navigate(`/account/tickets/${encodeURIComponent(ticket.id)}`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "提交失败") } finally { setSaving(false) }
  }
  return (
    <section className="grid gap-4 px-4 lg:px-6">
      <BackButton fallback="/account/tickets" className="w-fit" />
      <Card className="max-w-3xl"><CardHeader><CardTitle>创建工单</CardTitle><CardDescription>请提供具体错误和发生时间，客服能更快定位问题。</CardDescription></CardHeader><CardContent>
        <form id="create-ticket" onSubmit={submit} noValidate><FieldGroup>
          <Field><FieldLabel htmlFor="ticket-subject">工单主题</FieldLabel><Input id="ticket-subject" value={subject} onChange={event => setSubject(event.target.value)} minLength={4} maxLength={80} placeholder="例如：付款成功但套餐仍未开通" required /></Field>
          <Field><FieldLabel htmlFor="ticket-order">关联订单（可选）</FieldLabel><Select value={relatedOrderId} onValueChange={setRelatedOrderId}><SelectTrigger id="ticket-order" className="w-full"><SelectValue placeholder="不关联订单" /></SelectTrigger><SelectContent><SelectItem value="none">不关联订单</SelectItem>{orders.slice(0, 20).map(order => <SelectItem key={order.id} value={order.id}>{formatDateTime(order.createdAt)} · {formatMoney(order.totalAmount ?? order.amount)} · {order.planName} · {order.statusText}</SelectItem>)}</SelectContent></Select><FieldDescription>付款或套餐发放问题建议关联对应订单。</FieldDescription></Field>
          <Field><FieldLabel htmlFor="ticket-message">问题描述</FieldLabel><Textarea id="ticket-message" value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={5000} rows={11} placeholder="请说明使用的客户端、发生时间、错误信息，以及已经尝试的处理方式。" required /><FieldDescription>{message.length} / 5000</FieldDescription></Field>
          <Field><FieldLabel>问题截图（可选）</FieldLabel><Button type="button" variant="outline" className="w-fit" onClick={() => screenshotInput.current?.click()} disabled={saving || screenshots.length >= 3}><ImageUp />选择截图</Button><input ref={screenshotInput} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.some(file => !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 8 * 1024 * 1024)) return toast.error("仅支持 PNG、JPEG、WebP、GIF，单张不超过 8MB"); if (screenshots.length + files.length > 3) return toast.error("最多上传 3 张截图"); setScreenshots(current => [...current, ...files]) }} /><FieldDescription>最多 3 张，单张不超过 8MB。</FieldDescription>{screenshots.length ? <ItemGroup>{screenshots.map((file, index) => <Item key={`${file.name}-${file.lastModified}`} variant="outline"><ImageIcon /><ItemContent><ItemTitle>{file.name}</ItemTitle><ItemDescription>{(file.size / 1024 / 1024).toFixed(2)} MB</ItemDescription></ItemContent><ItemActions><Button type="button" variant="ghost" size="icon-sm" aria-label={`移除 ${file.name}`} onClick={() => setScreenshots(current => current.filter((_, itemIndex) => itemIndex !== index))}><X /></Button></ItemActions></Item>)}</ItemGroup> : null}</Field>
        </FieldGroup></form>
      </CardContent><Separator /><CardFooter><Button form="create-ticket" className="w-full" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Send />}提交工单</Button></CardFooter></Card>
    </section>
  )
}

function ReplyComposer({ disabled, onSend }: { disabled?: boolean; onSend: (message: string) => Promise<void> }) {
  const [message, setMessage] = React.useState("")
  const [sending, setSending] = React.useState(false)
  async function send() {
    if (!message.trim()) return
    setSending(true)
    try { await onSend(message); setMessage("") } finally { setSending(false) }
  }
  return (
    <Field><FieldLabel htmlFor="ticket-reply">回复内容</FieldLabel><Textarea id="ticket-reply" value={message} onChange={event => setMessage(event.target.value)} rows={4} maxLength={5000} disabled={disabled || sending} placeholder="输入需要补充的信息" className="min-h-28 resize-y field-sizing-fixed" /><footer className="flex justify-end"><Button className="w-full sm:w-auto" onClick={() => void send()} disabled={disabled || sending || !message.trim()}>{sending ? <Loader2 className="animate-spin" /> : <Send />}发送回复</Button></footer></Field>
  )
}

export function AccountTicketDetailPage() {
  const { id = "" } = useParams()
  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [closeOpen, setCloseOpen] = React.useState(false)
  const path = `/api/account/tickets/${encodeURIComponent(id)}`
  const refresh = React.useCallback(() => fetchJson<Ticket>(path).then(setTicket), [path])
  React.useEffect(() => { refresh().catch(error => setError(error.message)).finally(() => setLoading(false)) }, [refresh])
  async function reply(message: string) { try { setTicket(await postJson<Ticket>(`${path}/reply`, { message })); toast.success("回复已发送") } catch (error) { toast.error(error instanceof Error ? error.message : "回复失败"); throw error } }
  async function closeTicket() { try { setTicket(await putJson<Ticket>(path, { action: "close" })); setCloseOpen(false); toast.success("工单已标记为已解决") } catch (error) { toast.error(error instanceof Error ? error.message : "操作失败") } }
  if (loading) return <LoadingPage />
  if (!ticket) return <section className="px-4 lg:px-6"><ErrorAlert message={error || "工单不存在。"} /></section>
  return (
    <section className="grid gap-4 px-4 lg:px-6">
      <header className="flex flex-wrap items-center gap-3"><BackButton fallback="/account/tickets" /><span className="ml-auto flex items-center gap-2"><TicketStatusBadge status={ticket.status} />{ticket.status !== "closed" ? <Button variant="outline" size="sm" onClick={() => setCloseOpen(true)}><XCircle />标记已解决</Button> : null}</span></header>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card><CardHeader><CardTitle>{ticket.subject}</CardTitle><CardDescription>{ticket.id} · 创建于 {formatDateTime(ticket.createdAt)}</CardDescription></CardHeader><CardContent className="grid gap-6"><TicketMessageThread ticket={ticket} showAvatar={false} /><Separator />{ticket.status === "closed" ? <Alert><Clock3 /><AlertTitle>此工单已解决</AlertTitle><AlertDescription>已结束工单不能继续回复，如有新问题请创建新工单。</AlertDescription></Alert> : <ReplyComposer onSend={reply} />}</CardContent></Card>
        <Card className="h-fit"><CardHeader><CardTitle>工单信息</CardTitle></CardHeader><CardContent><ItemGroup><Item variant="muted"><ItemContent><ItemDescription>当前状态</ItemDescription><ItemTitle><TicketStatusBadge status={ticket.status} /></ItemTitle></ItemContent></Item><Item variant="muted"><ItemContent><ItemDescription>最后更新</ItemDescription><ItemTitle>{formatDateTime(ticket.updatedAt)}</ItemTitle></ItemContent></Item>{ticket.relatedOrder ? <Item asChild variant="outline"><Link to={`/account/orders/${encodeURIComponent(ticket.relatedOrder.id)}`}><ItemContent><ItemDescription>关联订单</ItemDescription><ItemTitle>{ticket.relatedOrder.merOrderTid}</ItemTitle><ItemDescription>{ticket.relatedOrder.planName} · {formatMoney(ticket.relatedOrder.totalAmount ?? ticket.relatedOrder.amount)}</ItemDescription></ItemContent></Link></Item> : null}</ItemGroup></CardContent></Card>
      </section>
      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>将工单标记为已解决？</AlertDialogTitle><AlertDialogDescription>结束后不能继续回复或重新打开，请确认问题已经处理完成。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续处理</AlertDialogCancel><AlertDialogAction onClick={() => void closeTicket()}>标记已解决</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>
  )
}

export function AdminTicketsPage() {
  const [tickets, setTickets] = React.useState<Ticket[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get("q") || ""
  const requestedStatus = searchParams.get("status")
  const status: "all" | TicketStage = requestedStatus === "all" ? "all" : requestedStatus === "ended" || requestedStatus === "closed" ? "ended" : "active"
  function updateParam(key: string, value: string, defaultValue: string) { setSearchParams(current => { const next = new URLSearchParams(current); if (value === defaultValue) next.delete(key); else next.set(key, value); return next }, { replace: true }) }
  React.useEffect(() => { fetchJson<Ticket[]>("/api/tickets").then(setTickets).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [])
  if (loading) return <LoadingPage />
  const needle = query.trim().toLowerCase()
  const filtered = tickets.filter(ticket => (status === "all" || (status === "ended" ? ticket.status === "closed" : ticket.status !== "closed")) && (!needle || [ticket.id, ticket.subject, ticket.email].some(value => value.toLowerCase().includes(needle))))
  return (
    <section className="grid gap-4 px-4 lg:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">进行中工单优先显示等待客服时间最长的记录。</p><Badge variant="warning">进行中 {tickets.filter(ticket => ticket.status !== "closed").length}</Badge></header>
      {error ? <ErrorAlert message={error} /> : null}
      <Card><CardHeader><CardTitle>工单队列</CardTitle><CardDescription>按编号、邮箱或主题查找工单。</CardDescription></CardHeader><CardContent className="grid gap-4">
        <section className="flex flex-col gap-3 md:flex-row"><label className="relative flex-1"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => updateParam("q", event.target.value, "")} placeholder="搜索编号、邮箱或主题" aria-label="搜索工单" className="pl-9" /></label><Select value={status} onValueChange={value => updateParam("status", value, "active")}><SelectTrigger aria-label="筛选工单状态" className="w-full md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="active">进行中</SelectItem><SelectItem value="ended">已结束</SelectItem></SelectContent></Select></section>
        <TicketListTable tickets={filtered} admin />
      </CardContent></Card>
    </section>
  )
}

export function AdminTicketDetailPage() {
  const { id = "" } = useParams()
  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [resolveOpen, setResolveOpen] = React.useState(false)
  const path = `/api/tickets/${encodeURIComponent(id)}`
  React.useEffect(() => { fetchJson<Ticket>(path).then(setTicket).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [path])
  async function resolve() { try { setTicket(await putJson<Ticket>(path, { action: "resolve" })); setResolveOpen(false); toast.success("工单已标记为已解决") } catch (error) { toast.error(error instanceof Error ? error.message : "更新失败") } }
  async function reply(message: string) { try { setTicket(await postJson<Ticket>(`${path}/reply`, { message })); toast.success("回复已发送") } catch (error) { toast.error(error instanceof Error ? error.message : "回复失败"); throw error } }
  if (loading) return <LoadingPage />
  if (!ticket) return <section className="px-4 lg:px-6"><ErrorAlert message={error || "工单不存在。"} /></section>
  return (
    <section className="grid gap-4 px-4 lg:px-6">
      <header className="flex flex-wrap items-center gap-3"><BackButton fallback="/tickets" />{ticket.status !== "closed" ? <Button variant="outline" size="sm" className="ml-auto" onClick={() => setResolveOpen(true)}><XCircle />标记已解决</Button> : null}</header>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card><CardHeader><CardTitle>{ticket.subject}</CardTitle><CardDescription>{ticket.id} · {formatDateTime(ticket.createdAt)}</CardDescription><CardAction><TicketStatusBadge status={ticket.status} /></CardAction></CardHeader><CardContent className="grid gap-6"><TicketMessageThread ticket={ticket} showAvatar={false} /><Separator />{ticket.status === "closed" ? <Alert><Clock3 /><AlertTitle>工单已解决</AlertTitle><AlertDescription>已结束工单不能继续回复或重新打开。</AlertDescription></Alert> : <ReplyComposer onSend={reply} />}</CardContent></Card>
        <section className="grid h-fit gap-4">
          <Card><CardHeader><CardTitle>用户信息</CardTitle></CardHeader><CardContent><ItemGroup><Item variant="muted"><UserRound /><ItemContent><ItemDescription>用户邮箱</ItemDescription><ItemTitle>{ticket.user?.email || ticket.email}</ItemTitle>{ticket.user?.customerID ? <ItemDescription>{ticket.user.customerID}</ItemDescription> : null}</ItemContent></Item>{ticket.user?.id ? <Button asChild variant="outline"><Link to={`/users/detail/${encodeURIComponent(ticket.user.id)}`}>查看用户详情</Link></Button> : null}</ItemGroup></CardContent></Card>
          {ticket.relatedOrder ? <Card><CardHeader><CardTitle>关联订单</CardTitle></CardHeader><CardContent><ItemGroup><Item variant="muted"><ItemContent><ItemDescription>{ticket.relatedOrder.merOrderTid}</ItemDescription><ItemTitle>{ticket.relatedOrder.planName} / {ticket.relatedOrder.optionLabel}</ItemTitle><ItemDescription>{formatMoney(ticket.relatedOrder.totalAmount ?? ticket.relatedOrder.amount)} · {ticket.relatedOrder.statusText}</ItemDescription></ItemContent></Item><Button asChild variant="outline"><Link to={`/orders/${encodeURIComponent(ticket.relatedOrder.id)}`}>查看订单详情</Link></Button></ItemGroup></CardContent></Card> : null}
        </section>
      </section>
      <AlertDialog open={resolveOpen} onOpenChange={setResolveOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>将工单标记为已解决？</AlertDialogTitle><AlertDialogDescription>结束后不能继续回复或重新打开，请确认问题已经处理完成。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续处理</AlertDialogCancel><AlertDialogAction onClick={() => void resolve()}>标记已解决</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>
  )
}
