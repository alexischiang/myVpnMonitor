import * as React from "react"
import { Database, Link2, Loader2, Network } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { User } from "@/types"
import { formatBytes, formatDate } from "@/utils"

type XuiClientOption = {
  email: string
  totalBytes: number
  usedBytes: number
  limitIp: number
  expiryTime: number
  enabled: boolean
  linkedUserId: string
  linkedUserName: string
}
type XuiClientData = {
  clients: XuiClientOption[]
  importPreview: { email: string; totalBytes: number; limitIp: number; expiresAt: string; resetDay: number }
}

const groups = ["basic", "pro", "ultra"]

export function XuiClientDialog({ user, open, onOpenChange, onComplete }: {
  user: User
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => Promise<void>
}) {
  const [mode, setMode] = React.useState("import")
  const [group, setGroup] = React.useState("pro")
  const [clientEmail, setClientEmail] = React.useState("")
  const [clients, setClients] = React.useState<XuiClientOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setMode("import")
    setGroup(groups.includes(user.activeGroup || "") ? user.activeGroup || "pro" : "pro")
    setClientEmail("")
    setError("")
    setLoading(false)
  }, [open, user.activeGroup])

  React.useEffect(() => {
    if (!open || mode !== "link") return
    setLoading(true)
    void fetchJson<XuiClientData>(`/api/xui-clients?userId=${encodeURIComponent(user.id)}`)
      .then(data => setClients(data.clients))
      .catch(error => setError(error instanceof Error ? error.message : "无法读取3x-ui Client"))
      .finally(() => setLoading(false))
  }, [open, mode, user.id])

  const preview = {
    email: user.email || "将创建新的 Client",
    totalBytes: user.xuiTrafficLimitBytes || 100 * 1024 ** 3,
    limitIp: user.deviceLimit ?? user.xuiIpLimit ?? 0,
    expiresAt: user.expiresAt || "",
    resetDay: user.xuiTrafficResetAnchorDay || (user.purchasedAt ? new Date(user.purchasedAt).getDate() : new Date().getDate())
  }

  const availableClients = React.useMemo(() => clients.filter(client => !client.linkedUserId || client.linkedUserId === user.id), [clients, user.id])
  const selectedClient = availableClients.find(client => client.email === clientEmail)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === "link" && !clientEmail) return
    setSaving(true)
    setError("")
    try {
      await postJson(`/api/users/${user.id}/xui`, { mode, activeGroup: group, clientEmail })
      await onComplete()
      onOpenChange(false)
      toast.success(mode === "link" ? "已关联3x-ui Client并切换线路" : "已导入3x-ui并切换线路")
    } catch (error) {
      setError(error instanceof Error ? error.message : "3x-ui操作失败")
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <form className="grid gap-5" onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>切换到自研线路</DialogTitle>
          <DialogDescription>选择创建新 Client 或关联已有 Client；节点自动跟随套餐分组。</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={value => { setMode(value); setClientEmail(""); setError("") }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import"><Database />导入到3x-ui</TabsTrigger>
            <TabsTrigger value="link"><Link2 />关联已有 Client</TabsTrigger>
          </TabsList>
        </Tabs>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="xui-plan-group">套餐分组</FieldLabel>
            <Select value={group} onValueChange={setGroup} disabled={saving}>
              <SelectTrigger id="xui-plan-group" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{groups.map(value => <SelectItem key={value} value={value}>{value.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <FieldDescription>使用“入站管理”中该分组配置的所有节点。</FieldDescription>
          </Field>
          {mode === "link" ? <Field>
            <FieldLabel htmlFor="xui-client">3x-ui Client</FieldLabel>
            <Select value={clientEmail} onValueChange={setClientEmail} disabled={loading || saving}>
              <SelectTrigger id="xui-client" className="w-full"><SelectValue placeholder={loading ? "正在读取 Client..." : "选择未关联的 Client"} /></SelectTrigger>
              <SelectContent>{availableClients.map(client => <SelectItem key={client.email} value={client.email}>{client.email}</SelectItem>)}</SelectContent>
            </Select>
            {!loading && !availableClients.length ? <FieldDescription>没有可关联的 Client。</FieldDescription> : null}
          </Field> : null}
        </FieldGroup>
        {mode === "import" ? <Item variant="outline">
          <ItemContent><ItemTitle>{preview.email}</ItemTitle><ItemGroup className="mt-2 grid-cols-2"><Item variant="muted" size="sm"><ItemContent><ItemDescription>流量限额</ItemDescription><ItemTitle>{formatBytes(preview.totalBytes)}</ItemTitle></ItemContent></Item><Item variant="muted" size="sm"><ItemContent><ItemDescription>IP 限制</ItemDescription><ItemTitle>{preview.limitIp || "不限"}</ItemTitle></ItemContent></Item><Item variant="muted" size="sm"><ItemContent><ItemDescription>到期日</ItemDescription><ItemTitle>{preview.expiresAt ? formatDate(preview.expiresAt) : "不限"}</ItemTitle></ItemContent></Item><Item variant="muted" size="sm"><ItemContent><ItemDescription>流量重置日</ItemDescription><ItemTitle>每月 {preview.resetDay} 日</ItemTitle></ItemContent></Item></ItemGroup></ItemContent>
        </Item> : selectedClient ? <Item variant="outline">
          <ItemContent><ItemTitle>{selectedClient.email}</ItemTitle><ItemDescription>关联后邮箱设为 {user.email} · {selectedClient.totalBytes ? `原额度 ${formatBytes(selectedClient.totalBytes)}` : "原额度不限，将使用 100 GB"} · IP 上限 {selectedClient.limitIp || "不限"} · {selectedClient.expiryTime ? formatDate(new Date(selectedClient.expiryTime).toISOString()) : "永不过期"}</ItemDescription></ItemContent>
        </Item> : null}
        <Alert><Network /><AlertDescription>确认后旧订阅池停止交付；3x-ui 原生额度改为不限，由后台按节点倍率计费、停用并按购买日重置。</AlertDescription></Alert>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={saving}>取消</Button></DialogClose><Button type="submit" disabled={saving || (mode === "link" && !selectedClient)}>{saving ? <Loader2 className="animate-spin" /> : <Network />}{saving ? "处理中..." : "确认切换"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
