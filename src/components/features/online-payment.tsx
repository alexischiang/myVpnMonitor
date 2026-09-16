import * as React from "react"
import { ExternalLink, Info, Loader2 } from "lucide-react"
import { IconBrandAlipay, IconBrandWechat } from "@tabler/icons-react"
import { fetchJson, postJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/utils"
import { NoticeBadge } from "./notice-badge"
import type { PaymentOrder, PaymentPlatform } from "./cashier-types"

export function OnlinePayment({ invoice, disabled, onUpdated, onBusy }: {
  invoice: Pick<PaymentOrder, "id" | "amount" | "payUrl" | "paymentError" | "paymentProvider">;
  disabled: boolean; onUpdated: (order: PaymentOrder) => void; onBusy: (busy: boolean) => void
}) {
  const [platforms, setPlatforms] = React.useState<PaymentPlatform[]>([])
  const [platformId, setPlatformId] = React.useState("")
  const [method, setMethod] = React.useState("100")
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const busyRef = React.useRef(false)
  const [error, setError] = React.useState("")
  async function loadPlatforms() {
    setLoading(true)
    setError("")
    try {
      const available = (await fetchJson<PaymentPlatform[]>("/api/payments/platforms")).filter(item => item.ready && (item.methods.alipay || item.methods.wechat))
      setPlatforms(available)
      setPlatformId(available[0]?.id || "")
      setMethod(available[0]?.methods.alipay ? "100" : "200")
    } catch { setError("暂时无法加载付款方式，请重试或联系客服。") }
    finally { setLoading(false) }
  }
  React.useEffect(() => { void loadPlatforms() }, [])
  const platform = platforms.find(item => item.id === platformId)
  const paymentButtonClass = method === "100"
    ? "bg-[#1677ff] font-bold text-white hover:bg-[#0f69e8] focus-visible:ring-[#1677ff]/40"
    : "bg-[#07c160] font-bold text-white hover:bg-[#06ad56] focus-visible:ring-[#07c160]/40"

  async function start() {
    if (busyRef.current) return
    const paymentWindow = window.open("about:blank", "_blank")
    if (!paymentWindow) return setError("浏览器阻止了支付窗口，请允许弹出窗口后重试。")
    paymentWindow.opener = null
    busyRef.current = true
    setBusy(true)
    onBusy(true)
    setError("")
    try {
      const result = await postJson<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(invoice.id)}/start`, { paymentPlatformId: platformId, channelCode: method })
      if (!result.payUrl) throw new Error("支付渠道未返回支付链接，请稍后重试。")
      paymentWindow.location.href = result.payUrl
      onUpdated(result)
    } catch (cause) { paymentWindow.close(); setError(cause instanceof Error ? cause.message : "暂时无法发起付款，请重试。") }
    finally { busyRef.current = false; setBusy(false); onBusy(false) }
  }

  if (loading) return <Skeleton className="h-32 w-full" />
  return <section aria-label="付款方式" className="grid gap-3">
    {error || invoice.paymentError ? <Alert variant="warning"><AlertTitle>付款暂未完成</AlertTitle><AlertDescription>{error || invoice.paymentError}</AlertDescription></Alert> : null}
    {!platforms.length ? <><p className="text-sm text-muted-foreground">当前没有可用的线上付款渠道。订单已提交，你可以联系客服完成付款。</p><Button variant="outline" className="min-h-11" onClick={() => void loadPlatforms()}>重新加载付款方式</Button></> : <>
      {platforms.length > 1 ? <Field><FieldLabel>支付平台</FieldLabel><Select value={platformId} disabled={disabled || busy} onValueChange={id => { setPlatformId(id); setMethod(platforms.find(item => item.id === id)?.methods.alipay ? "100" : "200") }}><SelectTrigger className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{platforms.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field> : null}
      <NoticeBadge icon={Info} label="如无法支付请联系右下角客服" variant="info" />
      <RadioGroup aria-label="付款方式" value={method} onValueChange={setMethod} disabled={disabled || busy} className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        {platform?.methods.alipay ? <FieldLabel htmlFor="cashier-alipay" className="min-h-11 w-full cursor-pointer gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"><RadioGroupItem id="cashier-alipay" value="100" /><IconBrandAlipay className="size-5 text-[#1677ff]" />支付宝</FieldLabel> : null}
        {platform?.methods.wechat ? <FieldLabel htmlFor="cashier-wechat" className="min-h-11 w-full cursor-pointer gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"><RadioGroupItem id="cashier-wechat" value="200" /><IconBrandWechat className="size-5 text-[#07c160]" />微信</FieldLabel> : null}
      </RadioGroup>
      <Button className={`min-h-11 w-full ${paymentButtonClass}`} disabled={disabled || busy || !platform} onClick={() => void start()}>{busy ? <Loader2 className="animate-spin" /> : null}{busy ? "正在准备支付…" : `${method === "100" ? "支付宝" : "微信"}付款 ${formatMoney(invoice.amount)}`}</Button>
    </>}
    {invoice.payUrl ? <><Button asChild variant="outline" className="min-h-11 w-full"><a href={invoice.payUrl} target="_blank" rel="noreferrer"><ExternalLink />重新打开支付页面</a></Button><p className="text-xs text-muted-foreground">付款后返回本页，系统会继续确认收款状态。请勿重复付款。</p></> : null}
  </section>
}
