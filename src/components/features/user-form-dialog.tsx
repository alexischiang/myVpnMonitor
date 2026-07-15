import * as React from "react"
import { CalendarIcon, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldControl,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Subscription, User } from "@/types"

export type UserFormValues = {
  userId?: string
  wechatName?: string
  email?: string
  imessage?: string
  subscriptionId?: string
  activeGroup?: string
  vipLevel?: string
  duration?: string
  purchasedAt?: string
  expiresAt?: string
  actualPaid?: number
  note?: string
}

const defaultValues: UserFormValues = {
  activeGroup: "pro",
  vipLevel: "vip1",
  duration: "monthly",
  purchasedAt: new Date().toISOString().slice(0, 10),
}

const planOptions = ["basic", "pro", "ultra"].map(value => ({
  value,
  label: value.toUpperCase(),
}))

const vipOptions = ["vip1", "vip2", "vip3"].map(value => ({
  value,
  label: value.toUpperCase(),
}))

const durationOptions = [
  { value: "monthly", label: "monthly" },
  { value: "quarterly", label: "quarterly" },
  { value: "half_yearly", label: "half_yearly" },
  { value: "yearly", label: "yearly" },
  { value: "lifetime", label: "lifetime" },
  { value: "custom", label: "custom" },
]

const steps = [
  { title: "客户信息" },
  { title: "套餐与订阅" },
  { title: "日期与金额" },
  { title: "备注" },
]

function toInputDate(value?: string) {
  return value ? value.slice(0, 10) : ""
}

function parseDateValue(value?: string) {
  if (!value) {
    return undefined
  }

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) {
    return undefined
  }

  return new Date(year, month - 1, day)
}

function formatDateValue(date?: Date) {
  if (!date) {
    return ""
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function displayDateValue(value?: string) {
  const date = parseDateValue(value)

  return date ? date.toLocaleDateString("zh-CN") : "选择日期"
}

function toFormValues(user: User | null): UserFormValues {
  if (!user) {
    return defaultValues
  }

  return {
    userId: user.userId || "",
    wechatName: user.wechatName || "",
    email: user.email || "",
    imessage: user.imessage || "",
    subscriptionId: user.subscriptionId || "",
    activeGroup: user.activeGroup || defaultValues.activeGroup,
    vipLevel: user.vipLevel || defaultValues.vipLevel,
    duration: user.duration || defaultValues.duration,
    purchasedAt: toInputDate(user.purchasedAt),
    expiresAt: toInputDate(user.expiresAt),
    actualPaid: user.actualPaid,
    note: user.note || "",
  }
}

function subscriptionLabel(item: Subscription) {
  const provider = item.serviceProvider || item.provider || "Provider"
  const account = item.email || item.url.slice(-8)

  return `${provider} - ${account}`
}

function DatePicker({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = parseDateValue(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {displayDateValue(value)}
          <CalendarIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={date => {
            onChange(formatDateValue(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function UserFormDialog({
  open,
  user,
  subscriptions,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  user: User | null
  subscriptions: Subscription[]
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserFormValues) => Promise<void> | void
}) {
  const [values, setValues] = React.useState<UserFormValues>(() => toFormValues(user))
  const [stepIndex, setStepIndex] = React.useState(0)
  const [errors, setErrors] = React.useState<Partial<Record<keyof UserFormValues, string>>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const purchaseManaged = user?.accountStatus === "active"

  React.useEffect(() => {
    if (open) {
      setValues(toFormValues(user))
      setStepIndex(0)
      setErrors({})
    }
  }, [open, user])

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }

  function validateStep(index: number) {
    const nextErrors: Partial<Record<keyof UserFormValues, string>> = {}

    if (index === 0 && !values.userId?.trim()) {
      nextErrors.userId = "请填写用户 ID"
    }

    if (index === 1 && !values.subscriptionId) {
      nextErrors.subscriptionId = "请选择订阅池"
    }

    setErrors(current => ({ ...current, ...nextErrors }))

    return Object.keys(nextErrors).length === 0
  }

  function firstInvalidStep() {
    for (let index = 0; index < steps.length; index += 1) {
      if (!validateStep(index)) {
        return index
      }
    }

    return -1
  }

  function nextStep() {
    if (!validateStep(stepIndex)) {
      return
    }

    setStepIndex(current => Math.min(current + 1, steps.length - 1))
  }

  function previousStep() {
    setStepIndex(current => Math.max(current - 1, 0))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalidStep = firstInvalidStep()
    if (invalidStep >= 0) {
      setStepIndex(invalidStep)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const currentStep = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1
  const progressValue = ((stepIndex + 1) / steps.length) * 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>{user ? "编辑用户" : "新增用户"}</DialogTitle>
          <DialogDescription>
            填写客户资料、绑定订阅池并记录购买信息。
          </DialogDescription>
          <div className="grid gap-2 pt-2">
            <div className="text-sm text-muted-foreground">
              步骤 {stepIndex + 1} / {steps.length} · {currentStep.title}
            </div>
            <Progress value={progressValue} />
          </div>
        </DialogHeader>

        <form id="user-form" className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <FieldGroup>
              {stepIndex === 0 && (
                <>
                  <FieldSeparator>客户信息</FieldSeparator>
                  <Field>
                    <FieldLabel htmlFor="userId">用户 ID</FieldLabel>
                    <FieldControl>
                      <Input
                        id="userId"
                        required
                        aria-invalid={Boolean(errors.userId)}
                        value={values.userId || ""}
                        onChange={event => update("userId", event.target.value)}
                      />
                    </FieldControl>
                    <FieldError>{errors.userId}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="wechatName">微信名</FieldLabel>
                    <FieldControl>
                      <Input
                        id="wechatName"
                        value={values.wechatName || ""}
                        onChange={event => update("wechatName", event.target.value)}
                      />
                    </FieldControl>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="email">邮箱</FieldLabel>
                    <FieldControl>
                      <Input
                        id="email"
                        type="email"
                        value={values.email || ""}
                        onChange={event => update("email", event.target.value)}
                      />
                    </FieldControl>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="imessage">iMessage</FieldLabel>
                    <FieldControl>
                      <Input
                        id="imessage"
                        value={values.imessage || ""}
                        onChange={event => update("imessage", event.target.value)}
                      />
                    </FieldControl>
                  </Field>
                </>
              )}

              {stepIndex === 1 && (
                <>
                  <FieldSeparator>套餐与订阅</FieldSeparator>
                  <Field>
                    <FieldLabel htmlFor="subscriptionId">绑定订阅池</FieldLabel>
                    <Select
                      required
                      value={values.subscriptionId || ""}
                      onValueChange={value => update("subscriptionId", value)}
                    >
                      <FieldControl>
                        <SelectTrigger
                          id="subscriptionId"
                          className="w-full"
                          aria-invalid={Boolean(errors.subscriptionId)}
                        >
                          <SelectValue placeholder="请选择订阅池" />
                        </SelectTrigger>
                      </FieldControl>
                      <SelectContent>
                        {subscriptions.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {subscriptionLabel(item)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{errors.subscriptionId}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="activeGroup">套餐</FieldLabel>
                    <Select
                      value={values.activeGroup || ""}
                      onValueChange={value => update("activeGroup", value)}
                    >
                      <FieldControl>
                        <SelectTrigger id="activeGroup" className="w-full">
                          <SelectValue placeholder="请选择套餐" />
                        </SelectTrigger>
                      </FieldControl>
                      <SelectContent>
                        {planOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="vipLevel">VIP</FieldLabel>
                    <Select
                      value={values.vipLevel || ""}
                      onValueChange={value => update("vipLevel", value)}
                    >
                      <FieldControl>
                        <SelectTrigger id="vipLevel" className="w-full">
                          <SelectValue placeholder="请选择 VIP" />
                        </SelectTrigger>
                      </FieldControl>
                      <SelectContent>
                        {vipOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="duration">周期</FieldLabel>
                    <Select
                      value={values.duration || ""}
                      onValueChange={value => update("duration", value)}
                      disabled={purchaseManaged}
                    >
                      <FieldControl>
                        <SelectTrigger id="duration" className="w-full">
                          <SelectValue placeholder="请选择周期" />
                        </SelectTrigger>
                      </FieldControl>
                      <SelectContent>
                        {durationOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              {stepIndex === 2 && (
                <>
                  <FieldSeparator>日期与金额</FieldSeparator>
                  <Field>
                    <FieldLabel htmlFor="purchasedAt">购买日期</FieldLabel>
                    <FieldControl>
                      <DatePicker
                        id="purchasedAt"
                        value={values.purchasedAt || ""}
                        onChange={value => update("purchasedAt", value)}
                        disabled={purchaseManaged}
                      />
                    </FieldControl>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="expiresAt">到期日期</FieldLabel>
                    <FieldControl>
                      <DatePicker
                        id="expiresAt"
                        value={values.expiresAt || ""}
                        onChange={value => update("expiresAt", value)}
                        disabled={purchaseManaged}
                      />
                    </FieldControl>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="actualPaid">实付金额</FieldLabel>
                    <FieldControl>
                      <Input
                        id="actualPaid"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={purchaseManaged}
                        value={values.actualPaid ?? ""}
                        onChange={event => update(
                          "actualPaid",
                          event.target.value === "" ? undefined : Number(event.target.value)
                        )}
                      />
                    </FieldControl>
                  </Field>
                </>
              )}

              {stepIndex === 3 && (
                <>
                  <FieldSeparator>备注</FieldSeparator>
                  <Field>
                    <FieldLabel htmlFor="note">备注</FieldLabel>
                    <FieldControl>
                      <Textarea
                        id="note"
                        rows={4}
                        value={values.note || ""}
                        onChange={event => update("note", event.target.value)}
                      />
                    </FieldControl>
                  </Field>
                </>
              )}
            </FieldGroup>
          </div>

          <DialogFooter className="shrink-0 border-t bg-muted/40 px-6 py-4 sm:justify-between">
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </DialogClose>
              {stepIndex > 0 && (
                <Button type="button" variant="outline" onClick={previousStep}>
                  上一步
                </Button>
              )}
            </div>
            {isLastStep ? (
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? "保存中..." : "保存"}
              </Button>
            ) : (
              <Button type="button" onClick={nextStep}>
                下一步
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
