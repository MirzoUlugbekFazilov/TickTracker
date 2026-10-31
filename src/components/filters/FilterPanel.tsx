/**
 * Filter controls: date range, species, severity, city and recency.
 *
 * Two design decisions worth calling out.
 *
 * LIVE COUNTS. Every option shows how many sightings it would yield *given the
 * other active filters*. A filter UI that lets you pick a combination returning
 * nothing, and only tells you afterwards, wastes the user's time; showing the
 * count up front makes the data's shape visible while you explore it. This is
 * affordable because all 1,000 records are in memory — each count is one array
 * pass, and the whole panel is a few dozen of them, memoised.
 *
 * NATIVE CONTROLS. Checkboxes, date inputs and a select, restyled rather than
 * replaced. A custom date picker would need a calendar grid, keyboard roving
 * focus, locale handling and screen-reader semantics rebuilt from scratch, and
 * would still be worse on mobile than the platform picker.
 */

import { useId, useMemo } from 'react';
import type { Filters, SeverityLevel, Sighting } from '../../types/sighting';
import { SEVERITY_LEVELS } from '../../types/sighting';
import { SEVERITY_LABELS } from '../../data/species';
import { severityColor, speciesColor } from '../../lib/colors';
import { activeFilterCount, isDefaultFilters, matchesFilters } from '../../lib/filters';
import { formatNumber, toDateInputValue } from '../../lib/format';
import { Icon } from '../ui/Icon';
import { RECENT_WINDOW_DAYS } from '../../lib/normalise';

export interface FilterPanelProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
  /** Every sighting, before filtering — the denominator for the counts. */
  allSightings: readonly Sighting[];
  /** After filtering — the headline count. */
  resultCount: number;
  speciesPresent: readonly string[];
  citiesPresent: readonly string[];
  earliestTimestamp: number;
  latestTimestamp: number;
  recentSince: number;
  localReportCount: number;
  /** Mobile sheet close handler. */
  onClose?: () => void;
}

export function FilterPanel({
  filters,
  onChange,
  onReset,
  allSightings,
  resultCount,
  speciesPresent,
  citiesPresent,
  earliestTimestamp,
  latestTimestamp,
  recentSince,
  localReportCount,
  onClose,
}: FilterPanelProps) {
  const fromId = useId();
  const toId = useId();
  const cityId = useId();

  const context = useMemo(() => ({ recentSince }), [recentSince]);

  /**
   * Count for a hypothetical filter state. Used to answer "what would I get if
   * I ticked this?" without mutating anything.
   */
  const countWith = useMemo(() => {
    return (override: Partial<Filters>): number => {
      const candidate: Filters = { ...filters, ...override };
      let count = 0;
      for (const sighting of allSightings) {
        if (matchesFilters(sighting, candidate, context)) count += 1;
      }
      return count;
    };
  }, [filters, allSightings, context]);

  const speciesCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const species of speciesPresent) {
      // Count as if this species were the only one selected, so the number
      // answers "how many of these are there", not "how many are selected".
      result.set(species, countWith({ species: new Set([species]) }));
    }
    return result;
  }, [speciesPresent, countWith]);

  const severityCountMap = useMemo(() => {
    const result = new Map<SeverityLevel, number>();
    for (const level of SEVERITY_LEVELS) {
      result.set(level, countWith({ severities: new Set([level]) }));
    }
    return result;
  }, [countWith]);

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

  const minDate = toDateInputValue(earliestTimestamp);
  const maxDate = toDateInputValue(latestTimestamp);
  const activeCount = activeFilterCount(filters);
  const isDefault = isDefaultFilters(filters);

  /**
   * A date range the user has entered backwards. Flagged rather than silently
   * swapped: swapping would quietly change what they asked for, and an empty
   * result with no explanation looks like a broken app.
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
        <h2 className="filters__title">
          Filters
          {activeCount > 0 ? (
            <span className="badge badge--brand" style={{ marginInlineStart: 8 }}>
              {activeCount} active
            </span>
          ) : null}
        </h2>
        {!isDefault ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onReset}>
            Clear all
          </button>
        ) : null}
      </div>

      <p className="text-sm text-muted" style={{ marginTop: 'calc(var(--space-4) * -1)' }}>
        <strong className="tabular" style={{ color: 'var(--ink)' }}>
          {formatNumber(resultCount)}
        </strong>{' '}
        of {formatNumber(allSightings.length)} sightings shown
      </p>

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
            The start date is after the end date, so nothing can match. Swap them
            to see results.
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
            <span className="option__text">Most recent {RECENT_WINDOW_DAYS} days only</span>
            <span className="option__count">{formatNumber(countWith({ recentOnly: true }))}</span>
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
          const count = speciesCounts.get(species) ?? 0;
          return (
            <label key={species} className={`option${count === 0 ? ' option--empty' : ''}`}>
              <input
                type="checkbox"
                className="option__input"
                checked={filters.species.has(species)}
                onChange={() => toggleSpecies(species)}
              />
              <span className="option__label">
                {/* The swatch ties the filter to the colour used in every chart. */}
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
          Modelled from local activity, species and season. Not a clinical
          grading.
        </p>
        {SEVERITY_LEVELS.map((level) => {
          const count = severityCountMap.get(level) ?? 0;
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
            <option value="">All locations ({formatNumber(countWith({ city: '' }))})</option>
            {citiesPresent.map((city) => (
              <option key={city} value={city}>
                {city} ({formatNumber(countWith({ city }))})
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* -------------------------------------------------- Own reports */}
      {localReportCount > 0 ? (
        <fieldset className="filter-group">
          <legend className="filter-group__legend">Your reports</legend>
          <label className="option">
            <input
              type="checkbox"
              className="option__input"
              checked={filters.includeLocal}
              onChange={(event) => onChange({ ...filters, includeLocal: event.target.checked })}
            />
            <span className="option__label">
              <span className="option__text">Include sightings you reported</span>
              <span className="option__count">{formatNumber(localReportCount)}</span>
            </span>
          </label>
          <p className="filter-group__hint">
            Stored in this browser only, and shown as square markers.
          </p>
        </fieldset>
      ) : null}
    </div>
  );
}
