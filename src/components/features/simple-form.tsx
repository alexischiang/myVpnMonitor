import * as React from "react"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type FieldVisibility = { visibleWhen?: { field: string; equals: string | number | boolean } }

export type Field = (
  | { name: string; label: string; type?: "text" | "email" | "number" | "date" | "password" | "url"; placeholder?: string; required?: boolean; className?: string }
  | { name: string; label: string; type: "textarea"; placeholder?: string; required?: boolean; rows?: number; className?: string; controlClassName?: string }
  | { name: string; label: string; type: "select"; placeholder?: string; required?: boolean; options: Array<{ value: string; label: string }>; allowCustom?: boolean; customLabel?: string; customPlaceholder?: string; className?: string }
  | { name: string; label: string; type: "checkbox"; description?: string; className?: string }
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
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-hidden", contentClassName)}>
        <form className="grid max-h-[calc(100dvh-5rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-5" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FieldGroup className="grid min-h-0 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            {fields.filter(field => !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.equals).map(field => {
              const value = values[field.name]
              return (
                <Field
                  key={field.name}
                  orientation={field.type === "checkbox" ? "horizontal" : "vertical"}
                  className={cn(field.type === "textarea" && "sm:col-span-2", field.type === "checkbox" && "cursor-pointer", field.className)}
                  onClick={field.type === "checkbox" ? event => {
                    const target = event.target
                    if (!(target instanceof HTMLButtonElement) && !(target instanceof HTMLInputElement) && !(target instanceof HTMLLabelElement)) {
                      update(field.name, !Boolean(value))
                    }
                  } : undefined}
                >
                  {field.type === "checkbox" ? (
                    <>
                      <Checkbox
                        id={field.name}
                        name={field.name}
                        className="mt-0.5"
                        checked={Boolean(value)}
                        onCheckedChange={checked => update(field.name, checked === true)}
                      />
                      <FieldContent className="gap-1">
                        <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
                      </FieldContent>
                    </>
                  ) : (
                    <>
                      <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                      {field.type === "textarea" ? (
                        <Textarea
                          id={field.name}
                          name={field.name}
                          className={field.controlClassName}
                          required={field.required}
                          aria-invalid={Boolean(errors[field.name])}
                          rows={field.rows || 4}
                          placeholder={field.placeholder}
                          value={String(value || "")}
                          onChange={event => update(field.name, event.target.value)}
                        />
                      ) : field.type === "select" ? (
                        <>
                          <Select
                            value={customFields.has(field.name) ? "__custom__" : String(value || "")}
                            onValueChange={next => {
                              setCustomFields(current => {
                                const updated = new Set(current)
                                if (next === "__custom__") updated.add(field.name)
                                else updated.delete(field.name)
                                return updated
                              })
                              update(field.name, next === "__custom__" ? "" : next)
                            }}
                            required={field.required}
                          >
                            <SelectTrigger id={field.name} className="w-full" aria-invalid={Boolean(errors[field.name])}>
                              <SelectValue placeholder={field.placeholder || "请选择"} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                              {field.allowCustom ? <SelectItem value="__custom__">{field.customLabel || "新增选项"}</SelectItem> : null}
                            </SelectContent>
                          </Select>
                          {customFields.has(field.name) ? (
                            <Input
                              id={`${field.name}-custom`}
                              name={field.name}
                              required={field.required}
                              aria-invalid={Boolean(errors[field.name])}
                              placeholder={field.customPlaceholder || "输入新选项"}
                              value={String(value || "")}
                              onChange={event => update(field.name, event.target.value)}
                            />
                          ) : null}
                        </>
                      ) : (
                        <Input
                          id={field.name}
                          name={field.name}
                          required={field.required}
                          aria-invalid={Boolean(errors[field.name])}
                          type={field.type || "text"}
                          placeholder={field.placeholder}
                          value={String(value || "")}
                          onChange={event => update(field.name, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
                        />
                      )}
                      <FieldError>{errors[field.name]}</FieldError>
                    </>
                  )}
                </Field>
              )
            })}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {submitting ? "保存中..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
