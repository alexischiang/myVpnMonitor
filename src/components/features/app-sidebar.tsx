import * as React from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { useTheme } from "next-themes"
import { IconChevronDown, IconExternalLink, IconInnerShadowTop, IconLayoutSidebar, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconUserCircle } from "@tabler/icons-react"

import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { UserMenu } from "@/components/arc/user-menu/user-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

export type SidebarNavItem = {
  title: string
  url: string
  href?: string
  icon: React.ElementType
  exact?: boolean
  external?: boolean
}

// A first-level entry that folds a list of links underneath it.
export type SidebarNavGroup = {
  title: string
  icon: React.ElementType
  items: SidebarNavItem[]
}

export type SidebarNavEntry = SidebarNavItem | SidebarNavGroup

/**
 * Desktop states: expanded (icon rail + full panel), compact (icon rail + icon-only panel) and rail (icon rail only).
 * Phones get the full panel in a drawer instead.
 */
export type SidebarMode = "expanded" | "compact" | "rail"

const MODE_KEY = "admin-sidebar-mode"
const OPEN_GROUPS_KEY = "app-sidebar-open-groups"
const TOGGLE_SHORTCUT = "b"


function isGroup(entry: SidebarNavEntry): entry is SidebarNavGroup {
  return "items" in entry
}

function isItemActive(item: SidebarNavItem, pathname: string) {
  return item.exact ? pathname === item.url : pathname.startsWith(item.url)
}

function readStored<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null")
    return valid(value) ? value : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode, blocked storage); the sidebar still works for this visit.
  }
}

const isMode = (value: unknown): value is SidebarMode => value === "expanded" || value === "compact" || value === "rail"
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string")

type AdminSidebarContextValue = {
  mode: SidebarMode
  setMode: (mode: SidebarMode) => void
  isMobile: boolean
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  toggle: () => void
}

const AdminSidebarContext = React.createContext<AdminSidebarContextValue | null>(null)

export function useAdminSidebar() {
  const context = React.useContext(AdminSidebarContext)
  if (!context) throw new Error("useAdminSidebar must be used within AdminSidebarProvider")
  return context
}

export function AdminSidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const [mode, setModeState] = React.useState<SidebarMode>(() => readStored(MODE_KEY, "expanded", isMode))
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const lastVisible = React.useRef<Exclude<SidebarMode, "rail">>(mode === "rail" ? "expanded" : mode)

  const setMode = React.useCallback((next: SidebarMode) => {
    if (next !== "rail") lastVisible.current = next
    setModeState(next)
    writeStored(MODE_KEY, next)
  }, [])

  // The header button and Ctrl/⌘+B hide or bring back the panel; the panel's own button switches expanded and compact.
  const toggle = React.useCallback(() => {
    if (isMobile) setMobileOpen(open => !open)
    else setMode(mode === "rail" ? lastVisible.current : "rail")
  }, [isMobile, mode, setMode])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === TOGGLE_SHORTCUT && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggle])

  const value = React.useMemo(() => ({ mode, setMode, isMobile, mobileOpen, setMobileOpen, toggle }), [mode, setMode, isMobile, mobileOpen, toggle])
  return <AdminSidebarContext.Provider value={value}>{children}</AdminSidebarContext.Provider>
}

export function AdminSidebarTrigger({ className }: { className?: string }) {
  const { toggle, mode, isMobile } = useAdminSidebar()
  const label = isMobile ? "打开导航" : mode === "rail" ? "展开侧边栏" : "收起侧边栏"
  return (
    <Tooltip content={label} side="bottom">
      <Button variant="ghost" size="icon-sm" className={className} onClick={toggle} aria-label={label}>
        <IconLayoutSidebar className="size-4" />
      </Button>
    </Tooltip>
  )
}

type NavState = {
  pathname: string
  activeGroup?: string
  openGroups: string[]
  toggleGroup: (title: string) => void
  registerGroup: (title: string) => (node: HTMLElement | null) => void
}

function ItemLink({ item, compact, pathname }: { item: SidebarNavItem; compact?: boolean; pathname: string }) {
  const link = (
    <Button asChild variant="nav" size={compact ? "icon-sm" : "sm"}>
      <NavLink to={item.href ?? item.url} aria-label={compact ? item.title : undefined} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined}>
        <item.icon className="size-4 shrink-0" />
        {compact ? null : <span className="min-w-0 flex-1 truncate">{item.title}</span>}
        {!compact && item.external ? <IconExternalLink className="size-4 text-muted-foreground" /> : null}
      </NavLink>
    </Button>
  )
  return compact ? <Tooltip content={item.title} side="right">{link}</Tooltip> : link
}

function PanelNav({ entries, nav }: { entries: SidebarNavEntry[]; nav: NavState }) {
  const singles = entries.filter((entry): entry is SidebarNavItem => !isGroup(entry))
  const groups = entries.filter(isGroup)

  return (
    <nav aria-label="主导航" className="flex flex-col">
      {singles.length ? (
        <ul className="flex flex-col gap-1 px-2 pb-3">
          {singles.map(item => <li key={item.url}><ItemLink item={item} pathname={nav.pathname} /></li>)}
        </ul>
      ) : null}
      {groups.map(group => {
        const open = nav.openGroups.includes(group.title)
        const listId = `sidebar-section-${group.title}`
        return (
          <section key={group.title} ref={nav.registerGroup(group.title)} className="border-t border-sidebar-border px-2 py-2">
            <Button asChild variant="nav" size="sm">
              <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => nav.toggleGroup(group.title)}>
                <IconChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open ? "" : "-rotate-90")} />
                <span className="text-xs font-medium tracking-wide text-muted-foreground">{group.title}</span>
                {nav.activeGroup === group.title && !open ? <span className="ml-auto size-2 rounded-full bg-foreground" aria-hidden="true" /> : null}
              </button>
            </Button>
            {open ? (
              <ul id={listId} className="mt-1 flex flex-col gap-1">
                {group.items.map(item => <li key={item.url}><ItemLink item={item} pathname={nav.pathname} /></li>)}
              </ul>
            ) : null}
          </section>
        )
      })}
    </nav>
  )
}

function CompactNav({ entries, nav }: { entries: SidebarNavEntry[]; nav: NavState }) {
  return (
    <nav aria-label="主导航" className="flex flex-col items-center">
      {entries.map(entry => isGroup(entry) ? (
        <ul key={entry.title} ref={nav.registerGroup(entry.title)} aria-label={entry.title} className="flex w-full flex-col items-center gap-1 border-t border-sidebar-border py-2">
          {entry.items.map(item => <li key={item.url}><ItemLink item={item} compact pathname={nav.pathname} /></li>)}
        </ul>
      ) : (
        <ul key={entry.url} className="flex flex-col items-center pb-2">
          <li><ItemLink item={entry} compact pathname={nav.pathname} /></li>
        </ul>
      ))}
    </nav>
  )
}

// The brand row uses the nav button metrics, so its logo shares the left edge of every row icon below it.
function Brand({ to }: { to: string }) {
  return (
    <Button asChild variant="nav" size="sm" className="min-w-0 flex-1">
      <Link to={to}>
        <IconInnerShadowTop className="size-5 shrink-0 text-foreground" />
        <span className="truncate text-base font-semibold text-foreground">NEXORA</span>
        <Badge size="sm">beta</Badge>
      </Link>
    </Button>
  )
}

export function AppSidebar({
  items,
  homeUrl,
  accountName,
  accountDescription,
  accountUrl,
  accountLabel,
  onLogout,
}: {
  items: SidebarNavEntry[]
  homeUrl: string
  accountName: string
  accountDescription: string
  accountUrl: string
  accountLabel: string
  onLogout: () => void | Promise<void>
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const dark = (theme ?? resolvedTheme) === "dark"
  const { mode, setMode, isMobile, mobileOpen, setMobileOpen } = useAdminSidebar()
  const groupNodes = React.useRef(new Map<string, HTMLElement>())
  const pendingScroll = React.useRef<string | null>(null)

  const pathname = location.pathname
  const activeGroup = items.find(entry => isGroup(entry) && entry.items.some(item => isItemActive(item, pathname)))?.title
  const [openGroups, setOpenGroups] = React.useState<string[]>(() => {
    const saved = readStored(OPEN_GROUPS_KEY, items.filter(isGroup).map(group => group.title), isStringList)
    return activeGroup && !saved.includes(activeGroup) ? [...saved, activeGroup] : saved
  })

  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  // Arriving at a page in a folded section (a link, the back button) unfolds it so the current page stays visible.
  React.useEffect(() => {
    if (activeGroup) setOpenGroups(current => (current.includes(activeGroup) ? current : [...current, activeGroup]))
  }, [activeGroup])

  React.useEffect(() => writeStored(OPEN_GROUPS_KEY, openGroups), [openGroups])

  React.useEffect(() => {
    const title = pendingScroll.current
    if (!title) return
    pendingScroll.current = null
    groupNodes.current.get(title)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  })

  const registerGroup = React.useCallback((title: string) => (node: HTMLElement | null) => {
    if (node) groupNodes.current.set(title, node)
    else groupNodes.current.delete(title)
  }, [])

  const toggleGroup = React.useCallback((title: string) => {
    setOpenGroups(current => (current.includes(title) ? current.filter(value => value !== title) : [...current, title]))
  }, [])

  // A rail section icon brings its section into view, opening the panel first when only the rail shows.
  function revealGroup(title: string) {
    if (mode === "rail") setMode("expanded")
    setOpenGroups(current => (current.includes(title) ? current : [...current, title]))
    pendingScroll.current = title
  }

  const nav: NavState = { pathname, activeGroup, openGroups, toggleGroup, registerGroup }
  const userMenu = (
    <UserMenu
      user={{ name: accountName, email: accountDescription }}
      theme={dark ? "dark" : "light"}
      onThemeChange={next => setTheme(next === "dark" ? "dark" : "light")}
      items={[{ label: accountLabel, icon: <IconUserCircle size={16} />, onSelect: () => navigate(accountUrl) }]}
      onSignOut={onLogout}
      align="start"
    />
  )

  if (isMobile) {
    return (
      <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent title="导航" side="left">
          <div className="-mx-2 flex flex-col gap-1">
            <PanelNav entries={items} nav={nav} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  const railEntries = items.map(entry => {
    const active = isGroup(entry) ? activeGroup === entry.title : isItemActive(entry, pathname)
    if (!isGroup(entry)) {
      return (
        <Tooltip key={entry.url} content={entry.title} side="right">
          <Button asChild variant="nav" size="icon-sm">
            <NavLink to={entry.href ?? entry.url} aria-label={entry.title}><entry.icon className="size-4" /></NavLink>
          </Button>
        </Tooltip>
      )
    }
    return (
      <Tooltip key={entry.title} content={entry.title} side="right">
        <Button variant="nav" size="icon-sm" data-active={active} aria-label={entry.title} aria-current={active ? "true" : undefined} onClick={() => revealGroup(entry.title)}>
          <entry.icon className="size-4" />
        </Button>
      </Tooltip>
    )
  })

  return (
    <aside aria-label="侧边栏" className="hidden h-svh shrink-0 py-2 pl-2 md:flex">
      <div className="flex h-full overflow-hidden rounded-xl border bg-background">
        <div className="flex w-(--sidebar-rail-width) shrink-0 flex-col items-center">
          <div className="flex h-(--sidebar-header-height) w-full shrink-0 items-center justify-center border-b border-sidebar-border">
            <Tooltip content="NEXORA" side="right">
              <Link to={homeUrl} aria-label="NEXORA 首页" className="flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <IconInnerShadowTop className="size-5" />
              </Link>
            </Tooltip>
          </div>
          <nav aria-label="分区" className="flex flex-1 flex-col items-center gap-1 py-3">{railEntries}</nav>
          <div className="flex flex-col items-center pb-3">{userMenu}</div>
        </div>

        {mode === "expanded" ? (
          <div className="box-content flex w-(--sidebar-panel-width) shrink-0 flex-col border-l border-sidebar-border">
            <div className="flex h-(--sidebar-header-height) shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-2">
              <Brand to={homeUrl} />
              <Tooltip content="紧凑模式" side="bottom">
                <Button variant="ghost" size="icon-sm" aria-label="切换到紧凑模式" onClick={() => setMode("compact")}>
                  <IconLayoutSidebarLeftCollapse className="size-4" />
                </Button>
              </Tooltip>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-3 [scrollbar-width:thin]">
              <PanelNav entries={items} nav={nav} />
            </div>
          </div>
        ) : null}

        {mode === "compact" ? (
          <div className="box-content flex w-(--sidebar-rail-width) shrink-0 flex-col items-center border-l border-sidebar-border">
            <div className="flex h-(--sidebar-header-height) w-full shrink-0 items-center justify-center border-b border-sidebar-border">
              <Tooltip content="展开面板" side="right">
                <Button variant="nav" size="icon-sm" data-active aria-label="展开面板" onClick={() => setMode("expanded")}>
                  <IconLayoutSidebarLeftExpand className="size-4" />
                </Button>
              </Tooltip>
            </div>
            <div className="flex w-full min-h-0 flex-1 flex-col items-center overflow-y-auto pt-3 [scrollbar-width:none]">
              <CompactNav entries={items} nav={nav} />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
