/**
 * Filter controls: date range, species, severity, city and recency.
 *
 * WHERE THE COUNTS COME FROM
 * Each option shows how many sightings it would yield. That used to be
 * computed by running the filter predicate over the in-memory dataset once per
 * option. It now comes from the `facets` block the API returns alongside every
 * search — Postgres computes all three dimensions in a single UNION'd GROUP BY
 * on the same filtered set, so the numbers arrive with the results rather than
 * costing a request each.
 *
 * NATIVE CONTROLS
 * Checkboxes, date inputs and a select, restyled rather than replaced. A custom
 * date picker would mean rebuilding a calendar grid, roving focus, locale
 * handling and screen-reader semantics from scratch, and would still be worse
 * on mobile than the platform picker.
 */

import { useId } from 'react';
import type { Facets, Filters, SeverityLevel } from '../../types/sighting';
import { SEVERITY_LEVELS } from '../../types/sighting';
import { SEVERITY_LABELS, activeFilterCount, isDefaultFilters } from '../../lib/display';
import { severityColor, speciesColor } from '../../lib/colors';
import { formatNumber } from '../../lib/format';
import { Icon } from '../ui/Icon';

export interface FilterPanelProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
  /** Server-computed counts for the current filter context. */
  facets: Facets;
  /** Total matching the current filters. */
  resultCount: number;
  /** Total in the dataset, for the "x of y" line. */
  datasetTotal: number;
  speciesPresent: readonly string[];
  citiesPresent: readonly string[];
  /** `YYYY-MM-DD` bounds from the dataset, for the date inputs. */
  minDate: string;
  maxDate: string;
  recentWindowDays: number;
  localReportCount: number;
  /** True while a filtered request is in flight. */
  isFetching: boolean;
  onClose?: () => void;
}

export function FilterPanel({
  filters,
  onChange,
  onReset,
  facets,
  resultCount,
  datasetTotal,
  speciesPresent,
  citiesPresent,
  minDate,
  maxDate,
  recentWindowDays,
  localReportCount,
  isFetching,
  onClose,
}: FilterPanelProps) {
  const fromId = useId();
  const toId = useId();
  const cityId = useId();

  const toggleSpecies = (species: string) => {
    const next = new Set(filters.species);
    if (next.has(species)) next.delete(species);
    else next.add(species);
    onChange({ ...filters, species: next });
  };

  const toggleSeverity = (level: SeverityLevel) => {
    const next = new Set(filters.severities);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    onChange({ ...filters, severities: next });
  };

  const activeCount = activeFilterCount(filters);
  const isDefault = isDefaultFilters(filters);

  /**
   * A date range entered backwards. Flagged rather than silently swapped:
   * swapping would quietly change what the user asked for, and the API rejects
   * it anyway — so saying so here is faster and clearer than a round trip.
   */
  const rangeInverted =
    filters.dateFrom !== '' && filters.dateTo !== '' && filters.dateFrom > filters.dateTo;

  return (
    <div className="filters">
      {onClose ? (
        <button
          type="button"
          className="btn btn--icon btn--ghost sidebar__close"
          onClick={onClose}
          aria-label="Close filters"
        >
          <Icon name="close" size={20} />
        </button>
      ) : null}

      <div className="filters__head">
        <div className="filters__heading-group">
          <h2 className="filters__title">
            Filters
            {activeCount > 0 ? (
              <span className="badge badge--brand">{activeCount} active</span>
            ) : null}
          </h2>
          <p className="filters__count" aria-live="polite">
            <strong className="tabular">{formatNumber(resultCount)}</strong> of{' '}
            {formatNumber(datasetTotal)} shown
            {isFetching ? <span className="text-muted"> &middot; updating</span> : null}
          </p>
        </div>

        {!isDefault ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onReset}>
            Clear all
          </button>
        ) : null}
      </div>

      {/* ---------------------------------------------------- Date range */}
      <fieldset className="filter-group">
        <legend className="filter-group__legend">Date range</legend>

        <div className="field">
          <label className="field__label" htmlFor={fromId}>
            From
          </label>
          <input
            id={fromId}
            type="date"
            className="input"
            value={filters.dateFrom}
            min={minDate}
            max={maxDate}
            aria-invalid={rangeInverted}
            aria-describedby={rangeInverted ? `${fromId}-error` : undefined}
            onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor={toId}>
            To
          </label>
          <input
            id={toId}
            type="date"
            className="input"
            value={filters.dateTo}
            min={minDate}
            max={maxDate}
            aria-invalid={rangeInverted}
            onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
          />
        </div>

        {rangeInverted ? (
          <p className="field__error" id={`${fromId}-error`} role="alert">
            <Icon name="alert-circle" size={15} className="field__icon" />
            The start date is after the end date, so nothing can match. Swap them to
            see results.
          </p>
        ) : (
          <p className="filter-group__hint">
            Data runs from {minDate} to {maxDate}.
          </p>
        )}

        <label className="option">
          <input
            type="checkbox"
            className="option__input"
            checked={filters.recentOnly}
            onChange={(event) => onChange({ ...filters, recentOnly: event.target.checked })}
          />
          <span className="option__label">
            <span className="option__text">Most recent {recentWindowDays} days only</span>
          </span>
        </label>
        <p className="filter-group__hint">
          Counted back from the newest record in the dataset, not from today.
        </p>
      </fieldset>

      {/* ------------------------------------------------------- Species */}
      <fieldset className="filter-group">
        <legend className="filter-group__legend">Species</legend>
        <p className="filter-group__hint">
          {filters.species.size === 0
            ? 'All species shown. Tick to narrow.'
            : `${filters.species.size} of ${speciesPresent.length} selected.`}
        </p>
        {speciesPresent.map((species) => {
          const count = facets.species[species] ?? 0;
          return (
            <label key={species} className={`option${count === 0 ? ' option--empty' : ''}`}>
              <input
                type="checkbox"
                className="option__input"
                checked={filters.species.has(species)}
                onChange={() => toggleSpecies(species)}
              />
              <span className="option__label">
                {/* The swatch ties the filter to the colour used on the map
                    and in every chart. */}
                <span
                  className="swatch swatch--round"
                  style={{ background: speciesColor(species) }}
                  aria-hidden="true"
                />
                <span className="option__text">{species}</span>
                <span className="option__count">{formatNumber(count)}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* ------------------------------------------------------ Severity */}
      <fieldset className="filter-group">
        <legend className="filter-group__legend">Derived risk rating</legend>
        <p className="filter-group__hint">
          Modelled server-side from local activity, species and season. Not a
          clinical grading.
        </p>
        {SEVERITY_LEVELS.map((level) => {
          const count = facets.severity[level] ?? 0;
          return (
            <label key={level} className={`option${count === 0 ? ' option--empty' : ''}`}>
              <input
                type="checkbox"
                className="option__input"
                checked={filters.severities.has(level)}
                onChange={() => toggleSeverity(level)}
              />
              <span className="option__label">
                <span
                  className="swatch swatch--round"
                  style={{ background: severityColor(level) }}
                  aria-hidden="true"
                />
                <span className="option__text">{SEVERITY_LABELS[level]}</span>
                <span className="option__count">{formatNumber(count)}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* ---------------------------------------------------------- City */}
      <fieldset className="filter-group">
        <legend className="filter-group__legend">Location</legend>
        <div className="field">
          <label className="field__label" htmlFor={cityId}>
            City
          </label>
          <select
            id={cityId}
            className="select"
            value={filters.city}
            onChange={(event) => onChange({ ...filters, city: event.target.value })}
          >
            <option value="">All locations</option>
            {citiesPresent.map((city) => {
              const count = facets.city[city];
              return (
                <option key={city} value={city}>
                  {city}
                  {count !== undefined ? ` (${formatNumber(count)})` : ''}
                </option>
              );
            })}
          </select>
        </div>
      </fieldset>

      {/* -------------------------------------------------- Own reports */}
      {localReportCount > 0 || !filters.includeLocal ? (
        <fieldset className="filter-group">
          <legend className="filter-group__legend">Community reports</legend>
          <label className="option">
            <input
              type="checkbox"
              className="option__input"
              checked={filters.includeLocal}
              onChange={(event) => onChange({ ...filters, includeLocal: event.target.checked })}
            />
            <span className="option__label">
              <span className="option__text">Include reported sightings</span>
              <span className="option__count">{formatNumber(localReportCount)}</span>
            </span>
          </label>
          <p className="filter-group__hint">
            Sightings submitted through this app, shown as square markers.
          </p>
        </fieldset>
      ) : null}
    </div>
  );
}
