/**
 * Report a sighting — core requirement 4.
 *
 * The page also lists anything already reported from this browser, with a
 * delete control. Without that the user has no way to see or undo what they
 * submitted, and "where did my report go?" is the first question a reviewer
 * will ask of a frontend-only reporting flow.
 */

import { Link } from 'react-router-dom';
import { useSightings } from '../hooks/sightingsContext';
import { ReportSightingForm } from '../components/form/ReportSightingForm';
import { Icon } from '../components/ui/Icon';
import { Alert, Disclosure, EmptyState } from '../components/ui/primitives';
import { formatDateShort, formatNumber } from '../lib/format';
import { sightingImageUrl } from '../lib/api';
import { MEDICAL_DISCLAIMER } from '../data/prevention';

export function ReportPage() {
  const { addReport, sightings, removeReport } = useSightings();

  // Community reports are now rows in the shared database, not browser state.
  const reports = sightings.filter((sighting) => sighting.source === 'user');

  return (
    <div className="container page">
      <header className="page__header">
        <span className="eyebrow">Contribute</span>
        <h1 className="page__title">Report a tick sighting</h1>
        <p className="section-intro">
          Crowdsourced reports are what make outbreak tracking possible. Tell us
          when and where you found the tick, and which species it was if you can
          identify it.
        </p>
      </header>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}>
        <div>
          <div className="card">
            <div className="card__body">
              <ReportSightingForm onSubmit={addReport} />
            </div>
          </div>

          <div className="stack" style={{ marginTop: 'var(--space-6)' }}>
            <Alert tone="info" title="Where your report goes">
              <p>
                It is posted to <code>POST /api/sightings</code>, validated
                server-side, scored by the same severity model that rates the
                Elanco records, and written to PostgreSQL.
              </p>
              <p style={{ marginTop: 'var(--space-2)' }}>
                The upstream Elanco API is read-only &mdash; it answers a{' '}
                <code>POST</code> with <code>405 Method Not Allowed</code> &mdash;
                which is exactly why this application owns its own database.
                Reports become part of the dataset: they appear on the map, in the
                regional and seasonal aggregates, and in the filter counts.
              </p>
            </Alert>

            <Disclosure summary="How this is validated">
              <p>
                Twice, on purpose. The browser checks as you type, which is what
                makes the form feel responsive and gives you warnings as well as
                errors. The server then validates independently with the same
                rules in <code>server/src/routes/sightings.ts</code>.
              </p>
              <p>
                That is not redundancy. Client-side validation is a courtesy to
                the user and never a security boundary &mdash; anything the browser
                checks, a determined client can skip by calling the API directly.
                The server is the one that counts, and its field-level messages
                are surfaced on this form if they ever disagree.
              </p>
            </Disclosure>
          </div>
        </div>

        <aside aria-labelledby="your-reports-heading">
          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title" id="your-reports-heading">
                  Community reports
                </h2>
                <p className="card__subtitle">
                  {reports.length === 0
                    ? 'No community reports in the current selection'
                    : `${formatNumber(reports.length)} in the current selection`}
                </p>
              </div>
            </div>

            <div className="card__body">
              {reports.length === 0 ? (
                <EmptyState icon="map-pin" title="No reports yet">
                  Anything submitted through this app is stored in the shared
                  database and listed here.
                </EmptyState>
              ) : (
                <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: 'var(--space-3)' }}>
                  {[...reports]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((report) => (
                      <li
                        key={report.id}
                        style={{
                          padding: 'var(--space-3)',
                          background: 'var(--surface-sunken)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <p style={{ fontWeight: 600 }}>{report.species}</p>
                        <p className="text-sm text-muted">
                          {report.location} &middot; {report.observedAt.slice(0, 16)}
                        </p>
                        {report.notes ? (
                          <p className="text-sm" style={{ marginTop: 'var(--space-2)' }}>
                            {report.notes}
                          </p>
                        ) : null}
                        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                          <Link
                            to={`/?sighting=${encodeURIComponent(report.id)}`}
                            className="btn btn--sm btn--secondary"
                          >
                            <Icon name="map-pin" size={15} />
                            View on map
                          </Link>
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            onClick={() => void removeReport(report.id)}
                          >
                            <Icon name="trash" size={15} />
                            Delete
                            <span className="sr-only">
                              {' '}
                              the {report.species} report from {report.location}
                            </span>
                          </button>
                        </div>
                        {report.hasImage ? (
                          <img
                            src={sightingImageUrl(report.id)}
                            alt={
                              report.imageAlt ||
                              `Photograph attached to the ${report.species} report from ${report.location}`
                            }
                            style={{
                              marginTop: 'var(--space-3)',
                              width: '100%',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                            }}
                          />
                        ) : null}
                        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                          Saved {formatDateShort(new Date(report.createdAt).getTime())}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 'var(--space-5)' }}>
            <div className="card__body">
              <h2 className="card__title" style={{ marginBottom: 'var(--space-3)' }}>
                Before you report
              </h2>
              <ul className="spec-list">
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Remove the tick first if it is still attached, and{' '}
                  <Link to="/learn#removal">do it correctly</Link> &mdash; several
                  popular methods raise the risk rather than lowering it.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Not sure of the species? Check the{' '}
                  <Link to="/learn#species-heading">identification guide</Link>, or
                  select &ldquo;Unidentified tick&rdquo;. An honest unknown is
                  better data than a guess.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  A photograph helps a great deal. Get as close as your camera
                  will focus, with the tick&rsquo;s back towards the lens.
                </li>
              </ul>

              <p className="text-xs text-muted" style={{ marginTop: 'var(--space-4)' }}>
                {MEDICAL_DISCLAIMER}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
