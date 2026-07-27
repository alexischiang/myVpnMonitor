import MDEditor from "@uiw/react-md-editor"
import "@uiw/react-md-editor/markdown-editor.css"
import "@uiw/react-markdown-preview/markdown.css"
import { useRef, useState } from "react"
import { ImageUp, Loader2 } from "lucide-react"
import { useTheme } from "next-themes"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { fetchJson } from "@/api"
import { Button } from "@/components/ui/button"

export function MarkdownEditor({ value, onChange, id, height = 480 }: { value: string; onChange: (value: string) => void; id?: string; height?: number }) {
  const { resolvedTheme } = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function uploadImage(file?: File) {
    if (!file) return
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      toast.error("请选择不超过 8MB 的 PNG、JPEG、WebP 或 GIF 图片")
      return
    }
    setUploading(true)
    try {
      const { url } = await fetchJson<{ url: string }>("/api/markdown/images", { method: "POST", body: file, headers: { "content-type": file.type } })
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]()]/g, " ").trim() || "内容图片"
      onChange(`${value}${value && !value.endsWith("\n") ? "\n\n" : ""}![${alt}](${url})`)
      toast.success("图片已上传并插入内容")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <section className="grid gap-2" data-color-mode={resolvedTheme === "dark" ? "dark" : "light"} aria-label="Markdown 编辑器">
      <header className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">支持 PNG、JPEG、WebP、GIF，单张不超过 8MB</p><Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <ImageUp />}{uploading ? "上传中" : "上传图片"}</Button></header>
      <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void uploadImage(event.target.files?.[0])} />
      <MDEditor
        id={id}
        height={height}
        value={value}
        onChange={next => onChange(next || "")}
        previewOptions={{ remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSanitize] }}
        textareaProps={{ "aria-label": "Markdown 内容" }}
      />
    </section>
  )
}
