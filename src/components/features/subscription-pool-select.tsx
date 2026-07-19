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
  group,
  placeholder = "请选择订阅池",
  disabled,
  description,
  error,
}: SubscriptionPoolSelectProps) {
  const pools = React.useMemo(() => subscriptions
    .filter(item => Boolean(item.url) && Date.parse(item.metrics?.expireAt || "") > Date.now() && (allowDisabled || item.enabled !== false) && (!item.allowedGroups || !group || item.allowedGroups.includes(group)))
    .sort((left, right) => (Date.parse(right.metrics?.expireAt || "") || 0) - (Date.parse(left.metrics?.expireAt || "") || 0)), [subscriptions, allowDisabled, group])

  function setAllowDisabled(next: boolean) {
    onAllowDisabledChange(next)
    if (!next && subscriptions.find(item => item.id === value)?.enabled === false) onValueChange("")
  }

  return (
    <Field className="min-w-0">
      {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-3rem)]">
          {pools.map(item => <SelectItem className="whitespace-normal break-all" key={item.id} value={item.id}>{item.serviceProvider || item.provider || "Provider"} - {item.email || item.url} · 到期 {formatDate(item.metrics?.expireAt)}{item.enabled === false ? " · 未启用" : ""}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Checkbox id={`${id}-allow-disabled`} checked={allowDisabled} onCheckedChange={checked => setAllowDisabled(checked === true)} disabled={disabled} />
        <Label htmlFor={`${id}-allow-disabled`}>使用未启用池</Label>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  )
}
