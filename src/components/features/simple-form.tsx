import * as React from "react"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type Field =
  | { name: string; label: string; type?: "text" | "email" | "number" | "date" | "password" | "url"; placeholder?: string; required?: boolean; className?: string }
  | { name: string; label: string; type: "textarea"; placeholder?: string; required?: boolean; rows?: number; className?: string }
  | { name: string; label: string; type: "select"; placeholder?: string; required?: boolean; options: Array<{ value: string; label: string }>; className?: string }

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

  React.useEffect(() => {
    setValues(initialValues)
    setErrors({})
  }, [initialValues, open])

  function update(name: string, value: FormValues[string]) {
    setValues(current => ({ ...current, [name]: value }))
    setErrors(current => ({ ...current, [name]: "" }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    for (const field of fields) {
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
      <DialogContent className={contentClassName}>
        <form className="grid gap-5" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {fields.map(field => {
              const value = values[field.name]
              return (
                <Field key={field.name} className={cn(field.type === "textarea" && "sm:col-span-2", field.className)}>
                  <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      name={field.name}
                      required={field.required}
                      aria-invalid={Boolean(errors[field.name])}
                      rows={field.rows || 4}
                      placeholder={field.placeholder}
                      value={String(value || "")}
                      onChange={event => update(field.name, event.target.value)}
                    />
                  ) : field.type === "select" ? (
                    <Select value={String(value || "")} onValueChange={next => update(field.name, next)} required={field.required}>
                      <SelectTrigger id={field.name} aria-invalid={Boolean(errors[field.name])}>
                        <SelectValue placeholder={field.placeholder || "请选择"} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
