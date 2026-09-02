import type { CSSProperties, ReactNode } from "react"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { SiteHeader } from "@/components/features/site-header"

export function AppLayout({ title, dark, onToggleTheme, onLogout, sidebar, children }: {
  title: string
  dark: boolean
  onToggleTheme: () => void
  onLogout: () => void | Promise<void>
  sidebar: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as CSSProperties}
    >
      {sidebar}
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden border-0! bg-[#fafafa] px-2 pb-2 pt-0 rounded-none! shadow-none! dark:bg-[#0a0a0a] md:m-0! md:ml-0! md:bg-transparent dark:md:bg-transparent">
        <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
          <SiteHeader title={title} dark={dark} onToggleTheme={onToggleTheme} onLogout={onLogout} />
          <div className="@container/main min-h-0 w-full flex-1 overflow-y-auto rounded-xl border bg-background p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:p-6 dark:max-md:bg-card">
            <div className="mx-auto w-full max-w-[1440px] [&>div]:!px-0 [&>div]:lg:!px-0">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
