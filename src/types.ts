export type Status = "ok" | "expiring" | "invalid" | "low_traffic" | "depleted" | "warning" | "expired" | "error" | "unknown" | string

export type Subscription = {
  id: string
  name?: string
  email?: string
  url: string
  provider?: string
  serviceProvider?: string
  note?: string
  enabled?: boolean
  accountStatus?: "unclaimed" | "invited" | "active"
  status?: Status
  httpStatus?: number | string | null
  lastCheckedAt?: string | null
  lastError?: string | null
  customerCount?: number
  metrics?: {
    totalBytes?: number
    usedBytes?: number
    remainingBytes?: number
    expireAt?: string
  } | null
}

export type User = {
  id: string
  accountStatus?: "unclaimed" | "invited" | "active"
  userId?: string
  wechatName?: string
  imessage?: string
  email?: string
  subscriptionId?: string
  subscription?: Subscription
  activeGroup?: string
  unlimited?: boolean
  vipLevel?: string
  duration?: string
  purchasedAt?: string
  expiresAt?: string
  actualPaid?: number
  vipSpend?: number
  cost?: number
  deliveryToken?: string
  outputMode?: string
  relayPath?: string
  blockUserinfo?: boolean
  note?: string
  logs?: Array<Record<string, unknown>>
  userLogs?: UserLog[]
}

export type UserLog = {
  id: string
  at: string
  status?: string
  statusText?: string
  reason?: string
  reasonText?: string
  fromSubscriptionLabel?: string
  toSubscriptionLabel?: string
  message?: string
}

export type Bill = {
  id: string
  paymentOrderId?: string
  userId?: string
  user?: User
  type?: string
  amount?: number
  duration?: string
  occurredAt?: string
  reversedAt?: string | null
  description?: string
  payment?: {
    id: string
    merOrderTid: string
    planName: string
    optionLabel: string
    originalAmount: number
    discountAmount: number
    couponCode: string
    discountPercent: number
    vipLevel: string
    vipDiscountPercent: number
    vipDiscountAmount: number
    subtotal: number
    taxRate: number
    taxAmount: number
    cashCredit: number
    purchaseAction: "initial" | "extend" | "replace"
    channelCode: string
    amount: number
    paidAt?: string
  } | null
}

export type Vendor = {
  id: string
  name: string
  overrideExclude?: string
  overrideInclude?: string
  overrideRename?: string
}

export type Preset = {
  id: string
  target?: string
  config?: string
  emoji?: boolean
  udp?: boolean
  scv?: boolean
  sort?: boolean
}

export type PlaceholderNode = {
  id: string
  tag: string
  nodes: string[]
}

export type EmbyVendor = {
  id: string
  name: string
  website?: string
  servers?: Array<{ label?: string; url: string }>
  note?: string
}

export type EmbyUser = {
  id: string
  customerName: string
  embyVendorId?: string | null
  username: string
  password: string
  expiresAt?: string | null
  purchasedAt?: string
  cost?: number
  actualPaid?: number
  note?: string
}

export type PricingRow = {
  id?: string
  group: string
  name?: string
  title?: string
  description?: string
  recommended?: boolean
  traffic?: string
  features?: string[]
  unavailableFeatures?: string[]
  monthly?: number
  quarterly?: number
  half_yearly?: number
  yearly?: number
  unlimitedMonthly?: number
  unlimitedQuarterly?: number
  unlimitedHalfYearly?: number
  unlimitedYearly?: number
  monthlyDevices?: number
  quarterlyDevices?: number
  half_yearlyDevices?: number
  yearlyDevices?: number
}

export type CouponSetting = {
  id: string
  code: string
  percent: number
  enabled: boolean
  validFrom?: string
  validUntil?: string
  applicableGroups?: string[]
  applicableDurations?: string[]
  totalLimit?: number
  perAccountLimit?: number
  usedCount?: number
}

export type FaqSetting = {
  id: string
  question: string
  answer: string
  enabled?: boolean
}

export type AnnouncementSetting = {
  id: string
  title: string
  content: string
  publishedAt: string
  enabled: boolean
}

export type SalesSettings = {
  id: string
  coupons: CouponSetting[]
  faqs: FaqSetting[]
  announcements: AnnouncementSetting[]
}

export type AppMeta = {
  version?: string
  updatedAt?: string
}
