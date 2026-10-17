"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { Button } from "../../button/button";
import SegmentedControl from "../../segmented-control/segmented-control";
import { Switch } from "../../switch/switch";
import { motionTokens } from "../../lib/motion-tokens";
import styles from "./plan-comparison.module.css";

/** true renders the included mark, false the "not included" text, null a dash. */
export type PlanComparisonValue = string | boolean | null;
export type PlanComparisonPeriod = { value: string; label: string; note?: ReactNode };
/** A plan's price in one period; a missing entry means the plan is not sold in that period. */
export type PlanComparisonPrice = { amount: number; unit: ReactNode; note?: ReactNode };
export type PlanComparisonPlan = { id: string; name: string; tagline?: ReactNode; badge?: ReactNode; prices: Record<string, PlanComparisonPrice | undefined> };
/** values are keyed by plan id; a row counts as shared when every plan has the same value, unless `shared` says otherwise. */
export type PlanComparisonRow = { id: string; label: ReactNode; values: Record<string, PlanComparisonValue>; shared?: boolean };
export type PlanComparisonLabels = {
  periodControl: string;
  compareTitle: ReactNode;
  featureHeader: ReactNode;
  differencesOnly: string;
  featureCount: (visible: ReactNode, total: number) => ReactNode;
  included: string;
  notIncluded: string;
  select: (plan: PlanComparisonPlan) => string;
  selected: string;
  unavailable: string;
  selectedStatus: (plan: PlanComparisonPlan) => string;
  matrix: string;
};

export type PlanComparisonProps = {
  title?: ReactNode;
  description?: ReactNode;
  periods?: PlanComparisonPeriod[];
  period?: string;
  defaultPeriod?: string;
  onPeriodChange?: (period: string) => void;
  plans?: PlanComparisonPlan[];
  rows?: PlanComparisonRow[];
  selected?: string | null;
  defaultSelected?: string | null;
  onSelectedChange?: (planId: string | null) => void;
  currency?: string;
  footer?: ReactNode;
  /** Shown at the end of the footer, e.g. the checkout button for the selected plan. */
  action?: ReactNode;
  labels?: Partial<PlanComparisonLabels>;
};

const defaultLabels: PlanComparisonLabels = {
  periodControl: "Billing period",
  compareTitle: "Compare plans",
  featureHeader: "What changes",
  differencesOnly: "Show differences only",
  featureCount: (visible, total) => <>{visible} of {total} features</>,
  included: "Included",
  notIncluded: "Not included",
  select: plan => `Select ${plan.name}`,
  selected: "Selected",
  unavailable: "Not available",
  selectedStatus: plan => `${plan.name} selected`,
  matrix: "Plan comparison",
};

const demoPeriods: PlanComparisonPeriod[] = [
  { value: "monthly", label: "Monthly", note: "Billed month to month" },
  { value: "yearly", label: "Yearly", note: "Billed yearly, save up to 23%" },
];
const demoPlans: PlanComparisonPlan[] = [
  { id: "team", name: "Team", tagline: "For smaller teams", prices: { monthly: { amount: 13, unit: "per seat / month" }, yearly: { amount: 10, unit: "per seat / month" } } },
  { id: "studio", name: "Studio", tagline: "For work across teams", prices: { monthly: { amount: 27, unit: "per seat / month" }, yearly: { amount: 22, unit: "per seat / month" } } },
];
const demoRows: PlanComparisonRow[] = [
  { id: "projects", label: "Active projects", values: { team: "Unlimited", studio: "Unlimited" } },
  { id: "workspaces", label: "Shared workspaces", values: { team: "1 workspace", studio: "Unlimited" } },
  { id: "reviewers", label: "Guest reviewers", values: { team: "5 per project", studio: "Unlimited" } },
  { id: "history", label: "Version history", values: { team: "30 days", studio: "Unlimited" } },
  { id: "approval", label: "Approval flows", values: { team: false, studio: true } },
  { id: "roles", label: "Custom roles", values: { team: false, studio: true } },
  { id: "exports", label: "Source exports", values: { team: true, studio: true } },
  { id: "support", label: "Support", values: { team: "Email", studio: "Priority email" } },
];

function isShared(row: PlanComparisonRow, plans: PlanComparisonPlan[]) {
  if (typeof row.shared === "boolean") return row.shared;
  const first = row.values[plans[0]?.id] ?? null;
  return plans.every(plan => (row.values[plan.id] ?? null) === first);
}

function Value({ value, labels }: { value: PlanComparisonValue; labels: PlanComparisonLabels }) {
  if (value === true) return <span className={styles.included}><Check size={16} strokeWidth={1.75} aria-hidden="true" />{labels.included}</span>;
  if (value === false) return <span className={styles.unavailable}>{labels.notIncluded}</span>;
  if (value === null || value === "") return <span className={styles.unavailable}>—</span>;
  return <span>{value}</span>;
}

function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const decimals = Number.isInteger(value) ? 0 : 2;
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    if (reduce) {
      previousValue.current = value;
      return;
    }

    const controls = animate(previousValue.current, value, {
      duration: motionTokens.duration.standard,
      ease: [...motionTokens.ease.enter],
      onUpdate: (latest) => setDisplayValue(latest),
    });

    previousValue.current = value;
    return () => controls.stop();
  }, [reduce, value]);

  return <>{(reduce ? value : displayValue).toFixed(decimals)}</>;
}

export function PlanComparison({
  title = "Room for the way you work",
  description = "Only the details that change between plans. Switch billing to see what you would pay.",
  periods = demoPeriods,
  period: periodProp,
  defaultPeriod,
  onPeriodChange,
  plans = demoPlans,
  rows = demoRows,
  selected: selectedProp,
  defaultSelected = null,
  onSelectedChange,
  currency = "$",
  footer = "Prices in USD per seat. Yearly plans are billed annually.",
  action,
  labels: labelsProp,
}: PlanComparisonProps = {}) {
  const id = useId();
  const reduce = useReducedMotion();
  const labels = { ...defaultLabels, ...labelsProp };
  const [periodState, setPeriodState] = useState(defaultPeriod ?? periods[0]?.value ?? "");
  const period = periodProp ?? periodState;
  const [selectedState, setSelectedState] = useState<string | null>(defaultSelected);
  const selected = selectedProp === undefined ? selectedState : selectedProp;
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState<"lg" | "md" | "sm" | "xs">("lg");
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = (width: number) => setSize(width <= 340 ? "xs" : width <= 540 ? "sm" : width <= 720 ? "md" : "lg");
    measure(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => { if (entry) measure(entry.contentRect.width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function changePeriod(next: string) {
    if (periodProp === undefined) setPeriodState(next);
    onPeriodChange?.(next);
  }
  function changeSelected(next: string | null) {
    if (selectedProp === undefined) setSelectedState(next);
    onSelectedChange?.(next);
  }

  const visibleRows = differencesOnly ? rows.filter(row => !isShared(row, plans)) : rows;
  const activePeriod = periods.find(item => item.value === period);
  const selectedPlan = plans.find(plan => plan.id === selected);

  return (
    <section ref={rootRef} className={styles.comparison} data-size={size} aria-labelledby={`${id}-title`} style={{ "--plan-count": Math.max(plans.length, 1) } as CSSProperties}>
      <div className={styles.intro}>
        <div><h2 id={`${id}-title`}>{title}</h2>{description ? <p>{description}</p> : null}</div>
        {periods.length > 1 ? <div className={styles.billing}><SegmentedControl label={labels.periodControl} value={period} onValueChange={changePeriod} options={periods.map(item => ({ value: item.value, label: item.label }))} /><small>{activePeriod?.note}</small></div> : null}
      </div>

      <div className={styles.filter}><div><h3>{labels.compareTitle}</h3><span className={styles.featureCount}>{labels.featureCount(<AnimatedNumber value={visibleRows.length} />, rows.length)}</span></div><Switch checked={differencesOnly} onCheckedChange={setDifferencesOnly} label={labels.differencesOnly} /></div>

      <div className={styles.matrix} role="table" aria-label={labels.matrix}>
        <div className={styles.planHeader} role="row">
          <div className={styles.featureHeader} role="columnheader">{labels.featureHeader}</div>
          {plans.map((plan) => {
            const price = plan.prices[period];
            const isSelected = selected === plan.id;
            return (
              <div key={plan.id} className={`${styles.planCell} ${isSelected ? styles.planSelected : ""}`} role="columnheader" aria-label={plan.name}>
                <div className={styles.planTop}><h3>{plan.name}{plan.badge}</h3>{plan.tagline ? <span>{plan.tagline}</span> : null}</div>
                <div className={styles.price}>
                  {price ? <><span className={styles.priceValue} aria-live="polite" aria-atomic="true">{currency}<AnimatedNumber value={price.amount} /></span><span className={styles.pricePeriod}>{price.unit}</span>{price.note ? <span className={styles.priceNote}>{price.note}</span> : null}</> : <span className={styles.priceValue}>—</span>}
                </div>
                <Button type="button" variant={isSelected ? "primary" : "secondary"} className={styles.selectButton} aria-pressed={isSelected} disabled={!price} onClick={() => changeSelected(isSelected ? null : plan.id)}>{!price ? labels.unavailable : isSelected ? labels.selected : labels.select(plan)}</Button>
                {isSelected && <motion.span className={styles.selectedRail} layoutId={`${id}-selected-rail`} transition={reduce ? { duration: 0 } : motionTokens.spring.responsive} aria-hidden="true" />}
              </div>
            );
          })}
        </div>

        <div className={styles.rows} role="rowgroup">
          <AnimatePresence initial={false}>
            {visibleRows.map((row) => (
              <motion.div key={row.id} className={styles.featureRow} role="row" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0, transition: { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.fast } } }} transition={reduce ? { duration: 0 } : { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter], delay: .04 } }}>
                <div className={styles.featureName} role="rowheader">{row.label}</div>
                {plans.map(plan => <div key={plan.id} className={`${styles.featureValue} ${selected === plan.id ? styles.valueSelected : ""}`} role="cell"><span className={styles.mobilePlan}>{plan.name}</span><Value value={row.values[plan.id] ?? null} labels={labels} /></div>)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.footer}><span>{footer}</span>{action ? <div className={styles.action}>{action}</div> : null}<p className={styles.srOnly} role="status" aria-live="polite">{selectedPlan ? labels.selectedStatus(selectedPlan) : ""}</p></div>
    </section>
  );
}

export default PlanComparison;
