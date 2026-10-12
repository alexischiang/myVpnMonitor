import * as React from "react"

import { Loader2 } from "lucide-react"

import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { DatePicker } from "@/components/features/date-picker"
import { cn } from "@/lib/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Switch } from "@/components/arc/switch/switch"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"

type FieldVisibility = { visibleWhen?: { field: string; equals: string | number | boolean } }

export type Field = (
  | { name: string; label: string; type?: "text" | "email" | "number" | "date" | "password" | "url"; placeholder?: string; required?: boolean; className?: string }
  | { name: string; label: string; type: "textarea"; placeholder?: string; required?: boolean; rows?: number; className?: string; controlClassName?: string }
  | { name: string; label: string; type: "select"; placeholder?: string; required?: boolean; options: Array<{ value: string; label: string }>; allowCustom?: boolean; customLabel?: string; customPlaceholder?: string; className?: string }
  | { name: string; label: string; type: "checkbox" | "switch"; description?: string; className?: string }
  ) & FieldVisibility

export type FormValues = Record<string, string | number | boolean | undefined>

export function SimpleFormDialog({
  open,
  title,
  description,
  fields,
  initialValues = {},
  submitLabel = "保存",
  contentClassName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  description?: string
  fields: Field[]
  initialValues?: FormValues
  submitLabel?: string
  contentClassName?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (values: FormValues) => Promise<void> | void
}) {
  const [values, setValues] = React.useState<FormValues>(initialValues)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [customFields, setCustomFields] = React.useState<Set<string>>(new Set())
  const wasOpen = React.useRef(false)

  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setValues(initialValues)
      setErrors({})
      setCustomFields(new Set(fields.flatMap(field =>
        field.type === "select" && field.allowCustom && initialValues[field.name] && !field.options.some(option => option.value === initialValues[field.name])
          ? [field.name]
          : []
      )))
    }
    wasOpen.current = open
  }, [fields, initialValues, open])

  function update(name: string, value: FormValues[string]) {
    setValues(current => ({ ...current, [name]: value }))
    setErrors(current => ({ ...current, [name]: "" }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const visibleFields = fields.filter(field => !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.equals)
    for (const field of visibleFields) {
      const value = String(values[field.name] ?? "").trim()
      const control = event.currentTarget.elements.namedItem(field.name)
      if (field.required && !value) nextErrors[field.name] = `请输入${field.label}。`
      else if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && !control.validity.valid) nextErrors[field.name] = control.validationMessage
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} className={cn("max-h-[calc(100dvh-2rem)] overflow-hidden", contentClassName)}><form className="grid max-h-[calc(100dvh-5rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-5" onSubmit={submit} noValidate>
          <FieldGroup className="grid min-h-0 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            {fields.filter(field => !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.equals).map(field => {
              const value = values[field.name]
              return (
                <Field
                  key={field.name}
                  orientation={field.type === "checkbox" || field.type === "switch" ? "horizontal" : "vertical"}
                  className={cn(field.type === "textarea" && "sm:col-span-2", (field.type === "checkbox" || field.type === "switch") && "cursor-pointer", field.className)}
                  onClick={field.type === "checkbox" || field.type === "switch" ? event => {
                    const target = event.target
                    if (!(target instanceof HTMLButtonElement) && !(target instanceof HTMLInputElement) && !(target instanceof HTMLLabelElement)) {
                      update(field.name, !Boolean(value))
                    }
                  } : undefined}
                >
                  {field.type === "checkbox" || field.type === "switch" ? (
                    <>
                      {field.type === "switch" ? (
                        <Switch id={field.name} name={field.name} checked={Boolean(value)} onCheckedChange={checked => update(field.name, checked)} />
                      ) : (
                        <Checkbox id={field.name} name={field.name} className="mt-0.5" checked={Boolean(value)} onCheckedChange={checked => update(field.name, checked === true)} />
                      )}
                      <FieldContent className="gap-1">
                        <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
                      </FieldContent>
                    </>
                  ) : (
                    <>
                      <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                      {field.type === "date" ? (
                        <DatePicker
                          id={field.name}
                          label={field.label}
                          value={String(value || "")}
                          invalid={Boolean(errors[field.name])}
                          onChange={value => update(field.name, value)}
                        />
                      ) : field.type === "textarea" ? (
                        <Textarea label={field.label} hideLabel id={field.name} name={field.name} className={field.controlClassName} required={field.required} aria-invalid={Boolean(errors[field.name])} rows={field.rows || 4} placeholder={field.placeholder} value={String(value || "")} onChange={event => update(field.name, event.target.value)} />
                      ) : field.type === "select" ? (
                        <>
                          <Select label={field.placeholder || "请选择"} hideLabel value={customFields.has(field.name) ? "__custom__" : String(value || "")} onValueChange={next => {
                              setCustomFields(current => {
                                const updated = new Set(current)
                                if (next === "__custom__") updated.add(field.name)
                                else updated.delete(field.name)
                                return updated
                              })
                              update(field.name, next === "__custom__" ? "" : next)
                            }} required={field.required} id={field.name} className="w-full" aria-invalid={Boolean(errors[field.name])} placeholder={field.placeholder || "请选择"} options={[...field.options.map(option => ({ value: option.value, label: option.label })), ...(field.allowCustom ? [{ value: "__custom__", label: field.customLabel || "新增选项" }] : [])]} />
                          {customFields.has(field.name) ? (
                            <Input label={field.customPlaceholder || "输入新选项"} hideLabel id={`${field.name}-custom`} name={field.name} required={field.required} aria-invalid={Boolean(errors[field.name])} placeholder={field.customPlaceholder || "输入新选项"} value={String(value || "")} onChange={event => update(field.name, event.target.value)} />
                          ) : null}
                        </>
                      ) : (
                        <Input label={field.label} hideLabel id={field.name} name={field.name} required={field.required} aria-invalid={Boolean(errors[field.name])} type={field.type || "text"} placeholder={"placeholder" in field ? field.placeholder : undefined} value={String(value || "")} onChange={event => update(field.name, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} />
                      )}
                      <FieldError>{errors[field.name]}</FieldError>
                    </>
                  )}
                </Field>
              )
            })}
          </FieldGroup>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <ActionButton type="submit" label={submitLabel} pendingLabel="保存中..." pending={submitting} />
          </div>
        </form></DialogContent>
    </Dialog>
  )
}
