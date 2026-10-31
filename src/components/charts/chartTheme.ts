/**
 * Theme-dependent chart colours and shared axis configuration.
 *
 * Recharts writes several colours into SVG attributes where a `var()` reference
 * is not honoured consistently, so axis and grid colours are resolved from the
 * computed custom properties after mount and refreshed when the theme changes.
 * Everything that *can* stay a `var()` does.
 *
 * Mark styling follows one set of rules across every chart in the app:
 *   - thin marks, with 4px rounded ends on the free end of a bar only
 *   - 2px stroke on lines, 8px or larger markers
 *   - a surface-coloured gap between adjacent fills
 *   - recessive grid: hairlines on the measurement axis only, no chart border
 *   - direct labels used selectively, never a number on every point
 *
 * Kept as a `.ts` module with no component exports so that editing the chart
 * components next door does not defeat React Fast Refresh.
 */

import { useEffect, useState } from 'react';
import { resolveCssVar } from '../../lib/colors';

export interface ChartTheme {
  grid: string;
  axis: string;
  muted: string;
  surface: string;
}

function readTheme(): ChartTheme {
  return {
    grid: resolveCssVar('--grid-line', '#e4eaf3'),
    axis: resolveCssVar('--axis-line', '#b3c1d6'),
    muted: resolveCssVar('--ink-muted', '#5d6b82'),
    surface: resolveCssVar('--surface', '#ffffff'),
  };
}

/**
 * Resolves theme-dependent chart colours. Re-resolves when the document's
 * `data-theme` attribute changes or the OS scheme flips, because the computed
 * value of every token changes with it.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readTheme);

  useEffect(() => {
    const refresh = () => setTheme(readTheme());

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', refresh);

    return () => {
      observer.disconnect();
      query.removeEventListener('change', refresh);
    };
  }, []);

  return theme;
}

/** Shared axis props, so every chart's ticks look identical. */
export function axisProps(theme: ChartTheme) {
  return {
    tick: { fill: theme.muted, fontSize: 12 },
    stroke: theme.axis,
    tickLine: false,
  } as const;
}
