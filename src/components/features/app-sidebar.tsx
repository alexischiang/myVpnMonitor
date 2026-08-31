import * as React from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { IconDotsVertical, IconExternalLink, IconInnerShadowTop, IconLogout, IconUserCircle } from "@tabler/icons-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarSeparator, useSidebar } from "@/components/ui/sidebar"

export type SidebarNavItem = {
  title: string
  url: string
  href?: string
  icon: React.ElementType
  exact?: boolean
  external?: boolean
}

export function AppSidebar({
  items,
  homeUrl,
  accountName,
  accountDescription,
  accountUrl,
  accountLabel,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  items: SidebarNavItem[]
  homeUrl: string
  accountName: string
  accountDescription: string
  accountUrl: string
  accountLabel: string
  onLogout: () => void | Promise<void>
}) {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  React.useEffect(() => {
    setOpenMobile(false)
  }, [location.pathname, setOpenMobile])

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to={homeUrl}>
                <IconInnerShadowTop className="size-5!" />
                <span className="text-lg font-semibold">NEXORA</span>
                <Badge variant="outline" className="h-4 self-baseline rounded-sm border-foreground bg-foreground px-1.5 py-0 text-[11px] text-background">beta</Badge>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={item.exact ? location.pathname === item.url : location.pathname.startsWith(item.url)}
                    className="data-[active=true]:bg-muted-foreground/10 data-[active=true]:hover:bg-muted-foreground/10 dark:data-[active=true]:bg-muted-foreground/20 dark:data-[active=true]:hover:bg-muted-foreground/20"
                  >
                    <NavLink to={item.href ?? item.url} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined}>
                      <item.icon />
                      <span>{item.title}</span>
                      {item.external ? <IconExternalLink className="ml-auto" /> : null}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="bg-sidebar-accent/70 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">{accountName.slice(0, 2).toUpperCase() || "U"}</AvatarFallback></Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{accountName}</span><span className="truncate text-xs text-muted-foreground">{accountDescription}</span></div>
                  <IconDotsVertical className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">{accountName.slice(0, 2).toUpperCase() || "U"}</AvatarFallback></Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{accountName}</span><span className="truncate text-xs text-muted-foreground">{accountDescription}</span></div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup><DropdownMenuItem asChild><Link to={accountUrl}><IconUserCircle />{accountLabel}</Link></DropdownMenuItem></DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void onLogout()}><IconLogout />退出登录</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
