import * as React from "react"
import { Loader2 } from "lucide-react"
import { IconLogout, IconMoon, IconSun } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

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

  return (
    <header className="relative z-40 flex h-(--header-height) shrink-0 items-center gap-2 rounded-xl border bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) dark:max-md:bg-card">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="切换主题">
                {dark ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{dark ? "切换亮色" : "切换暗色"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => void logout()} disabled={loggingOut} aria-label="退出登录">
                {loggingOut ? <Loader2 className="animate-spin" /> : <IconLogout className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>退出登录</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
