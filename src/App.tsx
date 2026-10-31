import { Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { AppFooter } from './components/layout/AppFooter';
import { SightingsProvider } from './hooks/SightingsProvider';
import { Spinner } from './components/ui/primitives';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * Route-level code splitting.
 *
 * The map is the landing route and is loaded eagerly. Everything else is
 * deferred, which matters because Recharts is by far the heaviest dependency in
 * the app and only the Learn page uses it — bundling it into the initial
 * download would make the map slower to appear for a cost most visitors never
 * benefit from. Splitting these three routes takes the entry chunk from roughly
 * 930 KB to about half that.
 */
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
  '/': 'Tick sightings map',
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
  return pathname === '/';
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
              <Route path="/" element={<MapPage />} />
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
