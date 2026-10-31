/**
 * Chart chrome rendered as real markup rather than inside the SVG.
 *
 * Tooltips and legends are built as HTML on purpose. A legend drawn into the
 * SVG cannot wrap, so a five-item legend overflows on a phone; an HTML legend
 * reflows. The tooltip, likewise, picks up the app's own classes and therefore
 * themes correctly in both modes instead of carrying Recharts' inline styles.
 */

import type { ReactNode } from 'react';
import { formatNumber } from '../../lib/format';

export interface TooltipRow {
  label: string;
  value: number;
  color?: string;
}

export function ChartTooltipBody({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="chart-tooltip__row">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {row.color ? (
              <span
                className="swatch swatch--round"
                style={{ background: row.color }}
                aria-hidden="true"
              />
            ) : null}
            {row.label}
          </span>
          <span className="chart-tooltip__value">{formatNumber(row.value)}</span>
        </p>
      ))}
      {footer ? (
        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
          {footer}
        </p>
      ) : null}
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string; shape?: 'round' | 'square' }>;
}) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label} className="chart-legend__item">
          <span
            className={`swatch${item.shape === 'square' ? '' : ' swatch--round'}`}
            style={{ background: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
