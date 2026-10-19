import * as React from "react"
import { Database, Link2, Loader2, Network } from "lucide-react"
import { toast } from "@/components/features/toast"

import { fetchJson, postJson } from "@/api"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import type { User } from "@/types"
import { formatBytes, formatDate } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { Card } from "@/components/arc/card/card"

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
  importPreview: { email: string; totalBytes: number; limitIp: number; expiresAt: string }
}

export function XuiClientDialog({ user, open, onOpenChange, onComplete }: {
  user: User
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => Promise<void>
}) {
  const [mode, setMode] = React.useState("import")
  const [clientEmail, setClientEmail] = React.useState("")
  const [clients, setClients] = React.useState<XuiClientOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const clientsLoadedFor = React.useRef("")

  React.useEffect(() => {
    if (!open) return
    setMode("import")
    setClientEmail("")
    setError("")
    setLoading(false)
    if (clientsLoadedFor.current !== user.id) setClients([])
  }, [open, user.id])

  React.useEffect(() => {
    if (!open || mode !== "link") return
    if (clientsLoadedFor.current === user.id) return
    setLoading(true)
    void fetchJson<XuiClientData>(`/api/xui-clients?userId=${encodeURIComponent(user.id)}`)
      .then(data => { setClients(data.clients); clientsLoadedFor.current = user.id })
      .catch(error => setError(error instanceof Error ? error.message : "无法读取3x-ui Client"))
      .finally(() => setLoading(false))
  }, [open, mode, user.id])

  const preview = {
    email: user.email || "将创建新的 Client",
    totalBytes: user.xuiTrafficLimitBytes ?? 0,
    limitIp: user.deviceLimit ?? user.xuiIpLimit ?? 0,
    expiresAt: user.expiresAt || "",
    resetsTraffic: user.v2ProductSnapshot?.trafficBytes !== null && user.duration !== "lifetime"
  }

  const availableClients = React.useMemo(() => clients.filter(client => !client.linkedUserId || client.linkedUserId === user.id), [clients, user.id])
  const selectedClient = availableClients.find(client => client.email === clientEmail)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === "link" && !clientEmail) return
    setSaving(true)
    setError("")
    try {
      await postJson(`/api/users/${user.id}/xui`, { mode, clientEmail })
      await onComplete()
      onOpenChange(false)
      toast({ type: "success", title: mode === "link" ? "已关联3x-ui Client并切换线路" : "已导入3x-ui并切换线路" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "3x-ui操作失败"
      setError(message)
      toast({ type: "error", title: message })
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="切换到自研线路" description="选择创建新 Client 或关联已有 Client；节点自动跟随 V2 套餐的线路权限组。"><form className="grid gap-5" onSubmit={submit}>
        <Tabs value={mode} onValueChange={value => { setMode(value); setClientEmail(""); setError("") }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import"><Database />导入到3x-ui</TabsTrigger>
            <TabsTrigger value="link"><Link2 />关联已有 Client</TabsTrigger>
          </TabsList>
        </Tabs>
        <FieldGroup>
          <Input label="线路权限组" description="使用该权限组在 V2 商品库中配置的所有入站；如需更换请先更改套餐。" id="xui-line-group" value={user.v2ProductSnapshot?.lineGroupId || "未绑定 V2 套餐"} readOnly />
          {mode === "link" ? <Field>
            <FieldLabel htmlFor="xui-client">3x-ui Client</FieldLabel>
            <Select label={loading ? "正在读取 Client..." : "选择未关联的 Client"} hideLabel value={clientEmail} onValueChange={setClientEmail} disabled={loading || saving} id="xui-client" className="w-full" placeholder={loading ? "正在读取 Client..." : "选择未关联的 Client"} options={[...availableClients.map(client => ({ value: client.email, label: client.email }))]} />
            {!loading && !availableClients.length ? <FieldDescription>没有可关联的 Client。</FieldDescription> : null}
          </Field> : null}
        </FieldGroup>
        {mode === "import" ? <Card title={preview.email}><div className="grid gap-3 mt-2 grid-cols-2"><Card title={formatBytes(preview.totalBytes)} description="流量限额" /><Card title={preview.limitIp || "不限"} description="在线IP数量" /><Card title={preview.expiresAt ? formatDate(preview.expiresAt) : "不限"} description="到期日" /><Card title={preview.resetsTraffic ? "自购买起每 30 天" : "不重置"} description="流量重置" /></div></Card> : selectedClient ? <Card title={selectedClient.email} description={`关联后邮箱设为 ${user.email} · 3x-ui 原额度 ${selectedClient.totalBytes ? formatBytes(selectedClient.totalBytes) : "不限"}，将按 App 当前套餐额度 ${preview.totalBytes ? formatBytes(preview.totalBytes) : "不限流量"} 覆盖 · 在线IP数量 ${selectedClient.limitIp || "不限"} · ${selectedClient.expiryTime ? formatDate(new Date(selectedClient.expiryTime).toISOString()) : "永不过期"}`} /> : null}
        <Alert title="确认后旧订阅池停止交付；3x-ui 原生额度改为不限，由后台按节点倍率计费、停用，并自购买起每 30 天重置。" />
        {error ? <Alert tone="danger" title={error} /> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={saving}>取消</Button></DialogClose><ActionButton type="submit" disabled={saving || !user.v2ProductSnapshot?.lineGroupId || (mode === "link" && !selectedClient)} label="确认切换" pendingLabel="处理中..." pending={saving} /></div>
      </form></DialogContent>
  </Dialog>
}
