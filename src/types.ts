export type Status = "ok" | "expiring" | "invalid" | "low_traffic" | "depleted" | "warning" | "expired" | "error" | "unknown" | string

export type Subscription = {
  id: string
  name?: string
  email?: string
  url: string
  sourceType?: "url" | "manual" | "yaml"
  manualContent?: string
  provider?: string
  serviceProvider?: string
  serviceProviderRating?: VendorRating | null
  note?: string
  enabled?: boolean
  excludeFromAutoSwitch?: boolean
  useCachedConfigForFallback?: boolean
  manualTrafficDepleted?: boolean
  accountStatus?: "unclaimed" | "invited" | "active" | "disabled"
  accountId?: string
  referralCode?: string
  referralRate?: number
  recurringReferral?: boolean
  status?: Status
  httpStatus?: number | string | null
  lastCheckedAt?: string | null
  lastError?: string | null
  customerCount?: number
  maxUsers?: number
  allowedGroups?: string[]
  metrics?: {
    totalBytes?: number
    usedBytes?: number
    remainingBytes?: number
    expireAt?: string
  } | null
}

export type VendorRating = "S" | "A" | "B" | "C"

export type PoolCompatibility = {
  status: "high" | "usable" | "adjust" | "unknown" | "incompatible"
  statusText: string
  reasons: string[]
  provider?: string
  rating?: VendorRating | null
  poolExpiresAt?: string | null
  expiryDiffDays?: number | null
  customerCount?: number
  maxUsers?: number
  groupAllowed?: boolean
  binding?: {
    type: "manual" | "system"
    at?: string | null
  } | null
  recommendedPool?: {
    id: string
    label: string
    provider?: string
    rating?: VendorRating | null
    expiryDiffDays?: number | null
  } | null
}

export type User = {
  id: string
  customerID: number
  registeredOnly?: boolean
  accountId?: string
  createdAt?: string
  accountStatus?: "unclaimed" | "invited" | "active" | "disabled"
  userId?: string
  wechatName?: string
  imessage?: string
  email?: string
  subscriptionId?: string
  lineType?: "upstream" | "self_hosted"
  xuiClientEmail?: string
  xuiSubId?: string
  xuiManagementMode?: "import" | "link"
  xuiMigrationStatus?: "completed" | "activation_required" | "failed"
  xuiMigrationSource?: "linked_existing" | "created"
  xuiMigrationError?: string
  xuiMigratedAt?: string
  xuiMigrationUpdatedAt?: string
  xuiClientPresent?: boolean
  xuiClientMissingAt?: string
  xuiRecoveredAt?: string
  xuiIpLimit?: number
  xuiTrafficLimitBytes?: number
  xuiTrafficResetAnchorDay?: number
  xuiTrafficCycleKey?: string
  xuiTrafficBaselinePending?: boolean
  xuiTrafficBaselineVersion?: number
  xuiNextTrafficResetAt?: string
  xuiLastTrafficResetAt?: string
  xuiLastSyncedAt?: string
  xuiLastError?: string
  xuiWeightedTraffic?: {
    rawUsedBytes: number
    usedBytes: number
    totalBytes: number
    remainingBytes: number | null
    usagePercent: number | null
    depleted: boolean
    lastSyncedAt?: string
    nodes: Array<{ key: string; name: string; multiplier: number; rawBytes: number; weightedBytes: number }>
  }
  subscription?: Subscription
  activeGroup?: string
  deviceLimit?: number
  isBusiness?: boolean
  isFamilyFriend?: boolean
  isSuperAccount?: boolean
  unlimited?: boolean
  currentProductId?: string
  currentOptionId?: string
  currentProductOrderId?: string
  currentProductSource?: string
  currentProductBoundAt?: string
  currentProductSnapshot?: Record<string, unknown>
  vipLevel?: string
  duration?: string
  purchasedAt?: string
  planExpiresAt?: string
  expiresAt?: string
  giftedDays?: number
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
  poolCompatibility?: PoolCompatibility | null
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
    totalAmount?: number
    walletAmount?: number
    walletCashAmount?: number
    walletGiftAmount?: number
    paidAt?: string
  } | null
}

export type Vendor = {
  id: string
  name: string
  overrideExclude?: string
  overrideInclude?: string
  overrideRename?: string
  rating?: VendorRating | ""
}

export type Preset = {
  id: string
  target?: string
  config?: string
  postSubconverter?: boolean
  nextinCompatible?: boolean
  emoji?: boolean
  udp?: boolean
  tfo?: boolean
  scv?: boolean
  sort?: boolean
  list?: boolean
  fdn?: boolean
  insert?: boolean
  expand?: boolean
  classic?: boolean
  new_name?: boolean
  append_type?: boolean
  append_info?: boolean
  strict?: boolean
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
  trafficBytes?: number
  lineType?: "upstream" | "self_hosted"
  enabled?: boolean
  stock?: number
  recurringDeleted?: boolean
  lifetimeName?: string
  lifetimeTitle?: string
  lifetimeDescription?: string
  lifetimeTraffic?: string
  lifetimeTrafficBytes?: number
  lifetimePrice?: number
  lifetimeDevices?: number
  lifetimeEnabled?: boolean
  lifetimeStock?: number
  lifetimeRecommended?: boolean
  lifetimeFeatures?: string[]
  lifetimeUnavailableFeatures?: string[]
  lifetimeDeleted?: boolean
  productKind?: "plan" | "addon" | "custom"
  internal?: boolean
  trafficBaseGb?: number
  trafficMaxTier?: number
  trafficTierMarkupPercent?: number
  addonType?: "traffic_pack" | "home_ip" | "manual"
  addonPrice?: number
  addonUnit?: string
  addonTrafficGb?: number
  addonDurationDays?: number
  addonRegions?: Array<{ id: string; name: string; price: number }>
  addonDeliveryMode?: "automatic" | "manual"
  addonDeliveryDescription?: string
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

export type XuiInboundGroups = Record<string, number[]>

export type XuiInboundMetadata = Record<string, {
  networkLevel: "premium" | "optimized" | "standard" | ""
  region: string
}>

export type XuiInboundManagement = {
  configured: boolean
  groups: XuiInboundGroups
  metadata: XuiInboundMetadata
  inbounds: Array<{
    id: number
    key: string
    name: string
    tag: string
    protocol: string
    port: number | null
    enabled: boolean
    recentlyActive: boolean | null
    nodeGuid: string
    nodeName: string
    clientCount: number
    networkLevel: "premium" | "optimized" | "standard" | ""
    region: string
  }>
}

export type XuiPresence = {
  configured: boolean
  checkedAt: string
  onlineEmails: string[]
  onlineByGuid: Record<string, string[]>
  lastOnline: Record<string, number>
  nodeNames: Record<string, string>
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

export type MarkdownDocumentSetting = {
  id: string
  category: string
  title: string
  description: string
  content: string
  enabled: boolean
}

export type SalesSettings = {
  id: string
  registrationMode: "open" | "invite_only" | "disabled"
  coupons: CouponSetting[]
  faqs: FaqSetting[]
  announcements: AnnouncementSetting[]
  advertisements: MarkdownDocumentSetting[]
}

export type PaymentSettings = {
  id: string
  name: string
  displayName: string
  provider: "legacy" | "xinhui" | "test"
  enabled: boolean
  priority: number
  apiBaseUrl: string
  merchantId: string
  merchantSecret?: string
  merchantSecretConfigured: boolean
  alipayChannelCode: string
  wechatChannelCode: string
  alipayEnabled: boolean
  wechatEnabled: boolean
  notifyUrl: string
  returnUrl: string
}

export type AppMeta = {
  version?: string
  updatedAt?: string
}
