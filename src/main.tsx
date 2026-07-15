import { useEffect } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { ThemeProvider } from "next-themes"

import "./styles.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { DataProvider } from "@/components/features/data-provider"
import { AppShell } from "@/components/features/app-shell"
import { DashboardPage } from "@/components/features/dashboard"
import { SubscriptionsPage } from "@/components/features/subscriptions"
import { UsersPage } from "@/components/features/users"
import { BillDetailPage, BillsPage } from "@/components/features/bills"
import { SubscriptionDetailPage, UserDetailPage } from "@/components/features/details"
import { EmbyPage } from "@/components/features/emby"
import { PricingSettingsPage } from "@/components/features/pricing-settings"
import { SalesSettingsPage } from "@/components/features/sales-settings"
import { SubconverterPage } from "@/components/features/subconverter"
import { CheckoutPage, DeliveryPage, PricingPage } from "@/components/features/public-pages"
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "@/components/features/auth-pages"
import { AccountShell } from "@/components/features/account-shell"
import { AccountDocsPage, AccountOrderDetailPage, AccountOrdersPage, AccountOverviewPage, AccountSettingsPage, PaymentResultPage } from "@/components/features/account-pages"

function ProtectedApp() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  )
}

function ScrollToTop() {
  const { pathname, search } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname, search])
  return null
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="themeMode">
      <TooltipProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/delivery/:token" element={<DeliveryPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/buy" element={<PricingPage />} />
            <Route path="/account" element={<AccountShell />}>
              <Route index element={<AccountOverviewPage />} />
              <Route path="subscription" element={<Navigate to="/account" replace />} />
              <Route path="docs" element={<AccountDocsPage />} />
              <Route path="plans" element={<PricingPage />} />
              <Route path="plans/checkout" element={<CheckoutPage />} />
              <Route path="orders" element={<AccountOrdersPage />} />
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
              <Route path="bills" element={<BillsPage />} />
              <Route path="bills/:id" element={<BillDetailPage />} />
              <Route path="pricing-settings" element={<PricingSettingsPage />} />
              <Route path="sales-settings" element={<SalesSettingsPage />} />
              <Route path="emby" element={<EmbyPage />} />
              <Route path="subconverter" element={<SubconverterPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
