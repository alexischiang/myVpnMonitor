import { ArrowRight, Check, LoaderCircle, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const orangeScale = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "1000", "1100"] as const

export function OrangeButtonShowcasePage() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 py-4">
      <header className="grid gap-3 border-b pb-7">
        <Badge variant="outline" className="w-fit border-orange-500 bg-orange-100 text-orange-1100 dark:border-orange-700 dark:bg-orange-1100 dark:text-orange-100">ORANGE / BUTTONS</Badge>
        <div className="grid max-w-3xl gap-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">暖色操作按钮</h1>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">基于 Orange 100–1100 色阶构建的辅助按钮体系，不改变现有 Primary 语义。</p>
        </div>
      </header>

      <section className="grid gap-3" aria-labelledby="orange-scale-title">
        <div>
          <h2 id="orange-scale-title" className="text-lg font-semibold">色阶</h2>
          <p className="text-sm text-muted-foreground">11 个全局静态 Token，浅色与深色主题共用。</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-11">
          {orangeScale.map(shade => <div key={shade} className="overflow-hidden rounded-lg border bg-card"><div className="h-16" style={{ backgroundColor: `var(--color-orange-${shade})` }} /><div className="grid gap-0.5 p-2"><span className="text-xs font-semibold tabular-nums">{shade}</span><span className="text-[11px] text-muted-foreground">{shade === "600" ? "BASE · #FF592C" : `orange-${shade}`}</span></div></div>)}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Orange 按钮样式">
        <Card>
          <CardHeader><CardTitle>Variants</CardTitle><CardDescription>从高强调操作到低强调文字入口。</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="orange" size="default" className="max-sm:min-h-11">orange</Button>
            <Button variant="orange-soft" size="default" className="max-sm:min-h-11">orange-soft</Button>
            <Button variant="orange-outline" size="default" className="max-sm:min-h-11">orange-outline</Button>
            <Button variant="orange-ghost" size="default" className="max-sm:min-h-11">orange-ghost</Button>
            <Button variant="orange-link" size="default" className="max-sm:min-h-11">orange-link</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>States</CardTitle><CardDescription>悬停、键盘焦点、加载和禁用状态均由共享组件处理。</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="orange" size="default" className="max-sm:min-h-11">default</Button>
            <Button variant="orange" size="default" className="max-sm:min-h-11" disabled><LoaderCircle className="animate-spin" />loading</Button>
            <Button variant="orange-outline" size="default" className="max-sm:min-h-11" disabled>disabled</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sizes</CardTitle><CardDescription>沿用 Button 现有尺寸体系，移动端示例保持 44px 触控高度。</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="orange" size="sm" className="max-sm:min-h-11">sm</Button>
            <Button variant="orange" size="default" className="max-sm:min-h-11">default</Button>
            <Button variant="orange" size="lg" className="max-sm:min-h-11">lg</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Composition</CardTitle><CardDescription>图标与明确动作名称组合，不依赖图标表达含义。</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="orange" size="default" className="max-sm:min-h-11"><Plus />orange</Button>
            <Button variant="orange-soft" size="default" className="max-sm:min-h-11"><Check />orange-soft</Button>
            <Button variant="orange-outline" size="default" className="max-sm:min-h-11">orange-outline<ArrowRight /></Button>
          </CardContent>
        </Card>
      </section>
    </section>
  )
}
