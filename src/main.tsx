import { lazy, Suspense, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { ThemeProvider } from "next-themes"

import "./styles.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { DataProvider } from "@/components/features/data-provider"
import { AppShell } from "@/components/features/app-shell"

const DashboardPage = lazy(() => import("@/components/features/dashboard").then(module => ({ default: module.DashboardPage })))
const SubscriptionsPage = lazy(() => import("@/components/features/subscriptions").then(module => ({ default: module.SubscriptionsPage })))
const UsersPage = lazy(() => import("@/components/features/users").then(module => ({ default: module.UsersPage })))
const OrdersPage = lazy(() => import("@/components/features/bills").then(module => ({ default: module.OrdersPage })))
const OrderDetailPage = lazy(() => import("@/components/features/bills").then(module => ({ default: module.OrderDetailPage })))
const SubscriptionDetailPage = lazy(() => import("@/components/features/details").then(module => ({ default: module.SubscriptionDetailPage })))
const UserDetailPage = lazy(() => import("@/components/features/details").then(module => ({ default: module.UserDetailPage })))
const EmbyPage = lazy(() => import("@/components/features/emby").then(module => ({ default: module.EmbyPage })))
const PricingSettingsPage = lazy(() => import("@/components/features/pricing-settings").then(module => ({ default: module.PricingSettingsPage })))
const SalesSettingsPage = lazy(() => import("@/components/features/sales-settings").then(module => ({ default: module.SalesSettingsPage })))
const PaymentSettingsPage = lazy(() => import("@/components/features/payment-settings").then(module => ({ default: module.PaymentSettingsPage })))
const StatusPage = lazy(() => import("@/components/features/status-page").then(module => ({ default: module.StatusPage })))
const SubconverterPage = lazy(() => import("@/components/features/subconverter").then(module => ({ default: module.SubconverterPage })))
const CheckoutPage = lazy(() => import("@/components/features/public-pages").then(module => ({ default: module.CheckoutPage })))
const DeliveryPage = lazy(() => import("@/components/features/public-pages").then(module => ({ default: module.DeliveryPage })))
const PricingPage = lazy(() => import("@/components/features/public-pages").then(module => ({ default: module.PricingPage })))
const ForgotPasswordPage = lazy(() => import("@/components/features/auth-pages").then(module => ({ default: module.ForgotPasswordPage })))
const LoginPage = lazy(() => import("@/components/features/auth-pages").then(module => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import("@/components/features/auth-pages").then(module => ({ default: module.RegisterPage })))
const ResetPasswordPage = lazy(() => import("@/components/features/auth-pages").then(module => ({ default: module.ResetPasswordPage })))
const AccountShell = lazy(() => import("@/components/features/account-shell").then(module => ({ default: module.AccountShell })))
const AccountOnboardingPage = lazy(() => import("@/components/features/account-onboarding").then(module => ({ default: module.AccountOnboardingPage })))
const AccountDocsPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.AccountDocsPage })))
const AccountOrderDetailPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.AccountOrderDetailPage })))
const AccountOrdersPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.AccountOrdersPage })))
const AccountOverviewPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.AccountOverviewPage })))
const AccountReferralPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.AccountReferralPage })))
const AccountSettingsPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.AccountSettingsPage })))
const AccountWalletPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.AccountWalletPage })))
const PaymentResultPage = lazy(() => import("@/components/features/account-pages").then(module => ({ default: module.PaymentResultPage })))

if (import.meta.env.DEV) document.title = `[LOCAL] ${document.title}`

function ProtectedApp() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  )
}

function ScrollToTop() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => document.scrollingElement?.scrollTo({ top: 0, left: 0 }))
    return () => window.cancelAnimationFrame(frame)
  }, [pathname, search])
  return null
}

function AuthCrispChat() {
  const { pathname } = useLocation()
  const visible = pathname === "/login" || pathname === "/register"
  useEffect(() => {
    if (!visible) return
    const crispWindow = window as typeof window & { $crisp?: { push(command: ["do", "chat:show" | "chat:hide" | "session:reset"]): number }; CRISP_WEBSITE_ID?: string }
    crispWindow.$crisp ||= []
    crispWindow.CRISP_WEBSITE_ID = "149a15d1-aa5b-471e-9da6-fa37c8b17f68"
    crispWindow.$crisp.push(["do", "session:reset"])
    crispWindow.$crisp.push(["do", "chat:show"])
    if (!document.querySelector('script[src="https://client.crisp.chat/l.js"]')) {
      const script = document.createElement("script")
      script.src = "https://client.crisp.chat/l.js"
      script.async = true
      document.head.appendChild(script)
    }
    return () => { crispWindow.$crisp?.push(["do", "chat:hide"]) }
  }, [visible])
  return null
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="themeMode">
      <TooltipProvider>
        <BrowserRouter>
          <ScrollToTop />
          <AuthCrispChat />
          <Suspense fallback={<Skeleton className="m-6 min-h-24" />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/delivery/:token" element={<DeliveryPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/buy" element={<PricingPage />} />
            <Route path="/onboarding" element={<AccountOnboardingPage />} />
            <Route path="/account" element={<AccountShell />}>
              <Route index element={<AccountOverviewPage />} />
              <Route path="subscription" element={<Navigate to="/account" replace />} />
              <Route path="docs" element={<AccountDocsPage />} />
              <Route path="plans" element={<PricingPage />} />
              <Route path="plans/checkout" element={<CheckoutPage />} />
              <Route path="orders" element={<AccountOrdersPage />} />
              <Route path="wallet" element={<AccountWalletPage />} />
              <Route path="referrals" element={<AccountReferralPage />} />
              <Route path="orders/:id" element={<AccountOrderDetailPage />} />
              <Route path="settings" element={<AccountSettingsPage />} />
              <Route path="profile" element={<Navigate to="/account/settings" replace />} />
              <Route path="security" element={<Navigate to="/account/settings" replace />} />
              <Route path="payment/result" element={<PaymentResultPage />} />
            </Route>
            <Route path="/" element={<ProtectedApp />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="urls" element={<SubscriptionsPage />} />
              <Route path="urls/detail/:id" element={<SubscriptionDetailPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/detail/:id" element={<UserDetailPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="bills" element={<Navigate to="/orders" replace />} />
              <Route path="pricing-settings" element={<PricingSettingsPage />} />
              <Route path="sales-settings" element={<SalesSettingsPage />} />
              <Route path="payment-settings" element={<PaymentSettingsPage />} />
              <Route path="emby" element={<EmbyPage />} />
              <Route path="subconverter" element={<SubconverterPage />} />
            </Route>
            <Route path="*" element={<StatusPage code="404" title="页面不存在" description="没有找到你访问的页面，它可能已被移动或删除。" />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
