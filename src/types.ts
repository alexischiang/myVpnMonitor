export type Status = "ok" | "expiring" | "invalid" | "low_traffic" | "depleted" | "warning" | "expired" | "error" | "unknown" | string

export type Subscription = {
  id: string
  name?: string
  email?: string
  url: string
  provider?: string
  serviceProvider?: string
  note?: string
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
  userId?: string
  wechatName?: string
  imessage?: string
  email?: string
  subscriptionId?: string
  subscription?: Subscription
  activeGroup?: string
  vipLevel?: string
  duration?: string
  purchasedAt?: string
  expiresAt?: string
  actualPaid?: number
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
  userId?: string
  user?: User
  type?: string
  amount?: number
  duration?: string
  occurredAt?: string
  reversedAt?: string | null
  description?: string
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
  monthly?: number
  quarterly?: number
  half_yearly?: number
  yearly?: number
  monthlyDevices?: number
  quarterlyDevices?: number
  half_yearlyDevices?: number
  yearlyDevices?: number
}

export type AppMeta = {
  version?: string
  updatedAt?: string
}
