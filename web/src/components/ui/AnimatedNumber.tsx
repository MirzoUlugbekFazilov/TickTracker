/**
 * A number that counts to its new value instead of snapping.
 *
 * WHY THIS EXISTS
 * ---------------
 * The headline count changes every time a filter moves. Snapping from 1,000 to
 * 171 gives no sense of direction or magnitude — the figure is simply different
 * now. A short roll communicates both, and more importantly it draws the eye to
 * the one element on screen that actually responded to the input. It is the
 * cheapest possible confirmation that a control did something.
 *
 * Three details that separate this from the usual implementation:
 *
 *  - It animates the *displayed* value only. The real value is always correct
 *    in the DOM for assistive technology, because the element carries
 *    `aria-live="off"` and the accessible announcement is handled by the
 *    filter panel's own live region. A counter that announced every
 *    intermediate frame would be unusable with a screen reader.
 *
 *  - It is driven by `requestAnimationFrame` with an eased curve, not by
 *    `setInterval` with a fixed step. An interval drifts against the refresh
 *    rate and produces visible stutter.
 *
 *  - It respects `prefers-reduced-motion` by snapping, and it skips the
 *    animation entirely on first mount — a number that rolls up from zero on
 *    page load is a gimmick, not feedback.
 */

import { useEffect, useRef, useState } from 'react';

/** Cubic ease-out: fast at first, settling softly. Matches --ease-out. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export interface AnimatedNumberProps {
  value: number;
  /** Milliseconds for the full roll. */
  duration?: number;
  /** Formatter for the displayed value. Defaults to en-GB thousands. */
  format?: (value: number) => string;
  className?: string;
}

export function AnimatedNumber({
  value,
  duration = 420,
  format = (n) => n.toLocaleString('en-GB'),
  className,
}: AnimatedNumberProps) {
  const [displayed, setDisplayed] = useState(value);
  const frameRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);
  // Tracked in a ref rather than read from state inside the effect, so the
  // animation always starts from what is actually on screen even if a second
  // change interrupts the first mid-roll.
  const displayedRef = useRef(value);

  useEffect(() => {
    // No roll on mount.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = displayedRef.current;
    const delta = value - from;

    // Snapping is correct for reduced motion, for a no-op change, and for a
    // change too small to perceive as motion anyway.
    if (prefersReduced || delta === 0 || Math.abs(delta) < 2) {
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const next = Math.round(from + delta * easeOut(progress));

      displayedRef.current = next;
      setDisplayed(next);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        // Land exactly on the target; the eased rounding can be a unit short.
        displayedRef.current = value;
        setDisplayed(value);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return (
    <span className={className} aria-live="off">
      {format(displayed)}
    </span>
  );
}
