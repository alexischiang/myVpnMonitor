import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { fetchJson } from "@/api"
import { ChangelogFeed, type ChangelogEntry, type ChangelogKindOption, type ChangelogMonth } from "@/components/arc/blocks/changelog-feed/changelog-feed"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Timeline, type TimelineEvent } from "@/components/arc/timeline/timeline"
import { BentoButton } from "@/components/features/bento-button"
import { BentoCard, type BentoRowSpan, type BentoSpan } from "@/components/features/bento-card"

/** A changelog tag (an entry's kind) as the admin defines it. */
export interface ChangelogTag {
  id: string
  label: string
  color: ChangelogTagColor
}

/** One release note as /api/public/changelog returns it: content already split into a summary line and detail lines. */
export interface ChangelogItem {
  id: string
  title: string
  kind: string
  summary: string
  details: string[]
  publishedAt: string
}

/** Colour keys stored on a tag (kept in sync with CHANGELOG_TAG_COLORS in server.js), each mapped to theme tokens so it follows light and dark. */
export const changelogTagColors = {
  accent: { label: "主色", fill: "var(--accent)", tick: "var(--accent-foreground)" },
  muted: { label: "灰色", fill: "var(--text-muted)", tick: "var(--background)" },
  success: { label: "绿色", fill: "var(--success)", tick: "var(--background)" },
  warning: { label: "黄色", fill: "var(--warning)", tick: "var(--background)" },
  danger: { label: "红色", fill: "var(--danger)", tick: "var(--background)" },
  blue: { label: "蓝色", fill: "var(--series-1)", tick: "var(--background)" },
  purple: { label: "紫色", fill: "var(--series-2)", tick: "var(--background)" },
  orange: { label: "橙色", fill: "var(--series-3)", tick: "var(--background)" },
  teal: { label: "青色", fill: "var(--series-4)", tick: "var(--background)" },
} as const

export type ChangelogTagColor = keyof typeof changelogTagColors

export function changelogTagFill(color: string) {
  return (changelogTagColors[color as ChangelogTagColor] ?? changelogTagColors.muted).fill
}

/** A small dot in the tag's colour, for lists and markers. */
export function ChangelogTagDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={className ?? "inline-block size-2 shrink-0 rounded-full"} style={{ background: changelogTagFill(color) }} />
}

const TIME_ZONE = "Asia/Shanghai"
const monthKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" })
const dayFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: TIME_ZONE, month: "numeric", day: "numeric" })
const isoDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })

/** Maps API items (newest first) onto the changelog feed: months in China time, the label as "10月 2026" so the feed shows the month large and the year muted. */
function toFeed(items: ChangelogItem[]): { entries: ChangelogEntry[]; months: ChangelogMonth[] } {
  const months = new Map<string, ChangelogMonth>()
  const entries = items.map(item => {
    const date = new Date(item.publishedAt)
    const key = monthKeyFormat.format(date)
    const [year, month] = key.split("-")
    if (!months.has(key)) months.set(key, { key, label: `${Number(month)}月 ${year}`, short: `${Number(month)}月` })
    return { id: item.id, month: key, date: dayFormat.format(date), iso: isoDayFormat.format(date), kind: item.kind, title: item.title, summary: item.summary, details: item.details }
  })
  return { entries, months: [...months.values()] }
}

function useChangelog(limit?: number) {
  const [data, setData] = React.useState<{ tags: ChangelogTag[]; entries: ChangelogItem[] } | null>(null)
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let active = true
    fetchJson<{ tags: ChangelogTag[]; entries: ChangelogItem[] }>(`/api/public/changelog${limit ? `?limit=${limit}` : ""}`)
      .then(value => { if (active) setData(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "更新日志加载失败") })
    return () => { active = false }
  }, [limit])
  return { data, error }
}

/** Height of the sticky user-centre header, so the feed's month bar sticks right under it. */
function useStickyHeaderHeight() {
  const [height, setHeight] = React.useState(0)
  React.useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-account-shell] > header")
    if (!header) return
    const update = () => setHeight(header.offsetHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  return height
}

export function AccountChangelogPage() {
  const { data, error } = useChangelog()
  const stickyTop = useStickyHeaderHeight()
  const feed = React.useMemo(() => toFeed(data?.entries ?? []), [data])
  // Only tags with entries become filter chips.
  const kinds = React.useMemo<ChangelogKindOption[]>(() => (data?.tags ?? []).filter(tag => data?.entries.some(entry => entry.kind === tag.id)).map(tag => {
    const color = changelogTagColors[tag.color] ?? changelogTagColors.muted
    return { id: tag.id, label: tag.label, color: color.fill, tick: color.tick }
  }), [data])
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <Skeleton lines={6} />
  const latest = data.entries[0]
  return <ChangelogFeed
    fill
    autoHeight
    stickyTop={stickyTop}
    kinds={kinds}
    entries={feed.entries}
    months={feed.months}
    title="更新日志"
    subtitle={latest ? `最近更新：${latest.title}（${dayFormat.format(new Date(latest.publishedAt))}）` : "我们发布的新功能、优化和修复都会记录在这里。"}
    endNote={`以上是全部 ${data.entries.length} 条更新。`}
    emptyNote="暂无更新，敬请期待。"
    subscribe={false}
  />
}

/** Overview card: the latest release notes on Arc's timeline, each row expanding to its details. */
export function ChangelogTimelineCard({ span = 8, rowSpan = 2, className }: { span?: BentoSpan; rowSpan?: BentoRowSpan; className?: string }) {
  const { data, error } = useChangelog(6)
  const [now] = React.useState(() => Date.now())
  const events = React.useMemo<TimelineEvent[]>(() => (data?.entries ?? []).map(item => {
    const tag = data?.tags.find(candidate => candidate.id === item.kind)
    return {
      id: item.id,
      at: item.publishedAt,
      title: item.title,
      meta: `${tag?.label ?? item.kind} · ${item.summary}`,
      icon: <ChangelogTagDot color={tag?.color ?? "muted"} className="inline-block size-2.5 rounded-full" />,
      detail: item.details.length ? <ul className="grid list-disc gap-1 pl-4 text-sm text-muted-foreground">{item.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul> : undefined,
    }
  }), [data])
  if (data && data.entries.length === 0) return null
  return <BentoCard span={span} rowSpan={rowSpan} className={className} title="更新日志" action={<BentoButton asChild variant="secondary" size="sm"><Link to="/account/changelog">查看全部<ArrowRight /></Link></BentoButton>}>
    {error ? <p className="text-sm text-destructive">{error}</p>
      : !data ? <Skeleton lines={4} />
      : <Timeline events={events} now={now} label="最近更新" locale="zh-CN" timeZone={TIME_ZONE} maxHeight={320} headingLevel={4} />}
  </BentoCard>
}
