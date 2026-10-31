/**
 * The icon set.
 *
 * Hand-inlined SVG paths (Lucide geometry, 24x24 viewBox, 2px stroke) rather
 * than an icon package. Three reasons: the app needs about twenty icons and a
 * dependency would ship hundreds, inline SVG inherits `currentcolor` so icons
 * theme for free, and no emoji appear anywhere in the UI — an emoji renders
 * differently on every platform and is read aloud by screen readers as its
 * unicode name, which is rarely what the label should say.
 *
 * Every icon is `aria-hidden` and `focusable="false"`. Icons here are always
 * decorative: the accessible name comes from the button's text or its
 * `aria-label`, never from the glyph. That keeps an icon-plus-label button from
 * announcing its meaning twice.
 */

import type { SVGProps } from 'react';

export type IconName =
  | 'map-pin'
  | 'filter'
  | 'close'
  | 'chevron-right'
  | 'chevron-down'
  | 'search'
  | 'calendar'
  | 'alert-triangle'
  | 'alert-circle'
  | 'check-circle'
  | 'info'
  | 'share'
  | 'directions'
  | 'plus-circle'
  | 'upload'
  | 'image'
  | 'trash'
  | 'sun'
  | 'moon'
  | 'shield'
  | 'book'
  | 'chart'
  | 'tick'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right'
  | 'minus'
  | 'layers'
  | 'crosshair'
  | 'external';

const PATHS: Record<IconName, React.ReactNode> = {
  'map-pin': (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />,
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  'alert-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  share: (
    <>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </>
  ),
  directions: (
    <>
      <path d="M3 11 21 3l-8 18-2-7-8-3Z" />
    </>
  ),
  'plus-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  upload: (
    <>
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M8 8l4-4 4 4" />
      <path d="M12 4v12" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 16-5-5L5 20" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1Z" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />,
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Z" />
      <path d="M8 3v18" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6M13 20V9M18 20v-9" />
    </>
  ),
  /* A stylised dorsal view of a tick: body, scutum, eight legs. Used as the
     brand mark and in the species cards. */
  tick: (
    <>
      <ellipse cx="12" cy="13.5" rx="5" ry="6" />
      <path d="M12 7.5c-1.4 0-2.4 1-2.4 2.2 0 1.1 1 1.9 2.4 1.9s2.4-.8 2.4-1.9c0-1.2-1-2.2-2.4-2.2Z" />
      <path d="M12 7.5V5" />
      <path d="M7 10 3.5 8M7 13.5H3.5M7.4 17l-3 2.2" />
      <path d="M17 10l3.5-2M17 13.5h3.5M16.6 17l3 2.2" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 20V4" />
      <path d="m5 11 7-7 7 7" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 4v16" />
      <path d="m19 13-7 7-7-7" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M4 12h16" />
      <path d="m13 5 7 7-7 7" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size for both axes. Icons are square by design. */
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      {...rest}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
