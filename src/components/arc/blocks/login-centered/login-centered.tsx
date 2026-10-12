"use client";

// XELA extension (see docs/agent/arc-migration.md): the block shipped a simulated passkey, email-code and single sign-on flow.
// The product signs in with an email and a password, so the steps were removed and the block is now the frame only: the ring
// backdrop that drifts with the pointer, the top bar, the card that follows its content's height, and the status line. The
// page supplies the heading and the form of the current view.

import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionStyle, type Transition, type Variants } from "motion/react";
import { motionTokens } from "../../lib/motion-tokens";
import styles from "./login-centered.module.css";

export interface LoginCenteredProps {
  /** Fill the viewport (100dvh, no frame) when the block is the whole page. */
  fullScreen?: boolean;
  /** Accessible name of the whole screen, such as "登录". */
  label: string;
  /** The product mark at the start of the top bar. */
  brand: ReactNode;
  /** The question beside the link at the end of the top bar, such as "还没有账户？". */
  switchPrompt?: string;
  /** The link to the other auth page. */
  switchAction?: ReactNode;
  /** Identifies the current view; changing it slides the card to the new content. */
  view: string;
  /** 1 moves forward, -1 moves back. */
  direction?: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** A short line at the start of the footer, announced politely. */
  status?: string;
  /** Links at the end of the footer. */
  links?: ReactNode;
  className?: string;
}
type StepCustom = { direction: number; reduce: boolean };

/** Concentric rings behind the card. Outer rings drift further, so the set reads as depth rather than a flat pattern. */
const rings = Array.from({ length: 14 }, (_, index) => ({ r: 224 + index * 60, k: 1 + index * .34, major: index % 3 === 2 }));

/** Steps rise into place out of a small blur; going back, they settle down from above. */
const stepMotion: Variants = {
  enter: ({ direction, reduce }: StepCustom) => reduce ? { opacity: 0 } : { opacity: 0, y: direction * 12, filter: `blur(${motionTokens.blur.soft}px)` },
  center: ({ reduce }: StepCustom) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: reduce ? { duration: motionTokens.duration.instant } : { y: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.standard, ease: motionTokens.ease.enter, delay: .06 }, filter: { duration: motionTokens.duration.standard, ease: motionTokens.ease.enter, delay: .04 } } }),
  exit: ({ direction, reduce }: StepCustom) => reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: direction * -8, filter: `blur(${motionTokens.blur.soft}px)`, transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.standard } },
};
const swap = (reduce: boolean) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: `blur(${motionTokens.blur.soft}px)` },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.fast } },
  transition: (reduce ? { duration: motionTokens.duration.instant } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }) as Transition,
});

/** The card follows its content on a spring only while the view changes; otherwise it stays auto, so field messages open without lag. */
function useViewHeight(view: string, reduce: boolean) {
  const track = useRef<HTMLDivElement>(null);
  const height = useMotionValue<number | "auto">("auto");
  const measured = useRef(0);
  const gliding = useRef(false);
  const lastView = useRef(view);
  const glide = useCallback((to: number) => {
    gliding.current = true;
    animate(height, to, { ...motionTokens.spring.smooth, onComplete: () => { gliding.current = false; height.jump("auto"); } });
  }, [height]);
  useEffect(() => {
    const node = track.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      measured.current = entry.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight;
      if (gliding.current) glide(measured.current);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [glide]);
  useLayoutEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    const current = height.get();
    const from = typeof current === "number" ? current : measured.current;
    const to = track.current?.offsetHeight ?? 0;
    if (reduce || !from || !to) { gliding.current = false; height.jump("auto"); return; }
    if (current === "auto") height.jump(from);
    glide(to);
  }, [view, reduce, height, glide]);
  return { track, height };
}

/** Pointer drift for the line backdrop: fine pointers with hover only, never under reduced motion. */
function useDrift(reduce: boolean) {
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { visualDuration: .9, bounce: 0 });
  const y = useSpring(pointerY, { visualDuration: .9, bounce: 0 });
  const dx = useTransform(x, value => `${value.toFixed(2)}px`);
  const dy = useTransform(y, value => `${value.toFixed(2)}px`);
  const canHover = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => { canHover.current = query.matches; };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (reduce || !canHover.current || event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - box.left) / box.width - .5) * -2);
    pointerY.set(((event.clientY - box.top) / box.height - .5) * -2);
  };
  const onPointerLeave = () => { pointerX.set(0); pointerY.set(0); };
  return { style: { "--dx": dx, "--dy": dy } as MotionStyle, onPointerMove, onPointerLeave };
}

export function LoginCentered({ fullScreen = false, label, brand, switchPrompt, switchAction, view, direction = 1, title, description, children, status = "", links, className }: LoginCenteredProps) {
  const reduce = !!useReducedMotion();
  const { track, height } = useViewHeight(view, reduce);
  const drift = useDrift(reduce);
  const custom: StepCustom = { direction, reduce };

  return (
    <section className={[styles.screen, fullScreen ? styles.fullScreen : "", className].filter(Boolean).join(" ")} aria-label={label} onPointerMove={drift.onPointerMove} onPointerLeave={drift.onPointerLeave}>
      <motion.div className={styles.backdrop} style={drift.style} aria-hidden="true">
        <svg className={styles.lines}>
          <svg x="50%" y="50%" overflow="visible">
            <line className={styles.axis} x1="-2400" x2="2400" y1="0" y2="0" />
            <line className={styles.axis} x1="0" x2="0" y1="-2400" y2="2400" />
            {rings.map(ring => <circle key={ring.r} className={ring.major ? `${styles.ring} ${styles.ringMajor}` : styles.ring} r={ring.r} cx="0" cy="0" style={{ "--k": ring.k } as CSSProperties} />)}
          </svg>
        </svg>
      </motion.div>

      <header className={styles.bar}>
        <span className={styles.mark}>{brand}</span>
        {switchAction ? <p className={styles.switch}>{switchPrompt ? <span>{switchPrompt}</span> : null}{switchAction}</p> : null}
      </header>

      <div className={styles.stage}>
        <div className={styles.card}>
          <motion.div className={styles.viewport} style={{ height }}>
            <div ref={track} className={styles.track}>
              <AnimatePresence mode="popLayout" initial={false} custom={custom}>
                <motion.div key={view} className={styles.step} custom={custom} variants={stepMotion} initial="enter" animate="center" exit="exit">
                  <div className={styles.heading}><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>

      <footer className={styles.foot}>
        <p className={styles.srOnly} role="status" aria-live="polite">{status}</p>
        <span className={styles.status} aria-hidden="true"><AnimatePresence mode="popLayout" initial={false}><motion.span key={status} {...swap(reduce)}>{status}</motion.span></AnimatePresence></span>
        {links ? <nav className={styles.legal}>{links}</nav> : null}
      </footer>
    </section>
  );
}

export default LoginCentered;
