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
import { MEDICAL_DISCLAIMER } from '../data/prevention';

export function ReportPage() {
  const { addReport, reports, removeReport } = useSightings();

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
                This submission is <strong>frontend only</strong>. The Elanco API
                is read-only &mdash; a <code>POST</code> to{' '}
                <code>/data/tick-sightings</code> returns{' '}
                <code>405 Method Not Allowed</code> &mdash; so there is nowhere to
                send a new sighting.
              </p>
              <p style={{ marginTop: 'var(--space-2)' }}>
                Rather than show a success message for a request that could never
                succeed, reports are saved in this browser&rsquo;s local storage
                and merged into the same dataset as the API records. They appear
                on the map, in the timelines and in the charts, and they survive a
                reload &mdash; but they are visible only to you, and clearing site
                data removes them.
              </p>
            </Alert>

            <Disclosure summary="What a real backend would change">
              <p>
                One module, <code>src/lib/localReports.ts</code>, is the only code
                that knows where reports live. Its four functions &mdash; load,
                save, delete, clear &mdash; would become calls against a real API,
                and nothing else in the app would need to change.
              </p>
              <p>
                The validation in <code>src/lib/validation.ts</code> would also
                need re-implementing server-side. Client-side validation is a
                courtesy to the user, never a security boundary: anything the
                browser checks, a determined client can skip. The same applies to
                the image type and size limits.
              </p>
            </Disclosure>
          </div>
        </div>

        <aside aria-labelledby="your-reports-heading">
          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title" id="your-reports-heading">
                  Your reports
                </h2>
                <p className="card__subtitle">
                  {reports.length === 0
                    ? 'Nothing reported from this browser yet'
                    : `${formatNumber(reports.length)} saved in this browser`}
                </p>
              </div>
            </div>

            <div className="card__body">
              {reports.length === 0 ? (
                <EmptyState icon="map-pin" title="No reports yet">
                  Anything you submit will be listed here so you can review or
                  remove it.
                </EmptyState>
              ) : (
                <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: 'var(--space-3)' }}>
                  {[...reports]
                    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
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
                          {report.location} &middot; {report.date} at {report.time}
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
                            onClick={() => removeReport(report.id)}
                          >
                            <Icon name="trash" size={15} />
                            Delete
                            <span className="sr-only">
                              {' '}
                              the {report.species} report from {report.location} on{' '}
                              {report.date}
                            </span>
                          </button>
                        </div>
                        {report.imageDataUrl ? (
                          <img
                            src={report.imageDataUrl}
                            alt={
                              report.imageAlt ||
                              `Photograph attached to your ${report.species} report from ${report.location}`
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
                          Saved {formatDateShort(new Date(report.submittedAt).getTime())}
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
