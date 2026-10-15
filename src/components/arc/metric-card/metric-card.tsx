"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, type Variants } from "motion/react";
import { motionTokens } from "../lib/motion-tokens";
import { AnimatedCounter } from "../animated-counter/animated-counter";
import styles from "./metric-card.module.css";
// XELA extension (see docs/agent/arc-migration.md): money and other formatted numbers (prefix, decimals, locale), a value that is not
// known yet, an optional context line, an action in the top row and a trailing control in the bottom-right corner.
export interface MetricCardProps {
  label: string;
  /** null shows a dash, for a number that is still loading or unavailable. */
  value: number | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  locale?: string;
  context?: string;
  change?: string;
  /** A control at the end of the top row, such as a link to the list behind the number. */
  action?: ReactNode;
  /** A control in the bottom-right corner, beside the number, such as a round link to the page behind it. */
  trailing?: ReactNode;
  /** Tighter padding for cards that sit in a fixed-height grid row. */
  density?: "default" | "compact";
  className?: string;
  style?: CSSProperties;
}

/** Copy that holds a number enters from the side it moved toward: a larger value rises from below, a smaller one drops from above. */
const rise: Variants = { hidden: (direction: number) => ({ opacity: 0, y: `${.3 * direction}em`, filter: `blur(${motionTokens.blur.soft}px)` }), shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } }, gone: (direction: number) => ({ opacity: 0, y: `${-.3 * direction}em`, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } }) };
const fade: Variants = { hidden: { opacity: 0, y: 0, filter: "blur(0px)" }, shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.instant } }, gone: { opacity: 0, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.instant } } };
const amountIn = (text: string) => Number(text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN);

/** New copy rises in while the old copy leaves; `morph` springs the wrapper to the new text's width instead of letting it snap. */
function Swap({ text, morph = false, block = false }: { text: string; morph?: boolean; block?: boolean }) {
  const reduceMotion = !!useReducedMotion();
  const sizer = useRef<HTMLSpanElement>(null);
  const width = useMotionValue<number | "auto">("auto");
  const [shown, setShown] = useState({ text, direction: 1 });
  if (shown.text !== text) setShown({ text, direction: amountIn(text) < amountIn(shown.text) ? -1 : 1 });
  useEffect(() => {
    const node = sizer.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let measured: string | null = null;
    // Layout size, not the transformed rect, so a scaling parent never leaves the text clipped. Only a new text springs; font loads jump.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = entry.borderBoxSize?.[0]?.inlineSize ?? node.offsetWidth;
      if (next && measured !== null && measured !== node.textContent && !reduceMotion) animate(width, next, motionTokens.spring.morph);
      else width.jump(next || "auto");
      measured = next ? node.textContent : null;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [morph, reduceMotion, width]);
  return <motion.span className={block ? styles.swapBlock : styles.swap} style={morph ? { width } : undefined}>
    {morph && <span ref={sizer} className={styles.sizer} aria-hidden="true">{text}</span>}
    <AnimatePresence mode="popLayout" initial={false} custom={shown.direction}><motion.span key={text} className={styles.text} custom={shown.direction} variants={reduceMotion ? fade : rise} initial="hidden" animate="shown" exit="gone">{text}</motion.span></AnimatePresence>
  </motion.span>;
}

export function MetricCard({ label, value, prefix, suffix, decimals, locale = "zh-CN", context, change, action, trailing, density = "default", className, style }: MetricCardProps) {
  const reduceMotion = !!useReducedMotion();
  const figure = <>
    {value === null ? <span className={styles.empty} aria-label="暂无数据">—</span> : <AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} locale={locale} animateOnView />}
    {context ? <p><Swap text={context} block /></p> : null}
  </>;
  return <article className={[styles.card, density === "compact" ? styles.compact : "", trailing ? styles.withTrailing : "", className].filter(Boolean).join(" ")} style={style}>
    <div className={styles.top}><span><Swap text={label} block /></span><AnimatePresence initial={false}>{change && <motion.small key="change" data-trend={/^[+]/.test(change) ? "up" : /^[-−]/.test(change) ? "down" : undefined} initial={{ opacity: 0, scale: reduceMotion ? 1 : .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduceMotion ? 1 : .96, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } }} transition={reduceMotion ? { duration: 0 } : motionTokens.spring.snappy}><Swap text={change} morph /></motion.small>}</AnimatePresence>{action ? <div className={styles.action}>{action}</div> : null}</div>
    {trailing ? <div className={styles.bottom}><div className={styles.figure}>{figure}</div><div className={styles.trailing}>{trailing}</div></div> : figure}
  </article>;
}
