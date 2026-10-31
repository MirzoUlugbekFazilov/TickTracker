/**
 * Sightings per year.
 *
 * An area chart here rather than columns: year-on-year reporting volume is a
 * continuous quantity over an ordered axis, and the question is the shape of the
 * trend rather than the value of any single year. The fill carries that shape at
 * a glance; a 13-column chart reads as thirteen separate facts.
 *
 * Single series, so no legend box — the title names it.
 */

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Sighting } from '../../types/sighting';
import { yearlyCounts } from '../../lib/stats';
import { formatNumber } from '../../lib/format';
import { axisProps, useChartTheme } from './chartTheme';
import { ChartTooltipBody } from './chartParts';
import { Disclosure } from '../ui/primitives';

export function YearlyTrendChart({
  sightings,
  title = 'Reports per year',
  subtitle,
}: {
  sightings: readonly Sighting[];
  title?: string;
  subtitle?: string;
}) {
  const theme = useChartTheme();
  const data = useMemo(() => yearlyCounts(sightings), [sightings]);

  if (data.length === 0) {
    return (
      <div className="chart-card">
        <h3 className="card__title">{title}</h3>
        <div className="chart-empty">
          <p>No sightings match the current filters.</p>
        </div>
      </div>
    );
  }

  const highest = data.reduce((best, point) => (point.count > best.count ? point : best), data[0]!);
  const lowest = data.reduce((worst, point) => (point.count < worst.count ? point : worst), data[0]!);

  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <h3 className="card__title">{title}</h3>
          <p className="card__subtitle">
            {subtitle ?? `${data[0]?.year} to ${data[data.length - 1]?.year}`}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted">
        Busiest year <strong style={{ color: 'var(--ink)' }}>{highest.year}</strong> with{' '}
        {formatNumber(highest.count)}; quietest{' '}
        <strong style={{ color: 'var(--ink)' }}>{lowest.year}</strong> with{' '}
        {formatNumber(lowest.count)}.
      </p>

      <div className="chart-card__plot" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <defs>
              {/* A soft vertical fade keeps the fill from dominating the line,
                  which is where the trend is actually read. */}
              <linearGradient id="yearly-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--species-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--species-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="year" {...axisProps(theme)} />
            <YAxis {...axisProps(theme)} allowDecimals={false} width={46} />
            <Tooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as (typeof data)[number] | undefined;
                if (!point) return null;
                return (
                  <ChartTooltipBody
                    title={String(point.year)}
                    rows={[
                      { label: 'Sightings', value: point.count, color: 'var(--species-1)' },
                    ]}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--species-1)"
              strokeWidth={2}
              fill="url(#yearly-fill)"
              dot={{ r: 3, fill: 'var(--species-1)', stroke: theme.surface, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: 'var(--species-1)', stroke: theme.surface, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <Disclosure summary="View as a table">
        <div className="scroll-x">
          <table className="data-table">
            <caption>Sightings per year, for the current filters.</caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Sightings</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.year}>
                  <th scope="row">{point.year}</th>
                  <td>{formatNumber(point.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
