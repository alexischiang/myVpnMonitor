import * as React from "react"
import { Compass, Ellipsis } from "lucide-react"
import { Navigate, useSearchParams } from "react-router-dom"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { NexoraLogo } from "@/components/features/nexora-logo"
import { CopyButton } from "@/components/features/shared"
import { TypingText } from "@/components/features/typing-text"
import { isWechatBrowser, OPEN_IN_BROWSER_PATH } from "@/utils"

// 浅色背景上均满足 WCAG AA 普通文字对比度（≥4.5:1），深色模式使用对应的浅色阶
const ACCENT_COLORS = [
  "text-red-700 dark:text-red-400",
  "text-amber-700 dark:text-amber-400",
  "text-green-700 dark:text-green-400",
  "text-teal-700 dark:text-teal-400",
  "text-cyan-700 dark:text-cyan-400",
  "text-sky-700 dark:text-sky-400",
  "text-blue-700 dark:text-blue-400",
  "text-indigo-700 dark:text-indigo-400",
  "text-violet-700 dark:text-violet-400",
  "text-purple-700 dark:text-purple-400",
  "text-fuchsia-700 dark:text-fuchsia-400",
  "text-pink-700 dark:text-pink-400",
  "text-rose-700 dark:text-rose-400",
]

// 调用 next() 时随机换成另一个颜色（不会与当前颜色重复）
function useRandomColor(colors: string[]) {
  const [index, setIndex] = React.useState(() => Math.floor(Math.random() * colors.length))
  const next = React.useCallback(() => setIndex(current => (current + 1 + Math.floor(Math.random() * (colors.length - 1))) % colors.length), [colors.length])
  return [colors[index], next] as const
}

// 只接受站内相对路径，避免被构造成开放重定向
export function safeRedirectPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith(OPEN_IN_BROWSER_PATH) ? value : "/login"
}

export function OpenInBrowserPage() {
  const [searchParams] = useSearchParams()
  const [accentColor, nextAccentColor] = useRandomColor(ACCENT_COLORS)
  const redirect = safeRedirectPath(searchParams.get("redirect"))
  if (!isWechatBrowser()) return <Navigate to={redirect} replace />
  const url = `${window.location.origin}${redirect}`
  return (
    <main className="relative grid min-h-svh grid-rows-[1fr_auto_1fr] gap-8 p-6 md:p-10">
      <div className="mx-auto grid w-full max-w-md content-start gap-8">
        <NexoraLogo className="md:absolute md:left-10 md:top-10" />
        <header className="grid gap-3 text-left">
          <p className="text-4xl font-bold tracking-tight sm:text-5xl">
            One click away<br />From the <TypingText text="WORLD." loop onTypeStart={nextAccentColor} className={accentColor} />
          </p>
          <p className="text-lg font-medium text-foreground sm:text-xl">只需一键，全球互联。</p>
        </header>
      </div>
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle><h1 className="flex items-center gap-2 text-xl"><Compass className="size-5 shrink-0" aria-hidden />请在浏览器中打开</h1></CardTitle>
          <CardDescription>微信内置浏览器无法正常使用本站功能。请复制下方链接，粘贴到系统浏览器中打开。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <code className="select-all break-all rounded-md bg-muted px-3 py-2 text-sm">{url}</code>
          <CopyButton value={url} label="复制网页链接" variant="default" size="lg" className="h-11 w-full" feedback="inline" />
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">也可以点击右上角 <Ellipsis className="inline size-4 align-middle" aria-label="更多" /> 菜单，选择“在默认浏览器中打开”。</p>
        </CardFooter>
      </Card>
    </main>
  )
}
