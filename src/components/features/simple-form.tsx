import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export type Field =
  | { name: string; label: string; type?: "text" | "email" | "number" | "date" | "password" | "url"; placeholder?: string; required?: boolean }
  | { name: string; label: string; type: "textarea"; placeholder?: string; required?: boolean; rows?: number }
  | { name: string; label: string; type: "select"; placeholder?: string; required?: boolean; options: Array<{ value: string; label: string }> }

export type FormValues = Record<string, string | number | boolean | undefined>

export function SimpleFormDialog({
  open,
  title,
  fields,
  initialValues = {},
  submitLabel = "保存",
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  fields: Field[]
  initialValues?: FormValues
  submitLabel?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (values: FormValues) => Promise<void> | void
}) {
  const [values, setValues] = React.useState<FormValues>(initialValues)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    setValues(initialValues)
  }, [initialValues, open])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
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
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div>
            {fields.map(field => {
              const value = values[field.name]
              return (
                <div key={field.name}>
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      required={field.required}
                      rows={field.rows || 4}
                      placeholder={field.placeholder}
                      value={String(value || "")}
                      onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}
                    />
                  ) : field.type === "select" ? (
                    <Select value={String(value || "")} onValueChange={next => setValues(current => ({ ...current, [field.name]: next }))} required={field.required}>
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder={field.placeholder || "请选择"} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={field.name}
                      required={field.required}
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      value={String(value || "")}
                      onChange={event => setValues(current => ({ ...current, [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value }))}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "保存中..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
