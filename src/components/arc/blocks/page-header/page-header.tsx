"use client";

// XELA extension (see docs/agent/arc-migration.md): the block shipped as a self-contained demo of a project page (its own
// scroller, tabs, issue and update panels, and simulated actions) and took no props. The product's detail pages keep their own
// content and scroll inside the app layout, so the block is reduced to the header itself and takes its content as props:
// breadcrumbs, the title with a status, a description, a meta line and the page's actions.

import type { MouseEvent, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./page-header.module.css";

export interface PageHeaderCrumb {
  label: string;
  href?: string;
  /** Runs on press. Call preventDefault and navigate to hand an internal link to the router. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}

export interface PageHeaderProps {
  /** The path to this page, outermost first. The last entry is the page itself. */
  breadcrumbs?: PageHeaderCrumb[];
  title: ReactNode;
  /** A badge beside the title. */
  status?: ReactNode;
  /** XELA extension: "end" stretches the title row and pushes the status slot (badges, a page-level button) to its right edge. */
  statusAlign?: "inline" | "end";
  description?: ReactNode;
  /** A quiet line under the description: owner, dates, identifiers. */
  meta?: ReactNode;
  /** Buttons at the end of the top row. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ breadcrumbs, title, status, statusAlign = "inline", description, meta, actions, className }: PageHeaderProps) {
  return (
    <header className={[styles.header, styles.standalone, className].filter(Boolean).join(" ")}>
      {breadcrumbs?.length || actions ? <div className={styles.bar}>
        <div className={styles.lead}>
          {breadcrumbs?.length ? <nav className={styles.crumbs} aria-label="位置">
            <ol>
              {breadcrumbs.map((crumb, index) => {
                const last = index === breadcrumbs.length - 1;
                return <li key={`${crumb.label}-${index}`}>
                  {last
                    ? <span className={styles.current} aria-current="page">{crumb.label}</span>
                    : crumb.href
                      ? <a className={styles.crumb} href={crumb.href} onClick={crumb.onClick}>{crumb.label}</a>
                      : <button type="button" className={styles.crumb} onClick={crumb.onClick}>{crumb.label}</button>}
                  {last ? null : <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />}
                </li>;
              })}
            </ol>
          </nav> : <span />}
        </div>
        {actions ? <div className={styles.actions}><div className={styles.trailing}>{actions}</div></div> : null}
      </div> : null}
      <div className={styles.introInner}>
        <div className={styles.titleRow} data-status-end={statusAlign === "end" || undefined}><h1 className={styles.title}>{title}</h1>{status && statusAlign === "end" ? <div className={styles.statusEnd}>{status}</div> : status}</div>
        {description || meta ? <div className={styles.details}>
          {description ? <p className={styles.description}>{description}</p> : null}
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div> : null}
      </div>
    </header>
  );
}

export default PageHeader;
