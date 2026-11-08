import * as React from "react"
import { Save, Undo2 } from "lucide-react"

import { fetchJson, putJson } from "@/api"
import { toast } from "@/components/features/toast"
import { InfoList } from "@/components/features/shared"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { Skeleton } from "@/components/arc/skeleton/skeleton"

// One user's node-hub speed limit, opened from the user details page. The user's own value wins;
// without one the stricter of the plan's limit and the permission group's limit applies.

type SpeedLimitView = { userId: string; override: number | null; plan: number; group: number; groupName: string; effective: number }

function speedLabel(mbps: number) {
  return mbps ? `${mbps} Mbps` : "不限速"
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function UserNodeSpeedLimitDialog({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [view, setView] = React.useState<SpeedLimitView | null>(null)
  const [loadError, setLoadError] = React.useState("")
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let current = true
    setView(null)
    setLoadError("")
    setError("")
    fetchJson<SpeedLimitView>(`/api/users/${encodeURIComponent(userId)}/node-speed-limit`)
      .then(result => { if (current) { setView(result); setValue(result.override === null ? "" : String(result.override)) } })
      .catch(loadFailure => { if (current) setLoadError(errorMessage(loadFailure, "读取限速失败")) })
    return () => { current = false }
  }, [open, userId])

  async function save(clear = false) {
    const raw = clear ? "" : value.trim()
    const next = raw === "" ? null : Number(raw)
    if (next !== null && (!Number.isSafeInteger(next) || next < 0 || next > 100000)) {
      setError("请输入 0-100000 的整数，0 表示不限速。")
      return
    }
    setSaving(true)
    try {
      const result = await putJson<SpeedLimitView>(`/api/users/${encodeURIComponent(userId)}/node-speed-limit`, { speedLimitMbps: next })
      setView(result)
      onOpenChange(false)
      toast({ type: "success", title: result.override === null ? "已恢复默认限速" : "限速已保存", description: `当前生效 ${speedLabel(result.effective)}` })
    } catch (saveError) {
      setError(errorMessage(saveError, "保存限速失败"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent title="设置节点限速" description="单独限速优先于套餐和权限组的限速，按节点生效。">
        {loadError ? <Alert tone="danger" title={loadError} /> : !view ? <Skeleton lines={3} /> : <>
          <InfoList items={[
            { label: "套餐限速", value: <span className="tabular-nums">{speedLabel(view.plan)}</span> },
            { label: view.groupName ? `权限组「${view.groupName}」` : "权限组限速", value: <span className="tabular-nums">{view.groupName ? speedLabel(view.group) : "无权限组"}</span> },
            { label: "当前生效", value: <span className="font-medium tabular-nums">{speedLabel(view.effective)}</span> },
          ]} />
          <Input label="单独限速（Mbps）" id="user-speed-limit" type="number" inputMode="numeric" min={0} max={100000} step={1} value={value} onChange={event => { setValue(event.target.value); setError("") }} description="0 表示不限速；留空则使用套餐和权限组中更严格的限速。" error={error} disabled={saving} />
        </>}
        <div className="flex flex-wrap justify-end gap-2">
          {view?.override !== null && view?.override !== undefined ? <Button variant="secondary" className="mr-auto" onClick={() => void save(true)} disabled={saving}><Undo2 />恢复默认限速</Button> : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <ActionButton icon={<Save />} onClick={() => void save()} disabled={saving || !view} pending={saving} label="保存限速" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
