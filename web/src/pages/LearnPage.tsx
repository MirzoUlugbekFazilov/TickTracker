/**
 * Education content — core requirement 3.
 *
 * Three sections, matching the three sub-requirements: species identification
 * guide (3a), prevention guidance (3b), and the seasonal activity chart with
 * city and year dropdowns (3c). The charts sit at the top because they answer
 * "what is happening near me", which is what brings someone to the page; the
 * reference content follows.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSightings } from '../hooks/sightingsContext';
import { SeasonalActivityChart } from '../components/charts/SeasonalActivityChart';
import { SpeciesBreakdownChart } from '../components/charts/SpeciesBreakdownChart';
import { YearlyTrendChart } from '../components/charts/YearlyTrendChart';
import { TickIllustration } from '../components/TickIllustration';
import { Icon } from '../components/ui/Icon';
import { Alert, Spinner } from '../components/ui/primitives';
import { SectionNav, type SectionNavItem } from '../components/layout/SectionNav';
import { SPECIES } from '../data/species';
import { MEDICAL_DISCLAIMER, PREVENTION_TOPICS } from '../data/prevention';
import { speciesColor } from '../lib/colors';
import { slugify } from '../lib/slug';

/** Drives the sticky in-page nav; ids must match the section headings below. */
const SECTIONS: readonly SectionNavItem[] = [
  { id: 'activity-heading', label: 'Seasonal activity' },
  { id: 'species-heading', label: 'Species guide' },
  { id: 'prevention-heading', label: 'Prevention' },
];

export function LearnPage() {
  const { state, meta, filters, error } = useSightings();

  const hasData = state === 'ready' && meta !== null;

  // London is the most recognisable default and has a healthy record count, so
  // the chart shows something meaningful before the user touches a dropdown.
  const cityNames = useMemo(
    () => (meta?.cities ?? []).map((city) => city.name).sort((a, b) => a.localeCompare(b, 'en-GB')),
    [meta],
  );

  /**
   * Years the dataset covers, derived from the reported date range rather than
   * from the loaded rows — the rows are now a filtered page, so deriving years
   * from them would shrink the dropdown as the user filters.
   */
  const yearsPresent = useMemo(() => {
    const earliest = meta?.dateRange.earliest;
    const latest = meta?.dateRange.latest;
    if (!earliest || !latest) return [];
    const from = Number(earliest.slice(0, 4));
    const to = Number(latest.slice(0, 4));
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }, [meta]);

  const defaultCity = useMemo(
    () => (cityNames.includes('London') ? 'London' : cityNames[0]),
    [cityNames],
  );

  return (
    <div className="container page">
      <header className="page__header">
        <span className="eyebrow">Learn</span>
        <h1 className="page__title">Identify ticks, understand the season, protect your pets</h1>
        <p className="section-intro">
          Everything on this page is drawn from the species that actually appear
          in the Elanco dataset, so the guide matches the sightings the map
          plots. Charts update with the real API data.
        </p>
      </header>

      <div className="page-with-nav">
        <SectionNav items={SECTIONS} />

        <div>
      {/* ===================================================== Charts (3c) */}
      <section className="section" aria-labelledby="activity-heading">
        <h2 className="section-heading" id="activity-heading">
          Seasonal activity charts
        </h2>
        <p className="section-intro" style={{ marginBottom: 'var(--space-5)' }}>
          Pick a city and a year to see when sightings were recorded there.
        </p>

        {state === 'loading' ? (
          <div className="loading-panel">
            <p className="loading-panel__title">
              <Spinner label="Loading" /> Loading chart data
            </p>
          </div>
        ) : state === 'error' ? (
          <Alert tone="warning" title="Charts unavailable">
            {error?.message ?? 'The sightings data could not be loaded.'} The
            identification and prevention guides below do not depend on the API
            and are unaffected.
          </Alert>
        ) : hasData ? (
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            <SeasonalActivityChart
              citiesPresent={cityNames}
              yearsPresent={yearsPresent}
              {...(defaultCity ? { defaultCity } : {})}
            />

            <div className="two-col">
              <SpeciesBreakdownChart filters={filters} />
              <YearlyTrendChart
                filters={filters}
                title="Reports per year, UK-wide"
                subtitle="All cities and species in the dataset"
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* ============================================ Species guide (3a) */}
      <section className="section" aria-labelledby="species-heading">
        <h2 className="section-heading" id="species-heading">
          Species identification guide
        </h2>
        <p className="section-intro" style={{ marginBottom: 'var(--space-5)' }}>
          The five species recorded in this dataset. Each card&rsquo;s colour
          matches the colour used for that species on the map and in every chart.
        </p>

        <Alert tone="info" title="What this guide covers, and what it does not">
          <p>
            These five species are the ones the Elanco dataset contains. Four are
            in the genus <em>Ixodes</em> and one in <em>Dermacentor</em>.
          </p>
          <p style={{ marginTop: 'var(--space-2)' }}>
            Worth knowing: the tick most often found on UK pets and people is{' '}
            <em>Ixodes ricinus</em>, the sheep or castor bean tick, and it does
            not appear in this dataset at all. The descriptions below stay at the
            level the evidence supports &mdash; genus-level ecology and
            morphology &mdash; rather than inventing species-level detail.
          </p>
        </Alert>

        <div className="species-grid stagger" style={{ marginTop: 'var(--space-5)' }}>
          {SPECIES.map((species, index) => (
            <article
              key={species.name}
              style={{ ['--i' as string]: index }}
              className="species-card"
              id={`species-${slugify(species.name)}`}
              aria-labelledby={`species-${slugify(species.name)}-name`}
            >
              <div
                className="species-card__accent"
                style={{ background: speciesColor(species.name) }}
              />
              <div className="species-card__body">
                <div className="species-card__head">
                  <div className="species-card__figure">
                    <TickIllustration
                      color={speciesColor(species.name)}
                      ornate={species.genus === 'Dermacentor'}
                      longMouthparts={species.genus === 'Ixodes'}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3
                      className="species-card__name"
                      id={`species-${slugify(species.name)}-name`}
                    >
                      {species.name}
                    </h3>
                    <p className="species-card__latin">{species.latinName}</p>
                    <p style={{ marginTop: 'var(--space-2)' }}>
                      <span className="badge badge--neutral">
                        {species.encounterLikelihood}
                      </span>
                    </p>
                  </div>
                </div>

                <p className="species-card__summary">{species.summary}</p>

                <div>
                  <h4 className="detail-section__title">What to look for</h4>
                  <ul className="spec-list">
                    {species.appearance.map((point) => (
                      <li key={point} className="spec-list__item">
                        <span className="spec-list__bullet" aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <dl className="key-value">
                  <dt>Size</dt>
                  <dd>{species.size}</dd>
                  <dt>Hosts</dt>
                  <dd>{species.hosts}</dd>
                  <dt>Habitat</dt>
                  <dd>{species.habitat}</dd>
                  <dt>Risk weighting</dt>
                  <dd>
                    {species.vectorWeight.toFixed(2)} of 1.00 &mdash;{' '}
                    {species.vectorNote}
                  </dd>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ========================================== Prevention tips (3b) */}
      <section className="section" aria-labelledby="prevention-heading">
        <h2 className="section-heading" id="prevention-heading">
          Prevention and removal
        </h2>
        <p className="section-intro" style={{ marginBottom: 'var(--space-5)' }}>
          Most tick bites are preventable, and almost all are harmless if the
          tick comes off promptly and correctly.
        </p>

        <Alert tone="warning" title="Not veterinary or medical advice">
          {MEDICAL_DISCLAIMER}
        </Alert>

        <div className="two-col stagger" style={{ marginTop: 'var(--space-5)' }}>
          {PREVENTION_TOPICS.map((topic, index) => (
            <article
              key={topic.id}
              style={{ ['--i' as string]: index }}
              className="card"
              id={topic.id}
              aria-labelledby={`${topic.id}-title`}
            >
              <div className="card__body">
                <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
                  <Icon
                    name={topic.id === 'removal' ? 'alert-triangle' : 'shield'}
                    size={20}
                    style={{ color: 'var(--brand-ink)' }}
                  />
                  <h3 className="card__title" id={`${topic.id}-title`}>
                    {topic.title}
                  </h3>
                </div>
                <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
                  {topic.summary}
                </p>
                <ul className="spec-list">
                  {topic.tips.map((tip) => (
                    <li key={tip} className="spec-list__item">
                      <span className="spec-list__bullet" aria-hidden="true" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

        </div>
      </div>

      <section className="section">
        <div className="hero">
          <span className="hero__glow" aria-hidden="true" />
          <div className="hero__inner">
            <span className="eyebrow hero__eyebrow">Contribute</span>
            <h2 className="hero__title">Found a tick? Add it to the map.</h2>
            <p className="hero__text">
              Crowdsourced reports are what make a tracker like this useful.
              Recording the date, place and species takes under a minute, and you
              can attach a photograph if you still have the tick.
            </p>
            <div className="hero__actions">
              <Link to="/report" className="btn btn--accent btn--lg">
                <Icon name="plus-circle" size={18} />
                Report a sighting
              </Link>
              <Link to="/" className="btn btn--secondary btn--lg">
                <Icon name="map-pin" size={18} />
                Back to the map
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
