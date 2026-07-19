import * as React from "react"
import { CalendarIcon, Loader2 } from "lucide-react"

import { postJson } from "@/api"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SubscriptionPoolSelect } from "@/components/features/subscription-pool-select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PricingRow, Subscription, User } from "@/types"
import { durationLabels, formatDate, toDateInputValue } from "@/utils"

export type UserFormValues = {
  userId?: string
  wechatName?: string
  email?: string
  imessage?: string
  subscriptionId?: string
  allowDisabled?: boolean
  activeGroup?: string
  unlimited?: boolean
  duration?: string
  purchasedAt?: string
  expiresAt?: string
  actualPaid?: number
  note?: string
}

type Recommendation = {
  subscription: Subscription | null
  reason?: string
  expiresAt: string
}

const planOptions = ["basic", "pro", "ultra"]
const durationOptions = ["monthly", "quarterly", "half_yearly", "yearly", "custom", "lifetime"]
const durationPriceKeys = {
  monthly: ["monthly", "unlimitedMonthly"],
  quarterly: ["quarterly", "unlimitedQuarterly"],
  half_yearly: ["half_yearly", "unlimitedHalfYearly"],
  yearly: ["yearly", "unlimitedYearly"],
} as const
const durationDescriptions: Record<string, string> = {
  monthly: "30 天",
  quarterly: "90 天",
  half_yearly: "180 天",
  yearly: "360 天",
  custom: "手动指定到期日",
  lifetime: "一次购买",
}
const steps = ["基本信息", "套餐信息", "推荐订阅池"]

function defaultFormValues(): UserFormValues {
  return {
    activeGroup: "pro",
    unlimited: false,
    duration: "monthly",
    purchasedAt: toDateInputValue(),
  }
}

function toInputDate(value?: string) {
  return value ? value.slice(0, 10) : ""
}

function parseDateValue(value?: string) {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  return year && month && day ? new Date(year, month - 1, day) : undefined
}

function formatDateValue(date?: Date) {
  if (!date) return ""
  return toDateInputValue(date)
}

function toFormValues(user: User | null): UserFormValues {
  const defaults = defaultFormValues()
  if (!user) return defaults

  return {
    userId: user.userId || "",
    wechatName: user.wechatName || "",
    email: user.email || "",
    imessage: user.imessage || "",
    subscriptionId: user.subscriptionId || "",
    activeGroup: user.activeGroup || defaults.activeGroup,
    unlimited: Boolean(user.unlimited),
    duration: durationOptions.includes(user.duration || "") ? user.duration : defaults.duration,
    purchasedAt: toInputDate(user.purchasedAt) || defaults.purchasedAt,
    expiresAt: toInputDate(user.expiresAt),
    actualPaid: user.actualPaid,
  }
}

function selectedPrice(pricing: PricingRow[], values: UserFormValues) {
  const row = pricing.find(item => item.group === values.activeGroup)
  const keys = durationPriceKeys[values.duration as keyof typeof durationPriceKeys]
  const value = row && keys ? row[values.unlimited ? keys[1] : keys[0]] : undefined
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function durationExpiryValue(values: UserFormValues, duration: string) {
  if (duration === "lifetime") return "永久"
  if (duration === "custom") return values.expiresAt || ""
  const days = { monthly: 30, quarterly: 90, half_yearly: 180, yearly: 360 }[duration]
  const purchasedAt = values.purchasedAt ? new Date(`${values.purchasedAt}T00:00:00.000Z`) : null
  if (!days || !purchasedAt || Number.isNaN(purchasedAt.getTime())) return ""
  purchasedAt.setUTCDate(purchasedAt.getUTCDate() + days)
  return toDateInputValue(purchasedAt)
}

function durationExpiryLabel(values: UserFormValues, duration: string) {
  const expiry = durationExpiryValue(values, duration)
  if (expiry === "永久") return "永久有效"
  return expiry ? `到期 ${formatDate(expiry)}` : duration === "custom" ? "请选择到期日" : "待选择购买日期"
}

function DatePicker({ id, value, onChange }: { id: string; value?: string; onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const selected = parseDateValue(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="w-full justify-between text-base font-normal md:text-sm">
          {selected ? selected.toLocaleDateString("zh-CN") : "选择日期"}
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
  pricing,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  user: User | null
  subscriptions: Subscription[]
  pricing: PricingRow[]
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserFormValues) => Promise<void> | void
}) {
  const [values, setValues] = React.useState<UserFormValues>(() => toFormValues(user))
  const [stepIndex, setStepIndex] = React.useState(0)
  const [errors, setErrors] = React.useState<Partial<Record<keyof UserFormValues, string>>>({})
  const [recommendationMessage, setRecommendationMessage] = React.useState("")
  const [allowDisabledPool, setAllowDisabledPool] = React.useState(false)
  const [recommending, setRecommending] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const price = selectedPrice(pricing, values)

  React.useEffect(() => {
    if (!open) return
    setValues(toFormValues(user))
    setStepIndex(0)
    setErrors({})
    setRecommendationMessage("")
    setAllowDisabledPool(false)
  }, [open, user])

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }

  function validateStep(index: number) {
    const nextErrors: Partial<Record<keyof UserFormValues, string>> = {}
    if (index === 0 && !values.userId?.trim()) nextErrors.userId = "请填写用户 ID"
    if (index === 1) {
      if (!values.purchasedAt) nextErrors.purchasedAt = "请选择购买日期"
      if (values.duration === "custom" && !values.expiresAt) nextErrors.expiresAt = "请选择到期日"
      if (price === undefined && values.actualPaid === undefined) nextErrors.actualPaid = "请填写本次消费金额"
    }
    if (index === 2 && !values.subscriptionId) nextErrors.subscriptionId = "请选择订阅池"
    setErrors(current => ({ ...current, ...nextErrors }))
    return Object.keys(nextErrors).length === 0
  }

  async function nextStep() {
    if (!validateStep(stepIndex)) return
    if (stepIndex === 0) {
      setStepIndex(1)
      return
    }
    setRecommending(true)
    setRecommendationMessage("")
    try {
      const recommendation = await postJson<Recommendation>("/api/subscriptions/recommend", {
        purchasedAt: values.purchasedAt,
        duration: values.duration,
        expiresAt: values.duration === "custom" ? values.expiresAt : undefined,
        ignoredUserId: user?.id,
      })
      setValues(current => ({
        ...current,
        actualPaid: current.actualPaid ?? price,
        expiresAt: toInputDate(recommendation.expiresAt),
        subscriptionId: recommendation.subscription?.id || current.subscriptionId,
      }))
      setRecommendationMessage(recommendation.subscription ? "已根据到期日推荐订阅池，可手动更换。" : recommendation.reason || "暂无推荐订阅池，请手动选择。")
      setStepIndex(2)
    } catch (error) {
      setRecommendationMessage(error instanceof Error ? error.message : "推荐失败，请手动选择订阅池。")
      setStepIndex(2)
    } finally {
      setRecommending(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validateStep(2)) return
    setSubmitting(true)
    try {
      await onSubmit({ ...values, allowDisabled: allowDisabledPool, actualPaid: values.actualPaid ?? price })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex min-w-0 max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 bg-[#f9f9f9] px-6 pt-6 text-left">
          <DialogTitle>{user ? "编辑用户" : "新增用户"}</DialogTitle>
          <DialogDescription className="sr-only">填写用户购买信息</DialogDescription>
          <FieldGroup className="gap-2 pt-2">
            <FieldDescription>步骤 {stepIndex + 1} / {steps.length} · {steps[stepIndex]}</FieldDescription>
            <Progress value={((stepIndex + 1) / steps.length) * 100} />
          </FieldGroup>
        </DialogHeader>

        <form className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden" onSubmit={submit} noValidate>
          <FieldGroup className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6">
            {stepIndex === 0 ? (
              <>
                <FieldGroup className="grid-cols-1 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="userId">用户 ID</FieldLabel><Input id="userId" required aria-invalid={Boolean(errors.userId)} value={values.userId || ""} onChange={event => update("userId", event.target.value)} /><FieldError>{errors.userId}</FieldError></Field>
                  <Field><FieldLabel htmlFor="wechatName">微信名</FieldLabel><Input id="wechatName" value={values.wechatName || ""} onChange={event => update("wechatName", event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="email">邮箱</FieldLabel><Input id="email" type="email" value={values.email || ""} onChange={event => update("email", event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="imessage">iMessage</FieldLabel><Input id="imessage" value={values.imessage || ""} onChange={event => update("imessage", event.target.value)} /></Field>
                </FieldGroup>
              </>
            ) : stepIndex === 1 ? (
              <>
                <FieldGroup className="grid-cols-1 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>套餐级别</FieldLabel>
                    <Tabs value={values.activeGroup} onValueChange={value => update("activeGroup", value)}>
                      <TabsList className="grid w-full grid-cols-3">
                        {planOptions.map(plan => <TabsTrigger key={plan} value={plan}>{plan.toUpperCase()}</TabsTrigger>)}
                      </TabsList>
                    </Tabs>
                  </Field>
                  <Field>
                    <FieldLabel>流量类型</FieldLabel>
                    <Tabs value={values.unlimited ? "unlimited" : "limited"} onValueChange={value => update("unlimited", value === "unlimited")}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="limited">固定流量</TabsTrigger>
                        <TabsTrigger value="unlimited">无限流量</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </Field>
                </FieldGroup>
                <FieldGroup className="grid-cols-1 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="purchasedAt">购买日期</FieldLabel><DatePicker id="purchasedAt" value={values.purchasedAt} onChange={value => update("purchasedAt", value)} /><FieldError>{errors.purchasedAt}</FieldError></Field>
                  <Field><FieldLabel htmlFor="expiresAt">到期日</FieldLabel>{values.duration === "custom" ? <DatePicker id="expiresAt" value={values.expiresAt} onChange={value => update("expiresAt", value)} /> : <Input id="expiresAt" value={durationExpiryValue(values, values.duration || "")} readOnly />}<FieldError>{errors.expiresAt}</FieldError></Field>
                </FieldGroup>
                <Field>
                  <FieldLabel>计费周期</FieldLabel>
                  <RadioGroup value={values.duration} onValueChange={value => update("duration", value)} className="grid w-full grid-cols-1 sm:grid-cols-2" aria-label="计费周期">
                    {durationOptions.map(duration => (
                      <FieldLabel key={duration} htmlFor={`duration-${duration}`} className="w-full cursor-pointer">
                        <Field orientation="horizontal" className="h-full w-full rounded-md border p-4 has-[[data-state=checked]]:border-primary">
                          <FieldContent className="flex-1">
                            <FieldTitle>{durationLabels[duration]}</FieldTitle>
                            <FieldDescription>{durationDescriptions[duration]} · {durationExpiryLabel(values, duration)}</FieldDescription>
                          </FieldContent>
                          <RadioGroupItem id={`duration-${duration}`} value={duration} />
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                </Field>
                <Field><FieldLabel htmlFor="actualPaid">本次消费金额</FieldLabel><Input id="actualPaid" type="number" min="0" step="0.01" value={values.actualPaid ?? price ?? ""} aria-invalid={Boolean(errors.actualPaid)} onChange={event => update("actualPaid", event.target.value === "" ? undefined : Number(event.target.value))} />{price === undefined ? <FieldDescription>自定义和永久周期请手动填写金额。</FieldDescription> : null}<FieldError>{errors.actualPaid}</FieldError></Field>
              </>
            ) : (
              <>
                <SubscriptionPoolSelect
                  id="subscriptionId"
                  label="订阅池 URL"
                  subscriptions={subscriptions}
                  value={values.subscriptionId || ""}
                  onValueChange={value => update("subscriptionId", value)}
                  allowDisabled={allowDisabledPool}
                  onAllowDisabledChange={setAllowDisabledPool}
                  group={values.activeGroup}
                  description={recommendationMessage}
                  error={errors.subscriptionId}
                />
              </>
            )}
          </FieldGroup>

          <DialogFooter className="shrink-0 flex-row items-center justify-between border-t bg-[#f9f9f9] px-6 py-4 sm:justify-between">
            <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
            <div className="flex gap-2">
              {stepIndex > 0 ? <Button type="button" variant="outline" onClick={() => setStepIndex(current => current - 1)}>上一步</Button> : null}
              {stepIndex < 2 ? <Button type="button" onClick={nextStep} disabled={recommending}>{recommending ? <Loader2 className="animate-spin" /> : null}{recommending ? "推荐中..." : "下一步"}</Button> : <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null}{submitting ? "保存中..." : user ? "保存修改" : "完成添加"}</Button>}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
