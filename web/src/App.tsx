import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { AppFooter } from './components/layout/AppFooter';
import { SightingsProvider } from './hooks/SightingsProvider';
import { Spinner } from './components/ui/primitives';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * Route-level code splitting.
 *
 * Only the landing route is eager. That used to be the map, so Leaflet had to
 * be in the entry chunk; now the dashboard landed in front of it and the map
 * moved to "/map", so Leaflet and its tile layer are a cost the first screen
 * no longer pays — it is deferred with everything else.
 *
 * The dashboard still pulls Recharts in eagerly, because its yearly-trend
 * chart is real content on that page rather than an optional extra.
 */
const MapPage = lazy(() =>
  import('./pages/MapPage').then((module) => ({ default: module.MapPage })),
);
const LearnPage = lazy(() =>
  import('./pages/LearnPage').then((module) => ({ default: module.LearnPage })),
);
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })),
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })),
);

/**
 * Page titles and focus on route change.
 *
 * A single-page app does not reload, so neither the document title nor keyboard
 * focus moves on navigation unless something moves them. Without this a screen
 * reader user activating a nav link hears nothing and stays focused where they
 * were, with no indication the page changed — one of the most common SPA
 * accessibility failures.
 */
const PAGE_TITLES: Record<string, string> = {
  '/': 'UK tick sighting dashboard',
  '/map': 'Tick sightings map',
  '/learn': 'Identify ticks and prevent bites',
  '/report': 'Report a tick sighting',
  '/about': 'How this was built',
};

function RouteAnnouncer() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    const title = PAGE_TITLES[pathname] ?? 'Page not found';
    document.title = `${title} — TickTrack UK`;

    // Skip the first render: focusing the main region on initial load would
    // steal focus from a deep link's target and scroll the user away from it.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const main = document.getElementById('main-content');
    main?.focus();
  }, [pathname]);

  return null;
}

/**
 * The map page owns the full viewport height below the header and scrolls
 * internally, so the footer is omitted there — it would be unreachable anyway,
 * and reserving space for it would shrink the map for nothing.
 */
function useHideFooter(): boolean {
  const { pathname } = useLocation();
  // Only the map owns the full viewport and scrolls internally, so it is the
  // one route where a footer would be unreachable.
  return pathname === '/map';
}

/**
 * "/" shows the dashboard — unless it carries a `?sighting=` parameter.
 *
 * The map used to live at "/", and the Share action produced links shaped
 * "/?sighting=<id>". Those URLs are already out in the world: in someone's
 * messages, in a browser history, possibly in a submission. Moving the map to
 * "/map" without handling them would land the visitor on the dashboard with
 * the parameter silently dropped — the link would appear to work while doing
 * nothing, which is worse than a 404.
 *
 * So the parameter is treated as the routing signal it is, and the whole query
 * string is carried across. `replace` keeps the dead URL out of history, so
 * Back does not bounce between the two.
 */
function HomeRoute() {
  const { search } = useLocation();
  const hasSighting = new URLSearchParams(search).has('sighting');
  return hasSighting ? <Navigate to={`/map${search}`} replace /> : <DashboardPage />;
}

export default function App() {
  const hideFooter = useHideFooter();

  return (
    <SightingsProvider>
      <RouteAnnouncer />

      {/* First focusable element on the page, revealed on focus. */}
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="app">
        <AppHeader />

        <main
          className="app__main"
          id="main-content"
          /* Focusable so route changes can move focus here, but not a tab stop
             in normal use. */
          tabIndex={-1}
          style={{ outline: 'none' }}
        >
          <Suspense
            fallback={
              <div className="loading-panel">
                <p className="loading-panel__title">
                  <Spinner label="Loading page" /> Loading
                </p>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>

        {hideFooter ? null : <AppFooter />}
      </div>
    </SightingsProvider>
  );
}
