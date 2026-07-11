import {
  IconCreditCard,
  IconDashboard,
  IconCurrencyDollar,
  IconRoute,
  IconSettings,
  IconUsers,
  IconVideo,
  type Icon,
} from "@tabler/icons-react"

export type NavItem = {
  title: string
  url: string
  icon: Icon
}

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
  { title: "Pool", url: "/urls", icon: IconRoute },
  { title: "Users", url: "/users", icon: IconUsers },
  { title: "Bills", url: "/bills", icon: IconCreditCard },
  { title: "套餐管理", url: "/pricing-settings", icon: IconCurrencyDollar },
  { title: "Emby", url: "/emby", icon: IconVideo },
  { title: "Subconverter", url: "/subconverter", icon: IconSettings },
]

export function getPageTitle(pathname: string) {
  return navItems.find(item => pathname.startsWith(item.url))?.title ?? navItems[0].title
}
