import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { apiFetch, fetchJson, postJson } from "@/api"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { LoginCentered } from "@/components/arc/blocks/login-centered/login-centered"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { NewPasswordField, PASSWORD_MIN_LENGTH } from "@/components/features/new-password-field"
import { NexoraLogo } from "@/components/features/nexora-logo"
import { StatusPage } from "@/components/features/status-page"

type AuthResponse = { role?: "admin" | "user" }
type PublicSettings = { registrationMode: "open" | "invite_only" | "disabled"; onboardingEnabled: boolean }

/** Shared frame of the sign-in, registration and password pages: Arc's centered login block with the page's own form inside. */
function AuthLayout({ view, title, description, switchPrompt, switchTo, switchLabel, children }: { view: string; title: string; description: string; switchPrompt?: string; switchTo?: string; switchLabel?: string; children: React.ReactNode }) {
  return (
    <main>
      <LoginCentered
        fullScreen
        label={title}
        view={view}
        brand={<NexoraLogo to="/pricing" />}
        switchPrompt={switchPrompt}
        switchAction={switchTo ? <Link to={switchTo}>{switchLabel}</Link> : undefined}
        title={title}
        description={description}
      >
        {children}
      </LoginCentered>
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
    void apiFetch("/api/health", { background: true }).catch(() => undefined)
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
    <AuthLayout view="login" title="登录账户" description="使用邮箱和密码进入账户中心" switchPrompt="还没有账户？" switchTo="/register" switchLabel="立即注册">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Input label="邮箱" name="account" autoFocus autoComplete="username" value={account} onChange={event => setAccount(event.target.value)} required />
        <PasswordField label="密码" name="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label="记住我，30 天内免登录" checked={remember} onCheckedChange={checked => setRemember(checked === true)} />
          <Button asChild variant="link" size="sm"><Link to="/forgot-password">忘记密码？</Link></Button>
        </div>
        <Alert tone="danger" title={error} open={Boolean(error)} />
        <ActionButton type="submit" className="w-full" label="登录" pendingLabel="登录中" pending={loading} />
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
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword
  const canSubmit = registrationMode !== "disabled" && emailValid && password.length >= PASSWORD_MIN_LENGTH && confirmPassword.length >= PASSWORD_MIN_LENGTH && !passwordMismatch && (registrationMode !== "invite_only" || referralCode.length > 0) && !loading

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
    <AuthLayout view="register" title="创建账户" description={registrationMode === "invite_only" ? "本站仅接受邀请制注册，请向推荐你的好友询问邀请码。" : registrationMode === "disabled" ? "当前暂时不开放注册" : "请输入有效的邮箱"} switchPrompt="已有账户？" switchTo="/login" switchLabel="返回登录">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Alert tone="danger" title="当前暂时不开放注册" open={registrationMode === "disabled"} />
        <Alert tone="success" title={`您正在接受来自 ${inviterLabel} 的邀请`} open={Boolean(inviterLabel)} />
        <Alert tone="danger" title={referralError} open={Boolean(referralError)} />
        <Input label="邮箱" name="email" type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setError("") }} error={emailInvalid ? "请输入有效邮箱。" : undefined} required />
        <NewPasswordField label="密码" value={password} onValueChange={setPassword} />
        <PasswordField label="确认密码" name="confirm-password" minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} error={passwordMismatch ? "两次输入的密码不一致。" : undefined} required />
        <Input label={`邀请码${registrationMode === "invite_only" ? "" : "（可选）"}`} name="referral-code" inputMode="numeric" placeholder={registrationMode === "invite_only" ? "必填邀请码" : undefined} required={registrationMode === "invite_only"} maxLength={6} value={referralCode} onChange={event => setReferralCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Alert tone="danger" title={error} open={Boolean(error)} />
        <ActionButton type="submit" className="w-full" label="注册" pendingLabel="注册中" pending={loading} disabled={!canSubmit} />
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
    <AuthLayout view={message ? "forgot-sent" : "forgot"} title="忘记密码" description={message || "我们会向账户邮箱发送重置链接"}>
      {message ? <Button asChild className="w-full"><Link to="/login">返回登录</Link></Button> : (
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <Input label="邮箱" name="email" type="email" autoFocus value={email} onChange={event => setEmail(event.target.value)} required />
          <Alert tone="danger" title={error} open={Boolean(error)} />
          <ActionButton type="submit" className="w-full" label="发送重置链接" pendingLabel="发送中" pending={loading} />
          <Button asChild variant="ghost" className="w-full"><Link to="/login">返回登录</Link></Button>
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
    <AuthLayout view="reset" title="设置新密码" description="链接有效期为 30 分钟，使用后立即失效">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <NewPasswordField label="新密码" value={password} onValueChange={setPassword} />
        <PasswordField label="确认密码" name="confirm-password" minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required />
        <Alert tone="danger" title={error} open={Boolean(error)} />
        <ActionButton type="submit" className="w-full" label="保存新密码" pendingLabel="提交中" pending={loading} />
      </form>
    </AuthLayout>
  )
}
