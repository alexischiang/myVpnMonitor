import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, Users } from "lucide-react"

import { apiFetch, fetchJson, postJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusPage } from "@/components/features/status-page"

type AuthResponse = { role?: "admin" | "user" }
type PublicSettings = { registrationMode: "open" | "invite_only" | "disabled"; onboardingEnabled: boolean }

function AuthLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="flex flex-col gap-4 p-6 md:p-10">
        <Link to="/pricing" className="inline-flex w-fit items-end text-base font-semibold">NEXORA<span className="text-[10px] font-bold leading-none text-muted-foreground">.beta</span></Link>
        <div className="flex flex-1 items-center justify-center">
          <div className="grid w-full max-w-sm gap-6">
            <header className="grid gap-2 text-center">
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </header>
            {children}
          </div>
        </div>
      </section>
      <section className="relative hidden bg-muted lg:block">
        <img
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=85"
          alt="全球网络连接"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-50"
        />
      </section>
    </main>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [account, setAccount] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [remember, setRemember] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    void apiFetch("/api/health").catch(() => undefined)
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const result = await postJson<AuthResponse>("/api/auth/login", { account, password, remember })
      const returnTo = searchParams.get("returnTo")
      const onboardingEnabled = result.role === "user" && (await fetchJson<PublicSettings>("/api/public/sales-settings").catch(() => ({ onboardingEnabled: true } as PublicSettings))).onboardingEnabled
      navigate(returnTo?.startsWith("/") ? returnTo : result.role === "admin" ? "/dashboard" : onboardingEnabled ? "/onboarding" : "/account", { replace: true })
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="登录账户" description="使用邮箱和密码进入账户中心">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-2"><Label htmlFor="account">邮箱</Label><Input id="account" autoFocus autoComplete="username" value={account} onChange={event => setAccount(event.target.value)} required /></div>
        <div className="grid gap-2">
          <div className="flex items-center"><Label htmlFor="password">密码</Label><Link to="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">忘记密码？</Link></div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
        </div>
        <div className="flex items-center gap-2"><Checkbox id="remember" checked={remember} onCheckedChange={checked => setRemember(checked === true)} /><Label htmlFor="remember">记住我，30 天内免登录</Label></div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={loading}>{loading ? <><Loader2 className="animate-spin" />登录中</> : "登录"}</Button>
        <p className="text-center text-sm">还没有账户？ <Link to="/register" className="underline underline-offset-4">立即注册</Link></p>
      </form>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [registrationMode, setRegistrationMode] = React.useState<"open" | "invite_only" | "disabled">("open")
  const [onboardingEnabled, setOnboardingEnabled] = React.useState(true)
  const [referralCode, setReferralCode] = React.useState(() => searchParams.get("ref") || "")
  const [inviterLabel, setInviterLabel] = React.useState("")
  const [referralError, setReferralError] = React.useState("")
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const emailInvalid = email.trim().length > 0 && !emailValid
  const passwordTooShort = password.length > 0 && password.length < 8
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword
  const canSubmit = registrationMode !== "disabled" && emailValid && password.length >= 8 && confirmPassword.length >= 8 && !passwordMismatch && (registrationMode !== "invite_only" || referralCode.length > 0) && !loading

  React.useEffect(() => {
    void fetchJson<PublicSettings>("/api/public/sales-settings")
      .then(result => { setRegistrationMode(result.registrationMode); setOnboardingEnabled(result.onboardingEnabled) })
      .catch(() => undefined)
  }, [])

  React.useEffect(() => {
    let active = true
    setInviterLabel("")
    setReferralError("")
    if (!/^\d{6}$/.test(referralCode)) {
      if (searchParams.has("ref")) setReferralError("该邀请码无效，请核对")
      return
    }
    void fetchJson<{ inviterLabel: string }>(`/api/public/referrals/${referralCode}`)
      .then(result => { if (active) setInviterLabel(result.inviterLabel) })
      .catch(error => {
        if (active && error instanceof Error && error.message === "邀请码无效") setReferralError("该邀请码无效，请核对")
      })
    return () => { active = false }
  }, [referralCode, searchParams])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (passwordMismatch) return
    setLoading(true)
    setError("")
    try {
      await postJson("/api/auth/register", { email, password, referralCode })
      navigate(onboardingEnabled ? "/onboarding" : "/account", { replace: true })
    } catch (error) {
      setError(error instanceof Error ? error.message : "注册失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="创建账户" description={registrationMode === "invite_only" ? "本站仅接受邀请制注册，请向推荐你的好友询问邀请码。" : registrationMode === "disabled" ? "当前暂时不开放注册" : "请输入有效的邮箱"}>
      {registrationMode === "disabled" ? <FieldError>当前暂时不开放注册</FieldError> : null}
      {inviterLabel ? <Alert variant="success"><Users aria-hidden="true" /><AlertDescription><span className="whitespace-nowrap">您正在接受来自 <strong>{inviterLabel}</strong> 的邀请</span></AlertDescription></Alert> : null}
      {referralError ? <Alert variant="error"><AlertDescription>{referralError}</AlertDescription></Alert> : null}
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-2"><Label htmlFor="email">邮箱</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setError("") }} aria-invalid={emailInvalid} required /><FieldError>{emailInvalid ? "请输入有效邮箱。" : null}</FieldError></div>
        <div className="grid gap-2"><Label htmlFor="new-password">密码</Label><Input id="new-password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} aria-invalid={passwordTooShort} required /><FieldError>{passwordTooShort ? "密码至少需要 8 位。" : null}</FieldError></div>
        <div className="grid gap-2"><Label htmlFor="confirm-password">确认密码</Label><Input id="confirm-password" type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} aria-invalid={passwordMismatch} required /><FieldError>{passwordMismatch ? "两次输入的密码不一致。" : null}</FieldError></div>
        <div className="grid gap-2"><Label htmlFor="referral-code">邀请码{registrationMode === "invite_only" ? "" : "（可选）"}</Label><Input id="referral-code" inputMode="numeric" placeholder={registrationMode === "invite_only" ? "必填邀请码" : undefined} required={registrationMode === "invite_only"} maxLength={6} value={referralCode} onChange={event => setReferralCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={!canSubmit}>{loading ? <><Loader2 className="animate-spin" />注册中</> : "注册"}</Button>
        <p className="text-center text-sm">已有账户？ <Link to="/login" className="underline underline-offset-4">返回登录</Link></p>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const result = await postJson<{ message: string }>("/api/auth/forgot-password", { email })
      setMessage(result.message)
    } catch (error) {
      setError(error instanceof Error ? error.message : "发送失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="忘记密码" description="我们会向账户邮箱发送重置链接">
      {message ? <div className="grid gap-4 text-center"><p className="text-sm text-muted-foreground">{message}</p><Button asChild><Link to="/login">返回登录</Link></Button></div> : (
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-2"><Label htmlFor="email">邮箱</Label><Input id="email" type="email" autoFocus value={email} onChange={event => setEmail(event.target.value)} required /></div>
          <FieldError>{error}</FieldError>
          <Button type="submit" disabled={loading}>{loading ? <><Loader2 className="animate-spin" />发送中</> : "发送重置链接"}</Button>
          <Button asChild variant="ghost"><Link to="/login">返回登录</Link></Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [tokenStatus, setTokenStatus] = React.useState<"checking" | "valid" | "invalid">("checking")

  React.useEffect(() => {
    postJson("/api/auth/token-status", { token }).then(() => setTokenStatus("valid")).catch(() => setTokenStatus("invalid"))
  }, [token])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirmPassword) return setError("两次输入的密码不一致。")
    setLoading(true)
    setError("")
    try {
      await postJson("/api/auth/reset-password", { token, password })
      navigate("/login", { replace: true })
    } catch (error) {
      setError(error instanceof Error ? error.message : "重置失败")
    } finally {
      setLoading(false)
    }
  }

  if (tokenStatus === "invalid") return <StatusPage code="410" title="链接已过期" description="该认领链接已失效或已被使用，请联系管理员重新发送。" />
  if (tokenStatus === "checking") return <main className="grid min-h-svh place-items-center"><Loader2 className="animate-spin" aria-label="正在验证链接" /></main>
  return (
    <AuthLayout title="设置新密码" description="链接有效期为 30 分钟，使用后立即失效">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-2"><Label htmlFor="password">新密码</Label><Input id="password" type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></div>
        <div className="grid gap-2"><Label htmlFor="confirm-password">确认密码</Label><Input id="confirm-password" type="password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={loading}>{loading ? <><Loader2 className="animate-spin" />提交中</> : "保存新密码"}</Button>
      </form>
    </AuthLayout>
  )
}
