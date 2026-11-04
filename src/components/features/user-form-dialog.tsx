import * as React from "react"

import { FieldGroup } from "@/components/ui/field"
import type { User } from "@/types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"

// Creating a user creates the customer's account only; the plan is assigned afterwards through
// 人工收款 on the user's detail page. Editing changes identity fields only.
export type UserFormValues = {
  userId?: string
  wechatName?: string
  email?: string
  imessage?: string
}

function toFormValues(user: User | null): UserFormValues {
  if (!user) return { email: "", wechatName: "", imessage: "" }
  return {
    userId: user.userId || "",
    wechatName: user.wechatName || "",
    email: user.email || "",
    imessage: user.imessage || "",
  }
}

export function UserFormDialog({
  open,
  user,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  user: User | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserFormValues) => Promise<void> | void
}) {
  const [values, setValues] = React.useState<UserFormValues>(() => toFormValues(user))
  const [errors, setErrors] = React.useState<Partial<Record<keyof UserFormValues, string>>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const initialValues = React.useRef(toFormValues(user))
  const changed = React.useMemo(() => JSON.stringify(values) !== JSON.stringify(initialValues.current), [values])

  React.useEffect(() => {
    if (!open) return
    const nextValues = toFormValues(user)
    initialValues.current = nextValues
    setValues(nextValues)
    setErrors({})
  }, [open, user])

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }

  function validate() {
    const nextErrors: Partial<Record<keyof UserFormValues, string>> = {}
    if (user && !values.userId?.trim()) nextErrors.userId = "请填写用户 ID"
    if (!user && !/^\S+@\S+\.\S+$/.test(values.email || "")) nextErrors.email = "请填写有效邮箱，用户用它认领账户"
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={user ? "编辑用户" : "新增用户"} description={user ? "修改用户的基本信息；套餐请在用户详情中通过更改套餐调整。" : "创建客户账户，不分配套餐；之后在用户详情中通过人工收款分配套餐。"} size="lg" className="flex min-w-0 max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0">
        <form className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden" onSubmit={submit} noValidate>
          <FieldGroup className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6">
            <FieldGroup className="grid-cols-1 sm:grid-cols-2">
              {user ? <Input label="用户 ID" error={errors.userId || undefined} id="userId" required aria-invalid={Boolean(errors.userId)} value={values.userId || ""} onChange={event => update("userId", event.target.value)} /> : null}
              <Input label="邮箱" error={errors.email || undefined} id="email" type="email" required={!user} aria-invalid={Boolean(errors.email)} value={values.email || ""} onChange={event => update("email", event.target.value)} />
              <Input label="微信名" id="wechatName" value={values.wechatName || ""} onChange={event => update("wechatName", event.target.value)} />
              <Input label="iMessage" id="imessage" value={values.imessage || ""} onChange={event => update("imessage", event.target.value)} />
            </FieldGroup>
          </FieldGroup>

          <div className="mt-6 flex flex-wrap justify-end gap-2 shrink-0 flex-row items-center justify-between border-t bg-card text-card-foreground sm:justify-between">
            <DialogClose asChild><Button type="button" variant="secondary">取消</Button></DialogClose>
            <ActionButton type="submit" disabled={submitting || Boolean(user && !changed)} label={user ? "保存修改" : "创建用户"} pendingLabel="保存中..." pending={submitting} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
