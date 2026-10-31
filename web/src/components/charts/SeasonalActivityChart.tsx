/**
 * Seasonal activity chart — frontend requirement 3c.
 *
 * "Pick a chart to illustrate the sightings frequency in a location per year
 * (with dropboxes to select UK city and year)."
 *
 * DATA SOURCE
 * `GET /api/insights/seasonal`, which returns twelve monthly counts computed
 * by Postgres. The city and year dropdowns become query parameters, so
 * changing either is a filtered aggregate on the server rather than a reduce
 * over a dataset held in the browser.
 *
 * CHART CHOICE
 * Monthly columns, with an optional comparison line.
 *
 * Columns rather than a line for the primary series because the measure is a
 * count per discrete calendar month, not a continuously sampled quantity. A
 * line implies you could read a value between March and April, which is
 * meaningless; it also dips smoothly through a zero month and hides it, where
 * a column correctly shows nothing.
 *
 * The comparison line answers the question the user actually has — "is this
 * year unusual?" — which needs a reference. It is the all-years average for
 * the same city, on the same axis and in the same unit (sightings per month),
 * so this is a legitimate overlay rather than a dual-axis chart.
 */

import { useId, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchSeasonal } from '../../lib/api';
import { useInsight } from '../../hooks/useInsight';
import { EMPTY_FILTERS, MONTH_LABELS_SHORT, MONTH_NAMES } from '../../lib/display';
import { formatNumber } from '../../lib/format';
import { axisProps, useChartTheme } from './chartTheme';
import { ChartLegend, ChartTooltipBody } from './chartParts';
import { Disclosure, Spinner } from '../ui/primitives';

import type { Filters } from '../../types/sighting';

const ALL_YEARS = 'all';

export interface SeasonalActivityChartProps {
  citiesPresent: readonly string[];
  yearsPresent: readonly number[];
  defaultCity?: string;
}

export function SeasonalActivityChart({
  citiesPresent,
  yearsPresent,
  defaultCity,
}: SeasonalActivityChartProps) {
  const cityId = useId();
  const yearId = useId();
  const theme = useChartTheme();

  const [city, setCity] = useState<string>(() => defaultCity ?? citiesPresent[0] ?? '');
  const [year, setYear] = useState<string>(ALL_YEARS);

  /** Filters for the selected year, or all years. */
  const scopedFilters = useMemo<Filters>(() => {
    const base: Filters = { ...EMPTY_FILTERS, city };
    if (year === ALL_YEARS) return base;
    return { ...base, dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }, [city, year]);

  const allYearsFilters = useMemo<Filters>(() => ({ ...EMPTY_FILTERS, city }), [city]);

  const selected = useInsight(
    (signal) => fetchSeasonal(scopedFilters, signal),
    [city, year],
  );
  // The all-years series is fetched separately because it is the baseline the
  // selected year is compared against; it only changes when the city changes.
  const baseline = useInsight((signal) => fetchSeasonal(allYearsFilters, signal), [city]);

  const showAverage = year !== ALL_YEARS;

  const data = useMemo(() => {
    const monthly = selected.data ?? [];
    const allYears = baseline.data ?? [];
    // Divide by the number of years that city actually has data for, not the
    // global year count, so a city with a short record is not flattened
    // against one with a long one.
    const yearCount = Math.max(1, yearsPresent.length);

    return MONTH_LABELS_SHORT.map((label, index) => ({
      month: label,
      monthIndex: index,
      count: monthly[index]?.count ?? 0,
      average: Math.round(((allYears[index]?.count ?? 0) / yearCount) * 10) / 10,
    }));
  }, [selected.data, baseline.data, yearsPresent.length]);

  const total = data.reduce((sum, point) => sum + point.count, 0);
  const peak = data.reduce(
    (best, point) => (point.count > best.count ? point : best),
    { month: '', count: 0, monthIndex: 0, average: 0 },
  );

  const columnColor = 'var(--species-1)';
  const averageColor = 'var(--accent)';
  const isLoading = selected.isLoading && selected.data === null;

  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <h3 className="card__title">Seasonal activity</h3>
          <p className="card__subtitle">
            Sightings by month of the year
            {year === ALL_YEARS ? ', all years combined' : ` in ${year}`}
          </p>
        </div>

        <div className="chart-card__controls">
          <div className="chart-control">
            <label className="chart-control__label" htmlFor={cityId}>
              UK city
            </label>
            <select
              id={cityId}
              className="select"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            >
              {citiesPresent.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="chart-control">
            <label className="chart-control__label" htmlFor={yearId}>
              Year
            </label>
            <select
              id={yearId}
              className="select"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            >
              <option value={ALL_YEARS}>All years</option>
              {[...yearsPresent].reverse().map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* The headline finding in words, so the chart's message does not depend
          on being able to see it. */}
      <p className="text-sm text-muted" aria-live="polite">
        {isLoading ? (
          <>
            <Spinner label="Loading" /> Loading {city} data...
          </>
        ) : total === 0 ? (
          <>No sightings recorded in {city} for this period.</>
        ) : (
          <>
            <strong style={{ color: 'var(--ink)' }}>{formatNumber(total)}</strong>{' '}
            {total === 1 ? 'sighting' : 'sightings'} in {city}
            {year === ALL_YEARS ? ' across all years' : ` during ${year}`}
            {peak.count > 0 ? (
              <>
                , peaking in{' '}
                <strong style={{ color: 'var(--ink)' }}>{MONTH_NAMES[peak.monthIndex]}</strong>{' '}
                with {peak.count}.
              </>
            ) : (
              '.'
            )}
          </>
        )}
      </p>

      {selected.error ? (
        <div className="chart-empty">
          <p>{selected.error}</p>
        </div>
      ) : total === 0 && !isLoading ? (
        <div className="chart-empty">
          <p>
            Nothing to plot. Try &ldquo;All years&rdquo;, or another city &mdash; a
            single year in one city often holds only a handful of records.
          </p>
        </div>
      ) : (
        <>
          <div className="chart-card__plot" style={{ opacity: selected.isLoading ? 0.55 : 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                barCategoryGap="22%"
              >
                {/* Horizontal hairlines only: vertical rules would compete with
                    the columns sitting in front of them. */}
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="month" {...axisProps(theme)} interval={0} />
                <YAxis {...axisProps(theme)} allowDecimals={false} width={46} />
                <Tooltip
                  cursor={{ fill: 'rgb(125 125 125 / 0.08)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0]?.payload as (typeof data)[number] | undefined;
                    if (!point) return null;
                    return (
                      <ChartTooltipBody
                        title={MONTH_NAMES[point.monthIndex] ?? String(label)}
                        rows={[
                          {
                            label: year === ALL_YEARS ? 'All years' : year,
                            value: point.count,
                            color: columnColor,
                          },
                          ...(showAverage
                            ? [
                                {
                                  label: 'All-year average',
                                  value: point.average,
                                  color: averageColor,
                                },
                              ]
                            : []),
                        ]}
                      />
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill={columnColor}
                  name={year === ALL_YEARS ? 'All years' : year}
                  /* Rounded only at the free end, anchored flat to the baseline. */
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                />
                {showAverage ? (
                  <Line
                    type="monotone"
                    dataKey="average"
                    stroke={averageColor}
                    strokeWidth={2}
                    dot={{ r: 4, fill: averageColor, stroke: theme.surface, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: averageColor, stroke: theme.surface, strokeWidth: 2 }}
                    name="All-year average"
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <ChartLegend
            items={[
              {
                label: year === ALL_YEARS ? `${city}, all years` : `${city}, ${year}`,
                color: columnColor,
                shape: 'square',
              },
              ...(showAverage
                ? [{ label: `${city} all-year monthly average`, color: averageColor }]
                : []),
            ]}
          />

          {/* The table alternative — required by the palette's relief rule, and
              the only way to read exact values. */}
          <Disclosure summary="View as a table">
            <div className="scroll-x">
              <table className="data-table">
                <caption>
                  Sightings per month in {city}
                  {year === ALL_YEARS ? ', all years combined' : `, ${year}`}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Sightings</th>
                    {showAverage ? <th scope="col">All-year average</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.map((point) => (
                    <tr key={point.month}>
                      <th scope="row">{MONTH_NAMES[point.monthIndex]}</th>
                      <td>{point.count}</td>
                      {showAverage ? <td>{point.average}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Disclosure>
        </>
      )}

      <Disclosure summary="How to read this chart">
        <p>
          Columns count the sightings recorded in each calendar month, grouped by
          Postgres and served from <code>/api/insights/seasonal</code>. With
          &ldquo;All years&rdquo; selected they aggregate the whole record, which
          is the only way the seasonal shape becomes visible &mdash; one year in
          one city is typically only a handful of sightings.
        </p>
        <p>
          Selecting a single year adds an amber line showing that city&rsquo;s
          all-year monthly average, so the chosen year can be compared against its
          own normal season. Both series are counts per month on the same axis.
        </p>
        <p>
          A note on the data: sightings in this dataset are spread fairly evenly
          across the calendar, so the chart does not show the strong spring peak
          that UK tick activity really has. That is a property of the supplied
          dataset, not of the chart &mdash; and worth knowing before drawing
          seasonal conclusions from it.
        </p>
      </Disclosure>
    </div>
  );
}
