/**
 * The "Get directions" and "Share" quick actions.
 *
 * Both are deliberately dependency-free and degrade rather than fail: Web Share
 * is used where the browser offers it (which is most mobile browsers and few
 * desktop ones), falling back to the clipboard, and falling back again to simply
 * telling the user the link so they can copy it themselves.
 */

import type { Sighting } from '../types/sighting';

/**
 * A maps link for the sighting's *city centre*, not its plotted point.
 *
 * This matters. The plotted point carries a deterministic offset of up to 6 km
 * that exists only to stop same-city markers stacking — navigating a user to it
 * would send them to an arbitrary spot that has nothing to do with the sighting.
 * The city centroid is the most precise thing the source data actually supports,
 * so that is what the directions link uses, and the button's helper text says so.
 */
export function directionsUrl(sighting: Sighting): string {
  const query = encodeURIComponent(`${sighting.location}, United Kingdom`);
  return `https://www.google.com/maps/dir/?api=1&destination=${query}&destination_place_id=`;
}

/** A deep link back into this app with the sighting selected. */
export function shareUrl(sighting: Sighting): string {
  const url = new URL(window.location.href);
  url.hash = '';
  url.pathname = '/';
  url.search = `?sighting=${encodeURIComponent(sighting.id)}`;
  return url.toString();
}

export type ShareOutcome =
  | { status: 'shared' }
  | { status: 'copied' }
  | { status: 'unsupported'; url: string }
  | { status: 'cancelled' };

export async function shareSighting(sighting: Sighting): Promise<ShareOutcome> {
  const url = shareUrl(sighting);
  const title = `Tick sighting in ${sighting.location} — TickTracker UK`;
  const text = `${sighting.species} (${sighting.latinName}) recorded in ${sighting.location}.`;

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return { status: 'shared' };
    } catch (error) {
      // The user dismissing the share sheet throws AbortError. That is a normal
      // outcome, not a failure, and must not surface as an error message.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      // Any other share failure falls through to the clipboard path below.
    }
  }

  // Clipboard access needs a secure context and can be denied by permission.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { status: 'copied' };
    } catch {
      /* fall through */
    }
  }

  return { status: 'unsupported', url };
}
