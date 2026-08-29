import {
  IconCreditCard,
  IconDashboard,
  IconCurrencyDollar,
  IconReceiptDollar,
  IconReportAnalytics,
  IconServer,
  IconNetwork,
  IconLogs,
  IconSettings,
  IconTag,
  IconTicket,
  IconTransform,
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
  { title: "销售统计", url: "/sales-analytics", icon: IconReportAnalytics },
  { title: "3x-ui 监控", url: "/xui-monitor", icon: IconServer },
  { title: "访问日志", url: "/xui-logs", icon: IconLogs },
  { title: "入站管理", url: "/xui-inbounds", icon: IconNetwork },
  { title: "Users", url: "/users", icon: IconUsers },
  { title: "Orders", url: "/orders", icon: IconCreditCard },
  { title: "工单管理", url: "/tickets", icon: IconTicket },
  { title: "商品管理", url: "/pricing-settings", icon: IconCurrencyDollar },
  { title: "销售设置", url: "/sales-settings", icon: IconTag },
  { title: "支付设置", url: "/payment-settings", icon: IconReceiptDollar },
  { title: "Emby", url: "/emby", icon: IconVideo },
  { title: "Subconverter", url: "/subconverter", icon: IconTransform },
  { title: "通用设置", url: "/general-settings", icon: IconSettings },
]

export function getPageTitle(pathname: string) {
  return navItems.find(item => pathname.startsWith(item.url))?.title ?? navItems[0].title
}
