import { lazy, Suspense } from "react"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import type { MarkdownEditorProps } from "./markdown-editor-impl"

const LazyMarkdownEditor = lazy(() => import("./markdown-editor-impl"))

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense fallback={<Skeleton lines={6} />}>
      <LazyMarkdownEditor {...props} />
    </Suspense>
  )
}
