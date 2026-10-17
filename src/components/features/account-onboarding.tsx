import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Laptop, Link2, MonitorSmartphone, Percent, ShieldCheck, Smartphone, Users } from "lucide-react"

import { fetchJson } from "@/api"
import { Stepper } from "@/components/arc/stepper/stepper"
import { Progress } from "@/components/arc/progress/progress"
import { Separator } from "@/components/ui/separator"
import { VipBadge, vipLevelLabel, type VipTier } from "@/components/features/vip-badge"
import { formatMoney } from "@/utils"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Input } from "@/components/arc/input/input"
import { Card as ArcCard } from "@/components/arc/card/card"

const steps = [
  {
    title: "先选择适合你的套餐",
    description: "从左侧边栏点击“购买服务”，在基础套餐服务中选择套餐和使用周期并完成付款。付款成功后，订阅会自动出现在用户中心。",
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
    description: "充值和直接付款（套餐、流量包、附加服务）都会累计 VIP 消费，使用余额付款的部分不重复累计。",
  },
  {
    title: "分享邀请，获得返利",
    description: "在 [邀请返利] 页面复制邀请链接。好友通过邀请链接首次购买套餐后，你会获得返利。",
  },
]

function vipTierSummary(tiers: VipTier[]) {
  return tiers.filter(tier => tier.minSpend > 0).map(tier => `累计 ${formatMoney(tier.minSpend)} 升至 ${vipLevelLabel(tier.level)}，享 ${tier.discountPercent}% 专属折扣`).join("；")
}

function VipStepPreview({ tiers }: { tiers: VipTier[] }) {
  const top = tiers[tiers.length - 1]
  // Sample progress sits 60% of the way to the top tier.
  const sampleSpend = top ? Math.round(top.minSpend * 0.6) : 0
  return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6"><div className="grid gap-1.5"><p className="text-sm text-muted-foreground">VIP 成长</p><h3 className="text-lg font-medium">专属折扣随等级提升</h3></div>{tiers[1] ? <VipBadge level={tiers[1].level} /> : null}<div className="grid gap-4">
        <div className="grid gap-3 items-center gap-2" style={{ gridTemplateColumns: tiers.map(() => "1fr").join(" auto ") }}>
          {tiers.map((tier, index) => (
            <React.Fragment key={tier.level}>
              {index > 0 ? <ArrowRight className="size-4 text-muted-foreground" /> : null}
              <ArcCard className="justify-center" title={`${tier.discountPercent}% 折扣`} description={tier.minSpend > 0 ? `累计 ${formatMoney(tier.minSpend)}` : "起始等级"}><VipBadge level={tier.level} /></ArcCard>
            </React.Fragment>
          ))}
        </div>
        {top ? (
          <section className="grid gap-2" aria-label="VIP 成长进度示例">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums"><span>成长进度</span><span>{formatMoney(sampleSpend)} / {formatMoney(top.minSpend)}</span></div>
            <Progress value={60} />
            <p className="text-xs text-muted-foreground">当前等级和成长进度可在“总览”中查看。</p>
          </section>
        ) : null}
      </div></Card>
  )
}

function StepPreview({ step, vipTiers }: { step: number; vipTiers: VipTier[] }) {
  if (step === 0) return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6" description="购买服务" title="选择适合你的套餐"><div className="grid gap-4">
        <ArcCard title="PRO · 高级套餐" description="每月 200G 流量 · 在线IP数量：5" headerAction={<><Badge>推荐</Badge></>} />
        <Separator />
        <p className="text-sm text-muted-foreground">选择计费周期</p>
        <div className="grid gap-3">
          <ArcCard title="月付 30 天" description="¥49.00 · 在线IP数量：3" headerAction={<><Badge>已选择</Badge></>} />
          <ArcCard title="年付 360 天" description="¥429.00 · 在线IP数量：5" headerAction={<><Badge tone="danger">-27%</Badge></>} />
        </div>
      </div></Card>
  )

  if (step === 3) return <VipStepPreview tiers={vipTiers} />

  if (step === 4) return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6" description="邀请返利" title="分享邀请，好友和你都受益"><div className="grid gap-3">
        <ArcCard title={<span className="flex items-center gap-2"><Users />邀请好友注册</span>} description="在邀请返利页面找到你的邀请链接。" />
        <ArcCard title={<span className="flex items-center gap-2"><Copy />分享专属链接</span>} description="好友通过你的链接购买套餐，你将获得佣金返利。" />
        <ArcCard title={<span className="flex items-center gap-2"><Percent />返利直接到账</span>} description="返利余额可在购买套餐时直接抵扣。" />
      </div></Card>
  )

  if (step === 1) return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6"><div className="grid gap-1.5"><p className="text-sm text-muted-foreground">当前订阅</p><h3 className="text-lg font-medium">STANDARD</h3></div><Badge tone="success"><CheckCircle2 />生效中</Badge><div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <ArcCard title="2026-12-31" description="当前到期" />
          <ArcCard title="5" description="在线IP数量" />
        </div>
        <Input label="订阅链接示例" hideLabel readOnly value="https://example.com/subscription/..." tabIndex={-1} />
        <Button variant="secondary" className="w-full" tabIndex={-1}><Link2 />复制订阅链接</Button>
      </div></Card>
  )

  return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6" description="使用文档" title="选择你的设备"><div className="grid gap-3 grid-cols-2">
          <ArcCard title={<span className="flex items-center gap-2"><Smartphone />iPhone / iPad</span>} description="Shadowrocket" />
          <ArcCard title={<span className="flex items-center gap-2"><Smartphone />Android</span>} description="移动端客户端" />
          <ArcCard title={<span className="flex items-center gap-2"><MonitorSmartphone />Windows</span>} description="桌面端客户端" />
          <ArcCard title={<span className="flex items-center gap-2"><Laptop />macOS</span>} description="桌面端客户端" />
        </div></Card>
  )
}

export function AccountOnboardingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [step, setStep] = React.useState(0)
  const [onboardingEnabled, setOnboardingEnabled] = React.useState<boolean | null>(null)
  const [vipTiers, setVipTiers] = React.useState<VipTier[]>([])

  React.useEffect(() => {
    fetchJson<{ onboardingEnabled: boolean; vipTiers?: VipTier[] }>("/api/public/sales-settings").then(settings => {
      setVipTiers(settings.vipTiers || [])
      setOnboardingEnabled(settings.onboardingEnabled)
      if (!settings.onboardingEnabled) navigate("/account", { replace: true })
    }).catch(() => setOnboardingEnabled(true))
  }, [navigate])

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

  function finish() {
    localStorage.setItem(`account-onboarding:${email}`, "1")
    navigate("/account", { replace: true })
  }

  if (!email || onboardingEnabled !== true) return <main className="grid h-svh place-items-center overflow-hidden p-6"><Skeleton lines={6} className="w-full max-w-5xl" /></main>

  const lastStep = step === steps.length - 1

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 sm:px-6 lg:px-10">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5" />NEXORA <Badge>使用入门</Badge></p>
        <Button variant="ghost" onClick={finish}>跳过</Button>
      </header>

      <div className="shrink-0 border-b px-4 py-3 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl"><Stepper label="使用引导进度" current={step} onStepSelect={setStep} details="current" steps={steps.map(item => ({ id: item.title, label: item.title }))} /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {steps.map((item, index) => {
          if (index !== step) return null
          const description = index === 3 && vipTiers.length ? `${item.description}${vipTierSummary(vipTiers)}。` : item.description
          return (
            <React.Fragment key={item.title}>
                <section className="mx-auto grid h-full w-full max-w-6xl content-center items-center gap-4 px-4 py-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:px-6 md:gap-8 lg:gap-16 lg:px-10">
                  <header className="grid gap-3">
                    <p className="text-4xl font-semibold tracking-tight text-muted-foreground md:text-6xl">Step {index + 1}</p>
                    <div className="grid gap-3">
                      <h1 className="max-w-xl text-2xl font-semibold tracking-tight md:text-4xl lg:text-5xl">{item.title}</h1>
                      <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-lg md:leading-7">{description}</p>
                    </div>
                  </header>
                  <StepPreview step={index} vipTiers={vipTiers} />
                </section>
            </React.Fragment>
          )
        })}
      </div>

      <footer className="shrink-0 border-t px-4 py-3 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4">
          <Button variant="secondary" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0} className="sm:justify-self-start"><ArrowLeft />上一步</Button>
          <Button onClick={lastStep ? finish : () => setStep(current => Math.min(steps.length - 1, current + 1))} className="sm:justify-self-end">{lastStep ? "进入用户中心" : "下一步"}<ArrowRight /></Button>
        </div>
      </footer>
    </main>
  )
}
