import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Laptop, Link2, MonitorSmartphone, Percent, ShieldCheck, Smartphone, Users } from "lucide-react"

import { fetchJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type CarouselApi, Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { VipBadge } from "@/components/features/vip-badge"

const steps = [
  {
    title: "先选择适合你的套餐",
    description: "从左侧边栏点击“购买套餐”，选择套餐和使用周期并完成付款。付款成功后，订阅会自动出现在用户中心。",
  },
  {
    title: "在总览中找到你的订阅",
    description: "打开“总览 → 当前订阅”，即可查看到期时间、复制订阅链接，或直接导入支持的客户端。",
  },
  {
    title: "按照设备教程完成连接",
    description: "进入“使用文档”，选择你的设备和客户端，跟随教程完成安装、导入与首次连接。",
  },
  {
    title: "消费累积，解锁 VIP 权益",
    description: "购买套餐和充值余额都会累计 VIP 消费。累计 ¥360 升至 VIP 2，享 5% 专属折扣；累计 ¥900 升至 VIP 3，享 10% 专属折扣。",
  },
  {
    title: "分享邀请，获得返利",
    description: "在 [邀请返利] 页面复制邀请链接。好友通过邀请链接首次购买套餐后，你会获得返利。",
  },
]

function StepPreview({ step }: { step: number }) {
  if (step === 0) return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="px-4 sm:px-6">
        <CardDescription>购买套餐</CardDescription>
        <CardTitle>选择适合你的套餐</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-4 sm:px-6">
        <Item variant="muted">
          <ItemContent><ItemTitle>PRO · 高级套餐</ItemTitle><ItemDescription>每月 200G 流量 · 可绑定 5 台设备</ItemDescription></ItemContent>
          <Badge>推荐</Badge>
        </Item>
        <Separator />
        <CardDescription>选择计费周期</CardDescription>
        <ItemGroup>
          <Item variant="outline"><ItemContent><ItemTitle>月付 30 天</ItemTitle><ItemDescription>¥49.00 · 可绑定 3 台设备</ItemDescription></ItemContent><Badge variant="outline">已选择</Badge></Item>
          <Item variant="outline"><ItemContent><ItemTitle>年付 360 天</ItemTitle><ItemDescription>¥429.00 · 可绑定 5 台设备</ItemDescription></ItemContent><Badge variant="destructive">-27%</Badge></Item>
        </ItemGroup>
      </CardContent>
    </Card>
  )

  if (step === 3) return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="flex-row items-start justify-between gap-4 px-4 sm:px-6">
        <div className="grid gap-1.5"><CardDescription>VIP 成长</CardDescription><CardTitle>专属折扣随等级提升</CardTitle></div>
        <VipBadge level="vip2" />
      </CardHeader>
      <CardContent className="grid gap-4 px-4 sm:px-6">
        <ItemGroup className="grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
          <Item variant="outline" size="sm" className="justify-center"><ItemContent className="items-center text-center"><VipBadge level="vip1" /><ItemDescription>起始等级</ItemDescription><ItemTitle>0% 折扣</ItemTitle></ItemContent></Item>
          <ArrowRight className="size-4 text-muted-foreground" />
          <Item variant="muted" size="sm" className="justify-center"><ItemContent className="items-center text-center"><VipBadge level="vip2" /><ItemDescription>累计 ¥360</ItemDescription><ItemTitle>5% 折扣</ItemTitle></ItemContent></Item>
          <ArrowRight className="size-4 text-muted-foreground" />
          <Item variant="outline" size="sm" className="justify-center"><ItemContent className="items-center text-center"><VipBadge level="vip3" /><ItemDescription>累计 ¥900</ItemDescription><ItemTitle>10% 折扣</ItemTitle></ItemContent></Item>
        </ItemGroup>
        <section className="grid gap-2" aria-label="VIP 成长进度示例">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>成长进度</span><span>¥540 / ¥900</span></div>
          <Progress value={60} />
          <p className="text-xs text-muted-foreground">当前等级和成长进度可在“总览”中查看。</p>
        </section>
      </CardContent>
    </Card>
  )

  if (step === 4) return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="px-4 sm:px-6">
        <CardDescription>邀请返利</CardDescription>
        <CardTitle>分享邀请，好友和你都受益</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 sm:px-6">
        <Item variant="muted"><Users /><ItemContent><ItemTitle>邀请好友注册</ItemTitle><ItemDescription>在邀请返利页面找到你的邀请链接。</ItemDescription></ItemContent></Item>
        <Item variant="muted"><Copy /><ItemContent><ItemTitle>分享专属链接</ItemTitle><ItemDescription>好友通过你的链接购买套餐，你将获得佣金返利。</ItemDescription></ItemContent></Item>
        <Item variant="muted"><Percent /><ItemContent><ItemTitle>返利直接到账</ItemTitle><ItemDescription>返利余额可在购买套餐时直接抵扣。</ItemDescription></ItemContent></Item>
      </CardContent>
    </Card>
  )

  if (step === 1) return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="flex-row items-start justify-between gap-4 px-4 sm:px-6">
        <div className="grid gap-1.5"><CardDescription>当前订阅</CardDescription><CardTitle>STANDARD</CardTitle></div>
        <Badge variant="success"><CheckCircle2 />生效中</Badge>
      </CardHeader>
      <CardContent className="grid gap-4 px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Item variant="muted"><ItemContent><ItemDescription>当前到期</ItemDescription><ItemTitle>2026-12-31</ItemTitle></ItemContent></Item>
          <Item variant="muted"><ItemContent><ItemDescription>可绑定设备</ItemDescription><ItemTitle>5 台</ItemTitle></ItemContent></Item>
        </div>
        <Input readOnly value="https://example.com/subscription/..." tabIndex={-1} aria-label="订阅链接示例" />
        <Button variant="outline" className="w-full" tabIndex={-1}><Link2 />复制订阅链接</Button>
      </CardContent>
    </Card>
  )

  return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="px-4 sm:px-6">
        <CardDescription>使用文档</CardDescription>
        <CardTitle>选择你的设备</CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <ItemGroup className="grid-cols-2">
          <Item variant="outline" size="sm"><Smartphone /><ItemContent><ItemTitle>iPhone / iPad</ItemTitle><ItemDescription>Shadowrocket</ItemDescription></ItemContent></Item>
          <Item variant="outline" size="sm"><Smartphone /><ItemContent><ItemTitle>Android</ItemTitle><ItemDescription>移动端客户端</ItemDescription></ItemContent></Item>
          <Item variant="outline" size="sm"><MonitorSmartphone /><ItemContent><ItemTitle>Windows</ItemTitle><ItemDescription>桌面端客户端</ItemDescription></ItemContent></Item>
          <Item variant="outline" size="sm"><Laptop /><ItemContent><ItemTitle>macOS</ItemTitle><ItemDescription>桌面端客户端</ItemDescription></ItemContent></Item>
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

export function AccountOnboardingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [carouselApi, setCarouselApi] = React.useState<CarouselApi>()
  const [step, setStep] = React.useState(0)

  React.useEffect(() => {
    fetchJson<{ role: string; email?: string }>("/api/auth/me")
      .then(me => {
        if (me.role !== "user") return navigate("/dashboard", { replace: true })
        const userEmail = me.email || "user"
        if (searchParams.get("replay") !== "1" && localStorage.getItem(`account-onboarding:${userEmail}`)) return navigate("/account", { replace: true })
        setEmail(userEmail)
      })
      .catch(() => navigate("/login", { replace: true }))
  }, [navigate, searchParams])

  React.useEffect(() => {
    if (!carouselApi) return
    const select = () => setStep(carouselApi.selectedScrollSnap())
    select()
    carouselApi.on("select", select)
    return () => { carouselApi.off("select", select) }
  }, [carouselApi])

  function finish() {
    localStorage.setItem(`account-onboarding:${email}`, "1")
    navigate("/account", { replace: true })
  }

  if (!email) return <main className="grid h-svh place-items-center overflow-hidden p-6"><Skeleton className="h-96 w-full max-w-5xl" /></main>

  const lastStep = step === steps.length - 1

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 sm:px-6 lg:px-10">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5" />NEXORA <Badge variant="outline">使用入门</Badge></p>
        <Button variant="ghost" onClick={finish}>跳过</Button>
      </header>

      <Carousel className="flex min-h-0 flex-1 flex-col overflow-hidden [&_[data-slot=carousel-content]]:h-full" setApi={setCarouselApi} opts={{ watchDrag: true }} aria-label="用户中心使用引导">
        <CarouselContent className="h-full items-center">
          {steps.map((item, index) => {
            return (
              <CarouselItem className="h-full" key={item.title} aria-label={`${index + 1} / ${steps.length}`}>
                <section className="mx-auto grid h-full w-full max-w-6xl content-center items-center gap-4 px-4 py-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:px-6 md:gap-8 lg:gap-16 lg:px-10">
                  <header className="grid gap-3">
                    <p className="text-4xl font-semibold tracking-tight text-muted-foreground md:text-6xl">Step {index + 1}</p>
                    <div className="grid gap-3">
                      <h1 className="max-w-xl text-2xl font-semibold tracking-tight md:text-4xl lg:text-5xl">{item.title}</h1>
                      <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-lg md:leading-7">{item.description}</p>
                    </div>
                  </header>
                  <StepPreview step={index} />
                </section>
              </CarouselItem>
            )
          })}
        </CarouselContent>
      </Carousel>

      <footer className="shrink-0 border-t px-4 py-3 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4">
          <Button variant="outline" onClick={() => carouselApi?.scrollPrev()} disabled={step === 0} className="sm:justify-self-start"><ArrowLeft />上一步</Button>
          <Button onClick={lastStep ? finish : () => carouselApi?.scrollNext()} className="sm:justify-self-end">{lastStep ? "进入用户中心" : "下一步"}<ArrowRight /></Button>
        </div>
      </footer>
    </main>
  )
}
