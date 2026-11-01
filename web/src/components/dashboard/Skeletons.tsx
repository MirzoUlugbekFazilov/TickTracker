/**
 * Loading placeholders for the dashboard panels.
 *
 * Each one mirrors the real content's layout so the panel does not change
 * height when data lands — the jump is more distracting than the wait. They
 * are `aria-hidden`; the announcement comes from the panel's own live region,
 * because a screen reader walking a dozen empty boxes is noise, not progress.
 */

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-rows__row">
          {/* Widths vary so it reads as content rather than a loading bar. */}
          <span className="skeleton" style={{ width: `${26 + (index % 3) * 8}%`, height: 13 }} />
          <span
            className="skeleton"
            style={{ width: `${70 - index * 9}%`, height: 10, borderRadius: 999 }}
          />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-list__row">
          <span className="skeleton skeleton--dot" />
          <span className="skeleton-list__text">
            <span className="skeleton" style={{ width: `${44 + (index % 3) * 10}%`, height: 13 }} />
            <span className="skeleton" style={{ width: '32%', height: 10 }} />
          </span>
          <span className="skeleton" style={{ width: 54, height: 18, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="stat" aria-hidden="true">
      <span className="skeleton" style={{ width: '55%', height: 10 }} />
      <span className="skeleton" style={{ width: '70%', height: 28, marginTop: 8 }} />
      <span className="skeleton" style={{ width: '85%', height: 10, marginTop: 8 }} />
    </div>
  );
}
