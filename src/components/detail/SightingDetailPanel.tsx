/**
 * Detail panel for a selected sighting.
 *
 * Rendered as a side panel on desktop and a bottom sheet on a phone, with the
 * same markup and semantics in both — only the CSS differs.
 *
 * ACCESSIBILITY NOTES
 * -------------------
 * The panel is a non-modal `complementary` region, not a dialog. That is a
 * deliberate choice: the map stays live and interactive behind it, so trapping
 * focus would be wrong and would stop the user clicking a second marker to
 * compare. What it does instead:
 *
 *  - Moves focus to the panel heading when it opens, so a keyboard user is not
 *    left stranded back on the map with no idea anything appeared.
 *  - Closes on Escape and returns focus to where it came from.
 *  - Announces its own arrival through a live region in the parent page.
 *
 * It also shows the full severity derivation. The rating is modelled, so the
 * user gets to see the working rather than being asked to trust a colour.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Sighting } from '../../types/sighting';
import { Icon } from '../ui/Icon';
import { Alert, Disclosure, Meter, SeverityBadge } from '../ui/primitives';
import { ActivityTimeline } from './ActivityTimeline';
import { sightingsInArea } from '../../lib/stats';
import { findSpecies } from '../../data/species';
import { findCity } from '../../data/cities';
import { severityColor } from '../../lib/colors';
import { formatAgeFrom, formatDateFull, formatPercent, formatTime } from '../../lib/format';
import { directionsUrl, shareSighting, type ShareOutcome } from '../../lib/share';
import { SEVERITY_METHODOLOGY } from '../../lib/severity';
import { slugify } from '../../lib/slug';

export interface SightingDetailPanelProps {
  sighting: Sighting;
  /** All currently visible sightings, for the area timeline. */
  visibleSightings: readonly Sighting[];
  latestTimestamp: number;
  onClose: () => void;
  /** Called with a status message to be announced and shown as a toast. */
  onNotify: (message: string) => void;
  /** Present only for locally reported sightings. */
  onDelete?: (id: string) => void;
}

export function SightingDetailPanel({
  sighting,
  visibleSightings,
  latestTimestamp,
  onClose,
  onNotify,
  onDelete,
}: SightingDetailPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  /**
   * The copy-this-link fallback, tagged with the sighting it belongs to.
   *
   * Storing the id alongside the URL means switching sighting discards it
   * implicitly, rather than needing an effect to reset it — one less
   * setState-inside-an-effect, and no window where the panel shows one
   * sighting's heading above another's link.
   */
  const [shareFallback, setShareFallback] = useState<{ id: string; url: string } | null>(
    null,
  );
  const shareFallbackUrl =
    shareFallback?.id === sighting.id ? shareFallback.url : null;

  const species = findSpecies(sighting.species);
  const city = findCity(sighting.location);

  const areaSightings = useMemo(
    () => sightingsInArea(visibleSightings, sighting),
    [visibleSightings, sighting],
  );

  // Move focus to the heading on open and on change of sighting. The heading
  // carries tabIndex={-1} so it can receive focus programmatically without
  // becoming a tab stop of its own.
  useEffect(() => {
    headingRef.current?.focus();
  }, [sighting.id]);

  // Escape closes. Bound on the document rather than the panel because focus
  // may well be on a marker in the map when the user reaches for Escape.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleShare = async () => {
    const outcome: ShareOutcome = await shareSighting(sighting);
    switch (outcome.status) {
      case 'shared':
        onNotify('Sighting shared.');
        break;
      case 'copied':
        onNotify('Link copied to your clipboard.');
        break;
      case 'unsupported':
        // Neither sharing nor the clipboard is available: show the link so the
        // user can copy it by hand rather than leaving them with a dead button.
        setShareFallback({ id: sighting.id, url: outcome.url });
        onNotify('Copy the link shown in the panel to share this sighting.');
        break;
      case 'cancelled':
        break;
    }
  };

  return (
    <aside
      className="detail"
      aria-label={`Details for the ${sighting.species} sighting in ${sighting.location}`}
    >
      <header className="detail__header">
        <div className="detail__heading">
          <h2 className="detail__title" ref={headingRef} tabIndex={-1}>
            {sighting.species}
          </h2>
          <p className="detail__subtitle">{sighting.latinName}</p>
        </div>
        <button
          type="button"
          className="btn btn--icon btn--ghost"
          onClick={onClose}
          aria-label="Close sighting details"
        >
          <Icon name="close" size={20} />
        </button>
      </header>

      <div className="detail__body">
        {/* ------------------------------------------------- Status row */}
        <div className="row">
          <SeverityBadge level={sighting.severity} score={sighting.severityScore} />
          {sighting.isRecent ? <span className="badge badge--accent">Recent activity</span> : null}
          {sighting.source === 'local' ? (
            <span className="badge badge--brand">Your report</span>
          ) : null}
        </div>

        {/* ------------------------------------------------------ Facts */}
        <section>
          <h3 className="detail-section__title">Sighting record</h3>
          <dl className="facts">
            <dt>Date</dt>
            <dd>{formatDateFull(sighting.timestamp)}</dd>

            <dt>Time</dt>
            <dd>{formatTime(sighting.timestamp)}</dd>

            <dt>Location</dt>
            <dd>
              {sighting.location}
              {city ? <span className="text-muted"> &middot; {city.region}</span> : null}
            </dd>

            <dt>Species</dt>
            <dd>
              {sighting.species}
              <br />
              <span className="italic text-muted text-sm">{sighting.latinName}</span>
            </dd>

            <dt>Record age</dt>
            <dd>{formatAgeFrom(sighting.timestamp, latestTimestamp)}</dd>

            <dt>Record ID</dt>
            <dd className="font-mono text-xs">{sighting.id}</dd>
          </dl>

          <p className="text-xs text-muted" style={{ marginTop: 'var(--space-3)' }}>
            The source data records the city, not a precise position. The marker
            is placed within a few kilometres of the city centre so that
            same-city sightings do not stack on one point.
          </p>
        </section>

        {sighting.notes ? (
          <section>
            <h3 className="detail-section__title">Your notes</h3>
            <p className="text-sm">{sighting.notes}</p>
          </section>
        ) : null}

        {sighting.imageDataUrl ? (
          <section>
            <h3 className="detail-section__title">Your photograph</h3>
            <img
              src={sighting.imageDataUrl}
              alt={
                sighting.imageAlt ||
                `Photograph submitted with the ${sighting.species} sighting in ${sighting.location}`
              }
              style={{
                width: '100%',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            />
          </section>
        ) : null}

        {/* --------------------------------------------- Quick actions */}
        <section>
          <h3 className="detail-section__title">Quick actions</h3>
          <div className="quick-actions">
            <Link
              to={`/report?location=${encodeURIComponent(sighting.location)}&species=${encodeURIComponent(
                sighting.species,
              )}`}
              className="quick-action"
            >
              <Icon name="plus-circle" size={20} className="quick-action__icon" />
              Report a sighting
            </Link>

            <a
              className="quick-action"
              href={directionsUrl(sighting)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="directions" size={20} className="quick-action__icon" />
              Get directions
              <span className="sr-only">(opens Google Maps in a new tab)</span>
            </a>

            <button type="button" className="quick-action" onClick={() => void handleShare()}>
              <Icon name="share" size={20} className="quick-action__icon" />
              Share
            </button>
          </div>

          <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
            Directions route to the centre of {sighting.location}, which is the
            most precise location this dataset supports.
          </p>

          {shareFallbackUrl ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Alert tone="info" title="Copy this link" live="polite">
                <input
                  className="input font-mono text-xs"
                  readOnly
                  value={shareFallbackUrl}
                  aria-label="Shareable link to this sighting"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </Alert>
            </div>
          ) : null}
        </section>

        {/* ------------------------------------------------- Timeline */}
        <section>
          <h3 className="detail-section__title">Activity progression in this area</h3>
          <ActivityTimeline areaSightings={areaSightings} focus={sighting} />
        </section>

        {/* ------------------------------------- Severity derivation */}
        <section>
          <h3 className="detail-section__title">How this rating was derived</h3>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Meter
              value={sighting.severityScore}
              color={severityColor(sighting.severity)}
              startLabel="0"
              endLabel="100"
            />
          </div>

          <Alert tone="info">
            This rating is <strong>modelled by this application</strong>, not
            supplied by the API. The Elanco dataset carries no severity field, so
            the score below is computed from the data that is present. It
            describes relative local exposure, and is not a clinical assessment.
          </Alert>

          <ul className="breakdown" style={{ marginTop: 'var(--space-4)' }}>
            {sighting.severityBreakdown.components.map((component) => (
              <li key={component.label} className="breakdown__item">
                <div className="breakdown__head">
                  <span className="breakdown__label">{component.label}</span>
                  <span className="breakdown__value">
                    {formatPercent(component.value)} of {formatPercent(component.weight)}
                  </span>
                </div>
                <div className="breakdown__bar">
                  <div
                    className="breakdown__bar-fill"
                    style={{ width: `${Math.round(component.value * 100)}%` }}
                  />
                </div>
                <p className="breakdown__note">{component.explanation}</p>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Disclosure summary="Why these four levels?">
              <p>
                The boundaries are percentiles of the dataset&rsquo;s own score
                distribution rather than fixed numbers: the lowest-scoring{' '}
                {formatPercent(SEVERITY_METHODOLOGY.levelShares.low)} are Low,
                then {formatPercent(SEVERITY_METHODOLOGY.levelShares.moderate)}{' '}
                Moderate, {formatPercent(SEVERITY_METHODOLOGY.levelShares.high)}{' '}
                High and the top{' '}
                {formatPercent(SEVERITY_METHODOLOGY.levelShares.severe)} Severe.
              </p>
              <p>
                Fixed cut-offs were tried first and distributed badly on the real
                data, leaving under 1% of sightings in the lowest band and making
                three of the four filter options near-useless. Percentiles keep
                every level populated and make the rating&rsquo;s meaning explicit
                &mdash; it is a sighting&rsquo;s standing relative to the rest of
                the dataset.
              </p>
            </Disclosure>
          </div>
        </section>

        {/* ------------------------------------------- Species context */}
        {species ? (
          <section>
            <h3 className="detail-section__title">About this species</h3>
            <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
              {species.summary}
            </p>
            <dl className="key-value" style={{ marginTop: 'var(--space-3)' }}>
              <dt>Typical hosts</dt>
              <dd>{species.hosts}</dd>
              <dt>Habitat</dt>
              <dd>{species.habitat}</dd>
              <dt>Encounter risk</dt>
              <dd>{species.encounterLikelihood}</dd>
            </dl>
            <p style={{ marginTop: 'var(--space-3)' }}>
              <Link to={`/learn#species-${slugify(species.name)}`} className="text-sm">
                Full identification guide
                <Icon
                  name="arrow-right"
                  size={14}
                  style={{ display: 'inline', verticalAlign: '-2px', marginInlineStart: 4 }}
                />
              </Link>
            </p>
          </section>
        ) : null}

        {/* ------------------------------------------- Delete own report */}
        {sighting.source === 'local' && onDelete ? (
          <section>
            <h3 className="detail-section__title">Manage this report</h3>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                onDelete(sighting.id);
                onNotify('Your report was deleted.');
                onClose();
              }}
            >
              <Icon name="trash" size={16} />
              Delete this report
            </button>
          </section>
        ) : null}
      </div>

      <footer className="detail__footer">
        <Link to="/report" className="btn btn--accent btn--block">
          <Icon name="plus-circle" size={18} />
          Report a tick sighting
        </Link>
      </footer>
    </aside>
  );
}
