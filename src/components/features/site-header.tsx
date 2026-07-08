import { IconLogout, IconMoon, IconSettings, IconSun } from "@tabler/icons-react"

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
  onLogout: () => void
}) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button>Default</Button>
          <Button variant="outline" size="sm">Outline</Button>
          <Button variant="secondary" size="sm">Secondary</Button>
          <Button variant="ghost" size="sm">Ghost</Button>
          <Button variant="destructive" size="sm">Delete</Button>
          <Button variant="link" size="sm">Link</Button>
          <Button variant="outline" size="icon" aria-label="Icon button">
            <IconSettings className="size-4" />
          </Button>
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
              <Button variant="ghost" size="icon" onClick={onLogout} aria-label="退出登录">
                <IconLogout className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>退出登录</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
