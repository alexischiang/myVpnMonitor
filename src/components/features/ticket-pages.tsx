import * as React from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { AlertCircle, Image as ImageIcon, ImageUp, LifeBuoy, Loader2, Plus, Search, Send, UserRound, X, XCircle } from "lucide-react"
import { toast } from "@/components/features/toast"

import { fetchJson, postJson, putJson } from "@/api"
import { Avatar } from "@/components/arc/avatar/avatar"
import { AvatarGroup } from "@/components/arc/avatar-group/avatar-group"
import { SimpleTable } from "@/components/features/simple-table"
import { ChatThread, type ChatDraft, type ChatMessage } from "@/components/arc/chat-thread/chat-thread"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Progress } from "@/components/arc/progress/progress"
import { InfoList } from "@/components/features/shared"
import { Separator } from "@/components/ui/separator"
import { formatBytes, formatDate, formatDateTime, formatMoney } from "@/utils"
import { BackButton } from "@/components/features/back-button"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { PageHeader as DetailHeader } from "@/components/arc/blocks/page-header/page-header"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Input } from "@/components/arc/input/input"
import { SearchField } from "@/components/arc/search-field/search-field"
import { Select } from "@/components/arc/select/select"
import { Textarea } from "@/components/arc/textarea/textarea"

type TicketStatus = "pending_support" | "pending_user" | "closed"
type TicketStage = "active" | "ended"
type TicketAttachment = { url: string; name: string }
type TicketMessage = { id: string; sender: "user" | "admin"; senderName: string; message: string; attachments?: TicketAttachment[]; reactions?: Record<string, ("user" | "admin")[]>; createdAt: string }
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
  user?: { id: string; email: string; customerID?: string; planName?: string; optionLabel?: string; duration?: string; expiresAt?: string; traffic?: { usedBytes: number | null; totalBytes: number | null; usagePercent: number | null; lastSyncedAt: string } | null; devices?: { connected: number | null; limit: number } | null }
  createdAt: string
  updatedAt: string
  closedAt?: string
}

// A ticket is either 进行中 or 已解决; while it is open, a second badge shows whose turn it is to reply, from the viewer's side.
function TicketStageBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={status === "closed" ? "success" : "warning"}>{status === "closed" ? "已解决" : "进行中"}</Badge>
}

function TicketReplyBadge({ status, viewer }: { status: TicketStatus; viewer: "user" | "admin" }) {
  if (status === "closed") return null
  const yours = (status === "pending_user") === (viewer === "user")
  // Red marks the viewer's turn so it stands out; Arc's info tone follows this project's near-black accent and would read as grey.
  return <Badge tone={yours ? "danger" : "neutral"}>{yours ? "待您回复" : viewer === "admin" ? "待客户回复" : "待客服回复"}</Badge>
}

function LoadingPage() {
  return <section className="grid gap-4 px-4 lg:px-6"><Skeleton lines={3} /><Skeleton lines={6} /></section>
}

function ErrorAlert({ message }: { message: string }) {
  return <Alert tone="danger" title="无法加载工单">{message}</Alert>
}

const ticketImageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"]
// Matches TICKET_REACTIONS in server.js.
const ticketReactions = ["👍", "❤️", "😂", "🎉", "👀", "🙏"]
type PendingReply = { id: string; text: string; files: File[]; previews: string[]; createdAt: string; failed?: boolean }

// The whole conversation, including replies, lives in Arc's ChatThread. Each side sees its own messages on the trailing side.
// A reply shows as sending until the server returns the updated ticket; a failed one stays in the thread with a retry button.
// Reactions are saved per side, so each side sees the other's; a resolved ticket takes no new replies or reactions.
// The title row names who is in the ticket and ends with whose turn it is to reply.
function TicketConversation({ ticket, viewer, ticketPath, uploadPath, onTicket }: { ticket: Ticket; viewer: "user" | "admin"; ticketPath: string; uploadPath: string; onTicket: (ticket: Ticket) => void }) {
  const [pending, setPending] = React.useState<PendingReply[]>([])
  // Local previews are released on unmount, not on send: the sent copy is still fading out of the thread with its image.
  const previews = React.useRef<string[]>([])
  React.useEffect(() => () => previews.current.forEach(url => URL.revokeObjectURL(url)), [])
  const participants = [{ id: "user", name: viewer === "user" ? "你" : ticket.email }, { id: "admin", name: "NEXORA 团队" }]
  const messages: ChatMessage[] = [
    ...ticket.messages.map(message => ({
      id: message.id,
      authorId: message.sender,
      text: message.message || undefined,
      createdAt: message.createdAt,
      attachments: message.attachments?.map(attachment => ({ id: attachment.url, name: attachment.name, kind: "image" as const, url: attachment.url, alt: attachment.name })),
      reactions: Object.entries(message.reactions || {}).map(([emoji, sides]) => ({ emoji, count: sides.length, mine: sides.includes(viewer) })),
    })),
    ...pending.map(reply => ({
      id: reply.id,
      authorId: viewer,
      text: reply.text || undefined,
      createdAt: reply.createdAt,
      attachments: reply.files.map((file, index) => ({ id: `${reply.id}-${index}`, name: file.name, kind: "image" as const, url: reply.previews[index], alt: file.name })),
      status: reply.failed ? "failed" as const : "sending" as const,
    })),
  ]

  async function deliver(reply: PendingReply) {
    setPending(current => current.map(item => item.id === reply.id ? { ...item, failed: false } : item))
    try {
      const attachments = await Promise.all(reply.files.map(async file => {
        const { url } = await fetchJson<{ url: string }>(uploadPath, { method: "POST", body: file, headers: { "content-type": file.type } })
        return { url, name: file.name.slice(0, 100) }
      }))
      onTicket(await postJson<Ticket>(`${ticketPath}/reply`, { message: reply.text, attachments }))
      setPending(current => current.filter(item => item.id !== reply.id))
    } catch (error) {
      setPending(current => current.map(item => item.id === reply.id ? { ...item, failed: true } : item))
      toast({ type: "error", title: error instanceof Error ? error.message : "回复失败" })
    }
  }

  function send({ text, files }: ChatDraft) {
    if (files.length > 3) { toast({ type: "error", title: "每条回复最多 3 张截图" }); return }
    if (files.some(file => !ticketImageTypes.includes(file.type) || file.size > 8 * 1024 * 1024)) { toast({ type: "error", title: "仅支持 PNG、JPEG、WebP、GIF，单张不超过 8MB" }); return }
    const reply = { id: `pending-${crypto.randomUUID()}`, text, files, previews: files.map(file => URL.createObjectURL(file)), createdAt: new Date().toISOString() }
    previews.current.push(...reply.previews)
    setPending(current => [...current, reply])
    void deliver(reply)
  }

  async function react(messageId: string, emoji: string) {
    if (messageId.startsWith("pending-")) return
    try { onTicket(await postJson<Ticket>(`${ticketPath}/messages/${encodeURIComponent(messageId)}/reactions`, { emoji })) }
    catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "回应失败" }) }
  }

  const closed = ticket.status === "closed"
  // ChatThread is one div, so it carries the frame itself; the wrapper only gives it the fixed height it needs.
  const header = <>
    <AvatarGroup size="sm" label="对话成员" members={[{ name: ticket.email }, { name: "NEXORA 团队" }]} />
    <div className="grid min-w-0 flex-1"><span className="truncate text-sm font-medium">{ticket.subject}</span><span className="truncate text-xs text-muted-foreground">{ticket.email}、NEXORA 团队</span></div>
    <TicketReplyBadge status={ticket.status} viewer={viewer} />
  </>
  return <div className="h-[min(40rem,75svh)] min-w-0"><ChatThread className="overflow-hidden rounded-4xl border border-border bg-card" header={header} label="工单对话" participants={participants} currentUserId={viewer} messages={messages}
    reactions={closed ? [] : ticketReactions} onReact={closed ? undefined : (messageId, emoji) => void react(messageId, emoji)}
    composer={!closed} onSend={send} onRetry={id => { const reply = pending.find(item => item.id === id); if (reply) void deliver(reply) }}
    placeholder="输入回复内容，可粘贴或拖入截图" accept={ticketImageTypes.join(",")} /></div>
}

function TicketListTable({ tickets, admin = false }: { tickets: Ticket[]; admin?: boolean }) {
  const base = admin ? "/tickets" : "/account/tickets"
  const badges = (ticket: Ticket) => <span className="flex flex-wrap items-center gap-1.5"><TicketStageBadge status={ticket.status} /><TicketReplyBadge status={ticket.status} viewer={admin ? "admin" : "user"} /></span>
  if (!tickets.length) return (
    <Card className="justify-center py-12 text-center" title="暂无工单" description={admin ? "当前筛选条件下没有需要处理的工单。" : "遇到订阅、连接或付款问题时，可以创建工单联系支持人员。"}><LifeBuoy className="size-8 text-muted-foreground" /></Card>
  )
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {tickets.map(ticket => (
          <Link key={ticket.id} to={`${base}/${encodeURIComponent(ticket.id)}`} className="block">
            <Card title={<span className="line-clamp-1">{ticket.subject}</span>} description={`${ticket.id} · ${formatDateTime(ticket.updatedAt)}`} headerAction={badges(ticket)} />
          </Link>
        ))}
      </div>
      <section className="hidden overflow-x-auto md:block" aria-label="工单列表">
        <SimpleTable
          caption="工单列表"
          columns={["工单", ...(admin ? ["用户"] : []), "状态", "最后更新", "操作"]}
          rows={tickets}
          rowKey={ticket => ticket.id}
          cells={ticket => [
            <><span className="block font-medium">{ticket.subject}</span><span className="font-mono text-xs text-muted-foreground">{ticket.id}</span></>,
            ...(admin ? [<>{ticket.user?.email || ticket.email}</>] : []),
            badges(ticket),
            <>{formatDateTime(ticket.updatedAt)}</>,
            <Button asChild variant="ghost" size="sm"><Link to={`${base}/${encodeURIComponent(ticket.id)}`}>查看工单</Link></Button>,
          ]}
        />
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
      <Card title="我的工单" description="进行中工单会标明当前等待哪一方回复。"><div className="grid gap-4">
        <Tabs value={status} onValueChange={value => setSearchParams(value === "all" ? {} : { status: value }, { replace: true })}><TabsList className="h-auto flex-wrap"><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="active">进行中</TabsTrigger><TabsTrigger value="ended">已解决</TabsTrigger></TabsList></Tabs>
        <TicketListTable tickets={filtered} />
      </div></Card>
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
      toast({ type: "success", title: "工单已提交" })
      navigate(`/account/tickets/${encodeURIComponent(ticket.id)}`)
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "提交失败" }) } finally { setSaving(false) }
  }
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 lg:px-6">
      <BackButton fallback="/account/tickets" className="w-fit" />
      <Card title="创建工单" description="请提供具体错误和发生时间，客服能更快定位问题。"><form id="create-ticket" onSubmit={submit} noValidate><FieldGroup>
          <div className="grid gap-6 lg:grid-cols-2">
            <Input label="工单主题" id="ticket-subject" value={subject} onChange={event => setSubject(event.target.value)} minLength={4} maxLength={80} placeholder="例如：付款成功但套餐仍未开通" required />
            <Select label="关联订单（可选）" description="付款或套餐发放问题建议关联对应订单。" value={relatedOrderId} onValueChange={setRelatedOrderId} id="ticket-order" className="w-full" placeholder="不关联订单" options={[{ value: "none", label: "不关联订单" }, ...orders.slice(0, 20).map(order => ({ value: order.id, label: `${formatDateTime(order.createdAt)} · ${formatMoney(order.totalAmount ?? order.amount)} · ${order.planName} · ${order.statusText}` }))]} />
          </div>
          <Textarea label="问题描述" description={`${message.length} / 5000`} id="ticket-message" value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={5000} rows={11} placeholder="请说明使用的客户端、发生时间、错误信息，以及已经尝试的处理方式。" required />
          <Field><FieldLabel>问题截图（可选）</FieldLabel><Button type="button" variant="secondary" className="w-fit" onClick={() => screenshotInput.current?.click()} disabled={saving || screenshots.length >= 3}><ImageUp />选择截图</Button><input ref={screenshotInput} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.some(file => !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 8 * 1024 * 1024)) return toast({ type: "error", title: "仅支持 PNG、JPEG、WebP、GIF，单张不超过 8MB" }); if (screenshots.length + files.length > 3) return toast({ type: "error", title: "最多上传 3 张截图" }); setScreenshots(current => [...current, ...files]) }} /><FieldDescription>最多 3 张，单张不超过 8MB。</FieldDescription>{screenshots.length ? <div className="grid gap-3">{screenshots.map((file, index) => <Card key={`${file.name}-${file.lastModified}`} title={<span className="flex items-center gap-2"><ImageIcon />{file.name}</span>} description={`${(file.size / 1024 / 1024).toFixed(2)} MB`} headerAction={<><Button type="button" variant="ghost" size="icon-sm" aria-label={`移除 ${file.name}`} onClick={() => setScreenshots(current => current.filter((_, itemIndex) => itemIndex !== index))}><X /></Button></>} />)}</div> : null}</Field>
        </FieldGroup></form><Separator /><div className="mt-4 flex items-center gap-2"><ActionButton type="submit" form="create-ticket" className="w-full" label="提交工单" pending={saving} /></div></Card>
    </section>
  )
}

export function AccountTicketDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const path = `/api/account/tickets/${encodeURIComponent(id)}`
  const refresh = React.useCallback(() => fetchJson<Ticket>(path).then(setTicket), [path])
  React.useEffect(() => { refresh().catch(error => setError(error.message)).finally(() => setLoading(false)) }, [refresh])
  if (loading) return <LoadingPage />
  if (!ticket) return <section className="px-4 lg:px-6"><ErrorAlert message={error || "工单不存在。"} /></section>
  return (
    <section className="grid gap-4 px-4 lg:px-6">
      <DetailHeader breadcrumbs={[{ label: "工单服务", href: "/account/tickets", onClick: event => { event.preventDefault(); navigate("/account/tickets") } }, { label: ticket.id }]} title={ticket.subject} statusAlign="end" status={<TicketStageBadge status={ticket.status} />} actions={<BackButton fallback="/account/tickets" />} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="grid min-w-0 content-start gap-4"><TicketConversation ticket={ticket} viewer="user" ticketPath={path} uploadPath="/api/account/ticket-images" onTicket={setTicket} />{ticket.status === "closed" ? <Alert title="此工单已解决">已结束工单不能继续回复，如有新问题请创建新工单。</Alert> : null}</div>
        <Card className="h-fit" title="工单信息"><div className="grid gap-4"><InfoList items={[{ label: "创建时间", value: formatDateTime(ticket.createdAt) }, { label: "最后更新", value: formatDateTime(ticket.updatedAt) }, ...(ticket.relatedOrder ? [{ label: "关联订单", value: <span className="font-mono text-xs">{ticket.relatedOrder.merOrderTid}</span> }, { label: "套餐", value: ticket.relatedOrder.planName }, { label: "金额", value: formatMoney(ticket.relatedOrder.totalAmount ?? ticket.relatedOrder.amount) }] : [])]} />{ticket.relatedOrder ? <Button asChild variant="secondary" size="sm" className="w-full"><Link to={`/account/orders/${encodeURIComponent(ticket.relatedOrder.id)}`}>查看订单详情</Link></Button> : null}</div></Card>
      </section>
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
      <header className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">进行中工单优先显示等待客服时间最长的记录。</p><Badge tone="warning">进行中 {tickets.filter(ticket => ticket.status !== "closed").length}</Badge></header>
      {error ? <ErrorAlert message={error} /> : null}
      <Card title="工单队列" description="按编号、邮箱或主题查找工单。"><div className="grid gap-4">
        <section className="flex flex-col gap-3 md:flex-row"><div className="flex-1"><SearchField label="搜索工单" hideLabel value={query} onValueChange={value => updateParam("q", value, "")} placeholder="搜索编号、邮箱或主题" /></div><Select label="筛选工单状态" hideLabel value={status} onValueChange={value => updateParam("status", value, "active")} className="w-full md:w-44" options={[{ value: "all", label: "全部状态" }, { value: "active", label: "进行中" }, { value: "ended", label: "已解决" }]} /></section>
        <TicketListTable tickets={filtered} admin />
      </div></Card>
    </section>
  )
}

export function AdminTicketDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [resolveOpen, setResolveOpen] = React.useState(false)
  const path = `/api/tickets/${encodeURIComponent(id)}`
  React.useEffect(() => { fetchJson<Ticket>(path).then(setTicket).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [path])
  async function resolve() { try { setTicket(await putJson<Ticket>(path, { action: "resolve" })); setResolveOpen(false); toast({ type: "success", title: "工单已标记为已解决" }) } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "更新失败" }) } }
  if (loading) return <LoadingPage />
  if (!ticket) return <section className="px-4 lg:px-6"><ErrorAlert message={error || "工单不存在。"} /></section>
  const user = ticket.user
  const traffic = user?.traffic
  // Traffic is a row in the list; a known quota also gets a progress bar under it.
  const trafficSynced = traffic?.usedBytes != null
  const trafficPercent = trafficSynced && traffic.totalBytes ? traffic.usagePercent ?? Math.min(100, traffic.usedBytes! / traffic.totalBytes * 100) : null
  const order = ticket.relatedOrder
  return (
    <section className="grid gap-4 px-4 lg:px-6">
      <DetailHeader breadcrumbs={[{ label: "工单管理", href: "/tickets", onClick: event => { event.preventDefault(); navigate("/tickets") } }, { label: ticket.id }]} title={ticket.subject} statusAlign="end" status={<>{ticket.status !== "closed" ? <Button variant="secondary" size="sm" onClick={() => setResolveOpen(true)}><XCircle />标记已解决</Button> : null}<TicketStageBadge status={ticket.status} /></>} actions={<BackButton fallback="/tickets" />} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="grid min-w-0 content-start gap-4"><TicketConversation ticket={ticket} viewer="admin" ticketPath={path} uploadPath="/api/markdown/images" onTicket={setTicket} />{ticket.status === "closed" ? <Alert title="工单已解决">已结束工单不能继续回复或重新打开。</Alert> : null}</div>
        <section className="grid h-fit gap-4">
          <Card title={<span className="block truncate">{user?.email || ticket.email}</span>} description={user?.customerID ? `客户编号 #${user.customerID}` : "用户信息"} headerAction={<Avatar name={user?.email || ticket.email || "用户"} />}>{user?.id ? <div className="grid gap-4">
            <div className="grid gap-2">
              <InfoList items={[{ label: "流量使用", value: trafficSynced ? `${formatBytes(traffic.usedBytes)} / ${traffic.totalBytes ? formatBytes(traffic.totalBytes) : "不限"}` : "待同步" }]} />
              {trafficPercent != null ? <Progress value={trafficPercent} aria-label={`已使用流量 ${Math.round(trafficPercent)}%`} /> : null}
              {traffic?.lastSyncedAt ? <p className="text-xs text-muted-foreground">同步于 {formatDateTime(traffic.lastSyncedAt)}</p> : null}
            </div>
            <InfoList items={[
              { label: "当前套餐", value: [user.planName || "未设置", user.optionLabel].filter(Boolean).join(" · ") },
              { label: "设备连接", value: `${user.devices?.connected ?? "-"} / ${user.devices?.limit || "不限"}` },
              { label: "有效期", value: user.duration === "lifetime" ? "永久有效" : user.expiresAt ? formatDate(user.expiresAt) : "未设置" },
            ]} />
            <Button asChild variant="secondary" size="sm" className="w-full"><Link to={`/users/detail/${encodeURIComponent(user.id)}`}>查看用户详情</Link></Button>
          </div> : null}</Card>
          {order ? <Card title="关联订单"><div className="grid gap-4">
            <InfoList items={[
              { label: "套餐", value: `${order.planName} / ${order.optionLabel}` },
              { label: "订单号", value: <span className="font-mono text-xs">{order.merOrderTid}</span> },
              { label: "金额", value: formatMoney(order.totalAmount ?? order.amount) },
              { label: "状态", value: order.statusText },
            ]} />
            <Button asChild variant="secondary" size="sm" className="w-full"><Link to={`/orders/${encodeURIComponent(order.id)}`}>查看订单详情</Link></Button>
          </div></Card> : null}
        </section>
      </section>
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}><DialogContent title="将工单标记为已解决？" description="结束后不能继续回复或重新打开，请确认问题已经处理完成。"><div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="secondary">继续处理</Button></DialogClose><DialogClose asChild><Button onClick={() => void resolve()}>标记已解决</Button></DialogClose></div></DialogContent></Dialog>
    </section>
  )
}
