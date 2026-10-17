import * as React from "react"

import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"

/**
 * Confirmation for a destructive or irreversible action, on Arc's dialog instead of window.confirm.
 * Controlled by `open`; `onConfirm` may return a promise, during which the confirm button shows its loading state and the dialog stays open.
 * The dialog closes once `onConfirm` resolves; if it throws, the dialog stays open so the caller's error message is seen in context.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "删除", cancelLabel = "取消", tone = "primary", onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: "danger" | "primary"
  onConfirm: () => void | Promise<void>
}) {
  const [pending, setPending] = React.useState(false)

  async function confirm() {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // The caller reports the failure (usually a toast); keep the dialog open so the action can be retried or cancelled.
    } finally {
      setPending(false)
    }
  }

  return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
    <DialogContent title={title} description={description}>
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild><Button variant="secondary" disabled={pending}>{cancelLabel}</Button></DialogClose>
        <Button variant={tone} loading={pending} onClick={() => void confirm()}>{confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
