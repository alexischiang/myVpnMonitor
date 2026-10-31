import * as React from "react"
import { Loader2 } from "lucide-react"
import { IconLogout, IconMoon, IconSun } from "@tabler/icons-react"

import { Separator } from "@/components/ui/separator"
import { AdminSidebarTrigger } from "@/components/features/app-sidebar"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"

export function SiteHeader({
  title,
  dark,
  onToggleTheme,
  onLogout,
}: {
  title: string
  dark: boolean
  onToggleTheme: () => void
  onLogout: () => void | Promise<void>
}) {
  const [loggingOut, setLoggingOut] = React.useState(false)

  async function logout() {
    setLoggingOut(true)
    try {
      await onLogout()
    } finally {
      setLoggingOut(false)
    }
  }

  // 32px icon buttons inset their 16px glyph by --space-2, so the bar pads by the content padding minus --space-2 and the
  // glyphs land on the content edges (content p-4 / md:p-6).
  return (
    <header className="relative z-40 flex h-(--header-height) shrink-0 items-center gap-2 rounded-xl border bg-background transition-[width,height] ease-linear dark:max-md:bg-card">
      <div className="flex w-full items-center gap-2 px-2 md:px-4">
        <AdminSidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip content={dark ? "切换亮色" : "切换暗色"}><Button variant="ghost" size="icon-sm" onClick={onToggleTheme} aria-label="切换主题">
                {dark ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
              </Button></Tooltip>
          <Tooltip content="退出登录"><Button variant="ghost" size="icon-sm" onClick={() => void logout()} aria-label="退出登录" loading={loggingOut}>
                <IconLogout className="size-4" />
              </Button></Tooltip>
        </div>
      </div>
    </header>
  )
}
