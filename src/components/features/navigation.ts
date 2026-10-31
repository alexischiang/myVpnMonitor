import {
  IconAdjustments,
  IconChartBar,
  IconCreditCard,
  IconDashboard,
  IconCurrencyDollar,
  IconHistory,
  IconReceiptDollar,
  IconReportAnalytics,
  IconServer,
  IconServer2,
  IconShoppingBag,
  IconNetwork,
  IconLogs,
  IconRefresh,
  IconSettings,
  IconTag,
  IconTicket,
  IconTopologyStar3,
  IconTruckDelivery,
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

export type NavGroup = {
  title: string
  icon: Icon
  items: NavItem[]
}

export type NavEntry = NavItem | NavGroup

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry
}

// Two-level admin sidebar: Dashboard stays on top as the home page, everything else sits in a group.
export const navEntries: NavEntry[] = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
  {
    title: "运营",
    icon: IconChartBar,
    items: [
      { title: "销售统计", url: "/sales-analytics", icon: IconReportAnalytics },
      { title: "Users", url: "/users", icon: IconUsers },
      { title: "Orders", url: "/orders", icon: IconCreditCard },
      { title: "工单管理", url: "/tickets", icon: IconTicket },
      { title: "服务交付", url: "/deliveries", icon: IconTruckDelivery },
    ],
  },
  {
    title: "节点",
    icon: IconServer2,
    items: [
      { title: "3x-ui 监控", url: "/xui-monitor", icon: IconServer },
      { title: "入站管理", url: "/xui-inbounds", icon: IconNetwork },
      { title: "Node Hub", url: "/node-hub", icon: IconTopologyStar3 },
      { title: "访问日志", url: "/xui-logs", icon: IconLogs },
      { title: "同步任务", url: "/sync-jobs", icon: IconRefresh },
    ],
  },
  {
    title: "商品与收款",
    icon: IconShoppingBag,
    items: [
      { title: "商品管理", url: "/catalog-v2", icon: IconCurrencyDollar },
      { title: "销售设置", url: "/sales-settings", icon: IconTag },
      { title: "支付设置", url: "/payment-settings", icon: IconReceiptDollar },
    ],
  },
  {
    title: "系统",
    icon: IconAdjustments,
    items: [
      { title: "通用设置", url: "/general-settings", icon: IconSettings },
      { title: "Subconverter", url: "/subconverter", icon: IconTransform },
      { title: "Emby", url: "/emby", icon: IconVideo },
      { title: "更新日志", url: "/changelog", icon: IconHistory },
    ],
  },
]

export const navItems: NavItem[] = navEntries.flatMap(entry => (isNavGroup(entry) ? entry.items : [entry]))

export function getPageTitle(pathname: string) {
  return navItems.find(item => pathname.startsWith(item.url))?.title ?? navItems[0].title
}
