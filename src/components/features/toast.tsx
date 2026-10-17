import * as React from "react"

import { ToastStack, ToastStackProvider, useToastStack, type ToastOptions } from "@/components/arc/toast-stack/toast-stack"

type Show = (options: ToastOptions) => string

// Arc's toast stack is reached through a hook. Request helpers and event handlers outside the component tree also need to
// raise toasts, so the mounted stack registers itself here and toast() forwards to it.
let show: Show | null = null
const waiting: ToastOptions[] = []

/** Shows a toast in the app-wide stack. Takes Arc's options ({ type, title, description }) and can be called from anywhere. */
export function toast(options: ToastOptions) {
  if (show) return show(options)
  waiting.push(options)
  return ""
}

function ToastBridge() {
  const { toast: stackToast } = useToastStack()
  React.useEffect(() => {
    show = stackToast
    for (const options of waiting.splice(0)) stackToast(options)
    return () => { show = null }
  }, [stackToast])
  return null
}

/** Mounts the toast stack once for the whole app. */
export function AppToasts({ children }: { children: React.ReactNode }) {
  return <ToastStackProvider>{children}<ToastBridge /><ToastStack position="bottom-right" /></ToastStackProvider>
}
