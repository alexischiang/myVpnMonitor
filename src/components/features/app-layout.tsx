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
      <SidebarInset className="h-svh min-h-0 min-w-0 gap-3 overflow-hidden border-0! bg-[#fafafa] p-2 rounded-none! shadow-none! dark:bg-[#0a0a0a] md:m-0! md:ml-0! md:bg-transparent dark:md:bg-transparent">
        <SiteHeader title={title} dark={dark} onToggleTheme={onToggleTheme} onLogout={onLogout} />
        <div className="@container/main min-h-0 flex-1 overflow-y-auto rounded-xl border bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:max-md:bg-card">
          <div className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col pt-6 pb-4 md:pt-8 md:pb-6">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
