import { BadgeCheck } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type AccountType = "regular" | "super" | "family" | "business"
type VerifiedAccountType = Exclude<AccountType, "regular">

const accountStyles: Record<VerifiedAccountType, { label: string; className: string }> = {
  super: { label: "超级账户", className: "fill-amber-500" },
  family: { label: "亲友账户", className: "fill-emerald-500" },
  business: { label: "企业账户", className: "fill-blue-500" },
}

export function AccountVerificationIcon({ type }: { type: AccountType }) {
  if (type === "regular") return null

  const account = accountStyles[type]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <BadgeCheck
          className={`size-5 shrink-0 text-transparent ${account.className} [&>path:last-child]:origin-center [&>path:last-child]:scale-125 [&>path:last-child]:stroke-white`}
          role="img"
          aria-label={`${account.label}认证`}
          tabIndex={0}
        />
      </TooltipTrigger>
      <TooltipContent>{account.label}</TooltipContent>
    </Tooltip>
  )
}
