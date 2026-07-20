import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Subscription } from "@/types"
import { formatDate } from "@/utils"

type SubscriptionPoolSelectProps = {
  id: string
  label?: string
  subscriptions: Subscription[]
  value: string
  onValueChange: (value: string) => void
  allowDisabled: boolean
  onAllowDisabledChange: (value: boolean) => void
  allowFull: boolean
  onAllowFullChange: (value: boolean) => void
  group?: string
  placeholder?: string
  disabled?: boolean
  description?: React.ReactNode
  error?: React.ReactNode
}

export function SubscriptionPoolSelect({
  id,
  label,
  subscriptions,
  value,
  onValueChange,
  allowDisabled,
  onAllowDisabledChange,
  allowFull,
  onAllowFullChange,
  group,
  placeholder = "请选择订阅池",
  disabled,
  description,
  error,
}: SubscriptionPoolSelectProps) {
  const pools = React.useMemo(() => subscriptions
    .filter(item => Boolean(item.url) && Date.parse(item.metrics?.expireAt || "") > Date.now() && (allowDisabled || item.enabled !== false) && (allowFull || !subscriptionPoolIsFull(item)) && (!item.allowedGroups || !group || item.allowedGroups.includes(group)))
    .sort((left, right) => (Date.parse(right.metrics?.expireAt || "") || 0) - (Date.parse(left.metrics?.expireAt || "") || 0)), [subscriptions, allowDisabled, allowFull, group])

  function setAllowDisabled(next: boolean) {
    onAllowDisabledChange(next)
    if (!next && subscriptions.find(item => item.id === value)?.enabled === false) onValueChange("")
  }

  function setAllowFull(next: boolean) {
    onAllowFullChange(next)
    if (!next && subscriptionPoolIsFull(subscriptions.find(item => item.id === value))) onValueChange("")
  }

  function customerCountLabel(item: Subscription) {
    const current = Number(item.customerCount) || 0
    const maximum = Number(item.maxUsers)
    return Number.isSafeInteger(maximum) && maximum > 0 ? `${current}/${maximum} 人` : `${current} 人`
  }

  return (
    <Field className="min-w-0">
      {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-3rem)]">
          {pools.map(item => <SelectItem className="whitespace-normal break-all" key={item.id} value={item.id}>{item.serviceProvider || item.provider || "Provider"} - {item.email || item.url} · 当前人数 {customerCountLabel(item)} · 到期 {formatDate(item.metrics?.expireAt)}{item.enabled === false ? " · 未启用" : ""}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <div className="flex items-center gap-2"><Checkbox id={`${id}-allow-disabled`} checked={allowDisabled} onCheckedChange={checked => setAllowDisabled(checked === true)} disabled={disabled} /><Label htmlFor={`${id}-allow-disabled`}>使用未启用池</Label></div>
        <div className="flex items-center gap-2"><Checkbox id={`${id}-allow-full`} checked={allowFull} onCheckedChange={checked => setAllowFull(checked === true)} disabled={disabled} /><Label htmlFor={`${id}-allow-full`}>使用满人池</Label></div>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  )
}

function subscriptionPoolIsFull(item?: Subscription) {
  if (!item) return false
  const maximum = Number(item.maxUsers)
  return Number.isSafeInteger(maximum) && maximum > 0 && (Number(item.customerCount) || 0) >= maximum
}
