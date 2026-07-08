import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatBytes, formatMoney } from "@/utils"

type SectionCardsProps = {
  subscriptions: number
  healthySubscriptions: number
  users: number
  activeUsers: number
  bills: number
  income: number
  trafficBytes: number
  expiringUsers: number
}

function TrendBadge({ value, warning = false }: { value: number; warning?: boolean }) {
  const Icon = warning ? IconTrendingDown : IconTrendingUp

  return (
    <Badge variant="outline">
      <Icon />
      {value}
    </Badge>
  )
}

export function SectionCards({
  subscriptions,
  healthySubscriptions,
  users,
  activeUsers,
  bills,
  income,
  trafficBytes,
  expiringUsers,
}: SectionCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs md:grid-cols-2 lg:px-6 xl:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>订阅池</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {subscriptions}
          </CardTitle>
          <CardAction>
            <TrendBadge value={healthySubscriptions} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            正常订阅 {healthySubscriptions} 个 <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">订阅池健康度状态</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>客户</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {users}
          </CardTitle>
          <CardAction>
            <TrendBadge value={activeUsers} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            未到期客户 {activeUsers} 位 <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">当前可服务客户数</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>累计收入</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatMoney(income)}
          </CardTitle>
          <CardAction>
            <TrendBadge value={bills} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            有效账单 {bills} 笔 <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">排除已冲正账单</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>剩余流量</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatBytes(trafficBytes)}
          </CardTitle>
          <CardAction>
            <TrendBadge value={expiringUsers} warning={expiringUsers > 0} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            即将到期 {expiringUsers} 位 <IconTrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">客户续费提醒</div>
        </CardFooter>
      </Card>
    </div>
  )
}
