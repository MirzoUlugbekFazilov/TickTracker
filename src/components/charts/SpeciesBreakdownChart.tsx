/**
 * Species composition, as a horizontal bar chart.
 *
 * Horizontal rather than vertical because the categories are five long text
 * labels ("Southern rodent tick"). Vertical columns would force those labels to
 * rotate, and rotated text is measurably slower to read.
 *
 * A pie chart was the other candidate and was rejected: comparing five similar
 * shares by angle is exactly the task humans are worst at, and four of these
 * five species sit within 40 records of each other.
 */

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Sighting } from '../../types/sighting';
import { speciesCounts } from '../../lib/stats';
import { speciesColor } from '../../lib/colors';
import { formatNumber } from '../../lib/format';
import { axisProps, useChartTheme } from './chartTheme';
import { ChartTooltipBody } from './chartParts';
import { Disclosure } from '../ui/primitives';
import { findSpecies } from '../../data/species';

export function SpeciesBreakdownChart({ sightings }: { sightings: readonly Sighting[] }) {
  const theme = useChartTheme();
  const data = useMemo(() => speciesCounts(sightings), [sightings]);
  const total = sightings.length;

  if (data.length === 0) {
    return (
      <div className="chart-card">
        <h3 className="card__title">Species recorded</h3>
        <div className="chart-empty">
          <p>No sightings match the current filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <h3 className="card__title">Species recorded</h3>
          <p className="card__subtitle">
            {formatNumber(total)} {total === 1 ? 'sighting' : 'sightings'} across{' '}
            {data.length} {data.length === 1 ? 'species' : 'species'}
          </p>
        </div>
      </div>

      <div className="chart-card__plot" style={{ height: 40 + data.length * 46 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
            barCategoryGap="26%"
          >
            {/* Vertical hairlines on a horizontal bar chart: the grid runs with
                the value axis, which is the direction the eye needs to measure. */}
            <CartesianGrid stroke={theme.grid} horizontal={false} />
            <XAxis type="number" {...axisProps(theme)} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="species"
              {...axisProps(theme)}
              width={150}
              /* The labels are the legend here — a separate legend box for a
                 single-series chart would be redundant. */
            />
            <Tooltip
              cursor={{ fill: 'rgb(125 125 125 / 0.08)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as (typeof data)[number] | undefined;
                if (!point) return null;
                const info = findSpecies(point.species);
                return (
                  <ChartTooltipBody
                    title={point.species}
                    rows={[
                      {
                        label: 'Sightings',
                        value: point.count,
                        color: speciesColor(point.species),
                      },
                    ]}
                    footer={
                      <>
                        {((point.count / total) * 100).toFixed(1)}% of those shown
                        {info ? ` · ${info.latinName}` : ''}
                      </>
                    }
                  />
                );
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={30}>
              {data.map((point) => (
                /* Per-cell colour keeps each species on its own fixed slot, so
                   the colours match the filter swatches and the map. */
                <Cell key={point.species} fill={speciesColor(point.species)} />
              ))}
              {/* Direct value labels: the only way to read exact counts without
                  hovering, and the relief required because three of the five
                  light-mode species colours sit below 3:1 on white. */}
              <LabelList
                dataKey="count"
                position="right"
                style={{ fill: theme.muted, fontSize: 12, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Disclosure summary="View as a table">
        <div className="scroll-x">
          <table className="data-table">
            <caption>Sightings by species, for the current filters.</caption>
            <thead>
              <tr>
                <th scope="col">Species</th>
                <th scope="col">Latin name</th>
                <th scope="col">Sightings</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.species}>
                  <th scope="row">{point.species}</th>
                  <td className="italic" style={{ textAlign: 'start' }}>
                    {findSpecies(point.species)?.latinName ?? '—'}
                  </td>
                  <td>{formatNumber(point.count)}</td>
                  <td>{((point.count / total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
