import * as React from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { CatalogPlanFields, catalogPlanConfig, catalogPlanHasTiers, catalogPlanOptions, useCatalogV2Products } from "@/components/features/catalog-plan-fields"
import { DatePicker } from "@/components/features/date-picker"
import type { User } from "@/types"
import { formatDate, toDateInputValue } from "@/utils"

// New users are self-hosted and bound to a V2 plan spec; editing only changes identity fields.
export type UserFormValues = {
  userId?: string
  wechatName?: string
  email?: string
  imessage?: string
  optionId?: string
  trafficTier?: string
  purchasedAt?: string
  actualPaid?: number
}

const createSteps = ["基本信息", "套餐信息"]
const editSteps = ["基本信息"]

function toFormValues(user: User | null): UserFormValues {
  if (!user) return { trafficTier: "1", purchasedAt: toDateInputValue() }
  return {
    userId: user.userId || "",
    wechatName: user.wechatName || "",
    email: user.email || "",
    imessage: user.imessage || "",
  }
}

function expiryDate(purchasedAt: string | undefined, durationDays: number) {
  const date = purchasedAt ? new Date(`${purchasedAt}T00:00:00.000Z`) : null
  if (!date || Number.isNaN(date.getTime())) return ""
  date.setUTCDate(date.getUTCDate() + durationDays)
  return toDateInputValue(date)
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
  const [stepIndex, setStepIndex] = React.useState(0)
  const [errors, setErrors] = React.useState<Partial<Record<keyof UserFormValues, string>>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const initialValues = React.useRef(toFormValues(user))
  const products = useCatalogV2Products()
  const planOptions = React.useMemo(() => catalogPlanOptions(products || []), [products])
  const steps = user ? editSteps : createSteps
  const lastStep = stepIndex === steps.length - 1
  const changed = React.useMemo(() => JSON.stringify(values) !== JSON.stringify(initialValues.current), [values])

  const selectedOption = planOptions.find(option => option.value === values.optionId)
  const planConfig = selectedOption ? catalogPlanConfig(selectedOption) : null
  const trafficTier = catalogPlanHasTiers(planConfig) ? Number(values.trafficTier) || 1 : 1
  // Traffic customization is charged per 30 days of the period, matching commerce/catalog-v2.js.
  const price = planConfig ? (planConfig.priceCents + Math.round((trafficTier - 1) * planConfig.stepPriceCents * (selectedOption?.period?.durationDays || 0) / 30)) / 100 : undefined
  const expiresAt = !planConfig ? "" : planConfig.lifetime ? "永久有效" : formatDate(expiryDate(values.purchasedAt, selectedOption?.period?.durationDays || 0))

  React.useEffect(() => {
    if (!open) return
    const nextValues = toFormValues(user)
    initialValues.current = nextValues
    setValues(nextValues)
    setStepIndex(0)
    setErrors({})
  }, [open, user])

  // Keep the chosen traffic tier within the selected spec's range.
  React.useEffect(() => {
    if (!planConfig || !catalogPlanHasTiers(planConfig)) return
    const tier = Math.min(planConfig.maxTier, Math.max(1, Number(values.trafficTier) || 1))
    if (String(tier) !== values.trafficTier) setValues(current => ({ ...current, trafficTier: String(tier) }))
  }, [planConfig, values.trafficTier])

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }

  function validateStep(index: number) {
    const nextErrors: Partial<Record<keyof UserFormValues, string>> = {}
    if (index === 0) {
      if (!values.userId?.trim()) nextErrors.userId = "请填写用户 ID"
      if (!user && !/^\S+@\S+\.\S+$/.test(values.email || "")) nextErrors.email = "请填写有效邮箱，用于创建 3x-ui 客户端"
    }
    if (index === 1) {
      if (!values.optionId) nextErrors.optionId = "请选择 V2 商品规格"
      if (!values.purchasedAt) nextErrors.purchasedAt = "请选择购买日期"
      if (values.actualPaid !== undefined && (!Number.isFinite(values.actualPaid) || values.actualPaid < 0)) nextErrors.actualPaid = "请填写正确的消费金额"
    }
    setErrors(current => ({ ...current, ...nextErrors }))
    return Object.keys(nextErrors).length === 0
  }

  function nextStep() {
    if (validateStep(stepIndex)) setStepIndex(current => current + 1)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lastStep) {
      nextStep()
      return
    }
    if (!validateStep(stepIndex)) return
    setSubmitting(true)
    try {
      await onSubmit(user ? values : { ...values, trafficTier: String(trafficTier), actualPaid: values.actualPaid ?? price })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex min-w-0 max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 bg-card px-6 pt-6 text-left text-card-foreground">
          <DialogTitle>{user ? "编辑用户" : "新增用户"}</DialogTitle>
          <DialogDescription className={steps.length > 1 ? "sr-only" : undefined}>{user ? "修改用户的基本信息；套餐请在用户详情中通过更改套餐调整。" : "创建自研线路用户并绑定 V2 商品规格"}</DialogDescription>
          {steps.length > 1 ? (
            <FieldGroup className="gap-2 pt-2">
              <FieldDescription>步骤 {stepIndex + 1} / {steps.length} · {steps[stepIndex]}</FieldDescription>
              <Progress value={((stepIndex + 1) / steps.length) * 100} />
            </FieldGroup>
          ) : null}
        </DialogHeader>

        <form className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden" onSubmit={submit} noValidate>
          <FieldGroup className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6">
            {stepIndex === 0 ? (
              <FieldGroup className="grid-cols-1 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.userId) || undefined}><FieldLabel htmlFor="userId">用户 ID</FieldLabel><Input id="userId" required aria-invalid={Boolean(errors.userId)} value={values.userId || ""} onChange={event => update("userId", event.target.value)} /><FieldError>{errors.userId}</FieldError></Field>
                <Field><FieldLabel htmlFor="wechatName">微信名</FieldLabel><Input id="wechatName" value={values.wechatName || ""} onChange={event => update("wechatName", event.target.value)} /></Field>
                <Field data-invalid={Boolean(errors.email) || undefined}><FieldLabel htmlFor="email">邮箱</FieldLabel><Input id="email" type="email" required={!user} aria-invalid={Boolean(errors.email)} value={values.email || ""} onChange={event => update("email", event.target.value)} /><FieldError>{errors.email}</FieldError></Field>
                <Field><FieldLabel htmlFor="imessage">iMessage</FieldLabel><Input id="imessage" value={values.imessage || ""} onChange={event => update("imessage", event.target.value)} /></Field>
              </FieldGroup>
            ) : (
              <>
                <CatalogPlanFields
                  idPrefix="user-plan"
                  label="V2 商品规格"
                  placeholder={products === null ? "正在加载商品规格..." : planOptions.length ? "请选择商品规格" : "没有可用的商品规格"}
                  options={planOptions}
                  value={values.optionId || ""}
                  onValueChange={value => update("optionId", value)}
                  trafficTier={values.trafficTier || "1"}
                  onTrafficTierChange={value => update("trafficTier", value)}
                  disabled={submitting}
                  description="包含未上架商品；用户会使用该商品的线路权限组，按自研线路创建 3x-ui 客户端。"
                  error={errors.optionId}
                />
                <FieldGroup className="grid-cols-1 sm:grid-cols-2">
                  <Field data-invalid={Boolean(errors.purchasedAt) || undefined}><FieldLabel htmlFor="purchasedAt">购买日期</FieldLabel><DatePicker id="purchasedAt" value={values.purchasedAt} onChange={value => update("purchasedAt", value)} /><FieldError>{errors.purchasedAt}</FieldError></Field>
                  <Field><FieldLabel htmlFor="expiresAt">到期日</FieldLabel><Input id="expiresAt" value={expiresAt} placeholder="选择商品规格后自动计算" readOnly /></Field>
                </FieldGroup>
                <Field data-invalid={Boolean(errors.actualPaid) || undefined}><FieldLabel htmlFor="actualPaid">本次消费金额</FieldLabel><Input id="actualPaid" type="number" min="0" step="0.01" value={values.actualPaid ?? price ?? ""} aria-invalid={Boolean(errors.actualPaid)} onChange={event => update("actualPaid", event.target.value === "" ? undefined : Number(event.target.value))} /><FieldDescription>默认按商品规格和流量档位的售价填写，可按实际收款修改。</FieldDescription><FieldError>{errors.actualPaid}</FieldError></Field>
              </>
            )}
          </FieldGroup>

          <DialogFooter className="shrink-0 flex-row items-center justify-between border-t bg-card px-6 py-4 text-card-foreground sm:justify-between">
            <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
            <div className="flex gap-2">
              {stepIndex > 0 ? <Button type="button" variant="outline" onClick={() => setStepIndex(current => current - 1)}>上一步</Button> : null}
              {/* Distinct keys: reusing one element would turn the clicked "下一步" into a submit button mid-click. */}
              {!lastStep ? <Button key="next" type="button" onClick={nextStep}>下一步</Button> : <Button key="submit" type="submit" disabled={submitting || Boolean(user && !changed)}>{submitting ? <Loader2 className="animate-spin" /> : null}{submitting ? "保存中..." : user ? "保存修改" : "创建用户"}</Button>}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
