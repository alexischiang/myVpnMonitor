import type { CSSProperties, ReactNode } from "react"

import { AdminSidebarProvider } from "@/components/features/app-sidebar"
import { SiteHeader } from "@/components/features/site-header"

// Shell sizes on Arc's spacing scale. The top bar and the sidebar column headers share --header-height.
const SHELL_SIZES = {
  "--header-height": "calc(var(--space-1) * 12)",
  "--sidebar-rail-width": "calc(var(--space-1) * 14)",
  "--sidebar-panel-width": "calc(var(--space-1) * 60)",
  // The sidebar sits in a card with a 1px border, so its column headers are 1px shorter and their rule lines up with the top bar's bottom edge.
  "--sidebar-header-height": "calc(var(--space-1) * 12 - 1px)",
} as CSSProperties

export function AppLayout({ title, dark, onToggleTheme, onLogout, sidebar, children }: {
  title: string
  dark: boolean
  onToggleTheme: () => void
  onLogout: () => void | Promise<void>
  sidebar: ReactNode
  children: ReactNode
}) {
  return (
    <AdminSidebarProvider>
      <div
        className="flex h-svh min-h-0 w-full overflow-hidden bg-sidebar"
        style={SHELL_SIZES}
      >
        {sidebar}
        <main className="flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#fafafa] px-2 pb-2 pt-0 dark:bg-[#0a0a0a] md:bg-transparent dark:md:bg-transparent">
          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
            <SiteHeader title={title} dark={dark} onToggleTheme={onToggleTheme} onLogout={onLogout} />
            <div className="@container/main min-h-0 w-full flex-1 overflow-y-auto rounded-xl border bg-background p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:p-6 dark:max-md:bg-card">
              <div className="mx-auto w-full max-w-[1440px] [&>div]:!px-0 [&>div]:lg:!px-0">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AdminSidebarProvider>
  )
}
