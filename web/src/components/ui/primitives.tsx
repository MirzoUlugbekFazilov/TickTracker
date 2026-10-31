/**
 * Small presentational primitives shared across pages.
 *
 * Deliberately plain: props map to classes, nothing holds state. Anything that
 * needs behaviour (focus trapping, async feedback) lives in its own file.
 */

import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { SEVERITY_LABELS } from '../../data/species';
import type { SeverityLevel } from '../../types/sighting';

/* ------------------------------------------------------------------ Alert */

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const ALERT_ICON: Record<AlertTone, IconName> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'alert-circle',
};

export interface AlertProps {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
  /**
   * Announce the alert to assistive technology when it appears. Use `assertive`
   * only for errors that interrupt the user's task; `polite` otherwise, so a
   * success message does not cut across whatever is being read.
   */
  live?: 'off' | 'polite' | 'assertive';
}

export function Alert({ tone, title, children, live = 'off' }: AlertProps) {
  return (
    <div
      className={`alert alert--${tone}`}
      // role="alert" implies aria-live="assertive"; setting role only when we
      // actually want the interruption avoids an unwanted announcement.
      {...(live === 'assertive' ? { role: 'alert' } : {})}
      {...(live === 'polite' ? { role: 'status' } : {})}
    >
      <Icon name={ALERT_ICON[tone]} size={20} className="alert__icon" />
      <div className="alert__body">
        {title ? <p className="alert__title">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */

export function SeverityBadge({
  level,
  score,
}: {
  level: SeverityLevel;
  score?: number;
}) {
  return (
    <span className={`badge badge--severity-${level}`}>
      {SEVERITY_LABELS[level]}
      {score === undefined ? null : <span className="tabular"> {score}</span>}
      {/* The visible label already names the level; this clarifies for a screen
          reader that the rating is modelled rather than reported. */}
      <span className="sr-only"> (derived risk rating)</span>
    </span>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'accent' | 'success';
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/* ------------------------------------------------------------- Stat tile */

export interface StatProps {
  label: string;
  value: string;
  meta?: ReactNode;
  delta?: { direction: 'up' | 'down' | 'flat'; text: string };
}

export function Stat({ label, value, meta, delta }: StatProps) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {delta ? (
        <span className={`stat__delta stat__delta--${delta.direction}`}>
          {/* An arrow glyph as well as the colour, so direction survives in
              greyscale and for a colourblind reader. */}
          <Icon
            name={
              delta.direction === 'up'
                ? 'arrow-up'
                : delta.direction === 'down'
                  ? 'arrow-down'
                  : 'minus'
            }
            size={13}
          />
          {delta.text}
        </span>
      ) : null}
      {meta ? <span className="stat__meta">{meta}</span> : null}
    </div>
  );
}

/* ----------------------------------------------------------- Empty state */

export function EmptyState({
  icon = 'search',
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={32} className="empty-state__icon" />
      <p className="empty-state__title">{title}</p>
      {children ? <p className="empty-state__text">{children}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------ Disclosure */

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary className="disclosure__summary">
        <Icon name="chevron-right" size={16} className="disclosure__chevron" />
        {summary}
      </summary>
      <div className="disclosure__content">{children}</div>
    </details>
  );
}

/* --------------------------------------------------------------- Spinner */

export function Spinner({ label }: { label: string }) {
  return (
    <>
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
}

/* ----------------------------------------------------------------- Meter */

/** A labelled 0–100 bar, used for the derived severity score. */
export function Meter({
  value,
  max = 100,
  color,
  startLabel,
  endLabel,
}: {
  value: number;
  max?: number;
  color: string;
  startLabel: string;
  endLabel: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <div
        className="meter__track"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label="Derived risk score"
      >
        <div
          className="meter__fill"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
      <div className="meter__labels">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
