/**
 * Light / dark / system theme.
 *
 * Three states, not two. "System" is the default and genuinely follows the OS
 * as it changes; the explicit choices stamp `data-theme` on `<html>`, which the
 * token stylesheet gives higher precedence than the media query so a user can
 * override a dark OS with a light app and vice versa.
 *
 * The initial value is applied by a tiny inline script in `index.html` so the
 * first paint is already correct — doing it here would flash the wrong theme.
 */

import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ticktrack.theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage blocked — fall through to system */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export interface ThemeState {
  preference: ThemePreference;
  /** What is actually on screen right now, after resolving "system". */
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light -> dark -> system, for a single toggle button. */
  cycle: () => void;
}

export function useTheme(): ThemeState {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : systemPrefersDark(),
  );

  // Keep following the OS while the preference is "system".
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }

    try {
      if (preference === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* storage blocked — the theme still applies for this session */
    }
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const cycle = useCallback(() => {
    setPreferenceState((current) =>
      current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light',
    );
  }, []);

  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  return { preference, resolved, setPreference, cycle };
}
