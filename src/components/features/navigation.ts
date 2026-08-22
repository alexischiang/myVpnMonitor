import {
  IconCreditCard,
  IconDashboard,
  IconCurrencyDollar,
  IconRoute,
  IconReceiptDollar,
  IconServer,
  IconNetwork,
  IconSettings,
  IconTag,
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
  { title: "3x-ui 监控", url: "/xui-monitor", icon: IconServer },
  { title: "入站管理", url: "/xui-inbounds", icon: IconNetwork },
  { title: "Pool", url: "/urls", icon: IconRoute },
  { title: "Users", url: "/users", icon: IconUsers },
  { title: "Orders", url: "/orders", icon: IconCreditCard },
  { title: "商品管理", url: "/pricing-settings", icon: IconCurrencyDollar },
  { title: "销售设置", url: "/sales-settings", icon: IconTag },
  { title: "支付设置", url: "/payment-settings", icon: IconReceiptDollar },
  { title: "Emby", url: "/emby", icon: IconVideo },
  { title: "Subconverter", url: "/subconverter", icon: IconSettings },
]

export function getPageTitle(pathname: string) {
  return navItems.find(item => pathname.startsWith(item.url))?.title ?? navItems[0].title
}
