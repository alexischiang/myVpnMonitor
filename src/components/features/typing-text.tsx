import * as React from "react"

import { cn } from "@/lib/utils"

// 逐字输入的文字 + 闪烁光标（\n 会换行）。loop 时打完停留 holdDelay 后逐字删除再重新输入，
// 每轮开始输入时触发 onTypeStart。减少动态效果时直接显示全文且不循环。
export function TypingText({ text, speed = 70, startDelay = 300, loop = false, holdDelay = 2000, deleteSpeed = 40, onTypeStart, className }: {
  text: string
  speed?: number
  startDelay?: number
  loop?: boolean
  holdDelay?: number
  deleteSpeed?: number
  onTypeStart?: () => void
  className?: string
}) {
  const [count, setCount] = React.useState(0)
  const onTypeStartRef = React.useRef(onTypeStart)
  onTypeStartRef.current = onTypeStart

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onTypeStartRef.current?.()
      setCount(text.length)
      return
    }
    let timer: number | undefined
    const schedule = (step: () => void, delay: number) => { timer = window.setTimeout(step, delay) }
    const type = (next: number) => {
      setCount(next)
      if (next < text.length) schedule(() => type(next + 1), speed)
      else if (loop) schedule(() => erase(text.length - 1), holdDelay)
    }
    const erase = (next: number) => {
      setCount(next)
      if (next > 0) schedule(() => erase(next - 1), deleteSpeed)
      else schedule(startPass, startDelay)
    }
    const startPass = () => {
      onTypeStartRef.current?.()
      type(1)
    }
    setCount(0)
    schedule(startPass, startDelay)
    return () => window.clearTimeout(timer)
  }, [text, speed, startDelay, loop, holdDelay, deleteSpeed])

  const cursor = <span className="typing-cursor ml-0.5 inline-block h-[1em] w-0.5 translate-y-[0.15em] bg-current" />
  // 隐藏的完整文字先占住最终尺寸，输入过程中布局不会跳动
  return (
    <span className={cn("inline-grid whitespace-pre-line", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">{text}{cursor}</span>
      <span aria-hidden className="col-start-1 row-start-1">{text.slice(0, count)}{cursor}</span>
    </span>
  )
}
