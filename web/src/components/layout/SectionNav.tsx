/**
 * Sticky in-page navigation with scroll-spy, for the long reference pages.
 *
 * WHY
 * ---
 * The Learn page is three charts, five species cards and five prevention
 * topics — several screens of scrolling with no way to see its shape or jump
 * within it. Someone arriving from the detail panel's "full identification
 * guide" link wants the species section, not a scroll hunt.
 *
 * IMPLEMENTATION NOTES
 *
 * Scroll-spy uses `IntersectionObserver`, not a scroll listener. A scroll
 * handler fires on every frame and has to measure each section with
 * `getBoundingClientRect`, which forces layout; the observer does the same work
 * off the main thread and only reports when a boundary is actually crossed.
 *
 * The `rootMargin` is the part worth understanding. A negative top margin equal
 * to the header height, plus a large negative bottom margin, collapses the
 * observation zone to a thin band near the top of the viewport. Without it a
 * tall section is "intersecting" for most of its scroll and several sections
 * are active at once, which makes the indicator flicker between them.
 *
 * Semantically this is a `nav` with a list of in-page links, so it works with
 * JavaScript disabled or the observer unsupported — scroll-spy is the
 * enhancement, the links are the function. `aria-current="true"` marks the
 * active one.
 */

import { useEffect, useState } from 'react';

export interface SectionNavItem {
  /** The `id` of the section heading this links to. */
  id: string;
  label: string;
}

export function SectionNav({
  items,
  ariaLabel = 'On this page',
}: {
  items: readonly SectionNavItem[];
  ariaLabel?: string;
}) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    /**
     * Observe the SECTION each heading belongs to, not the heading itself.
     *
     * Observing headings looks right and fails in practice: a heading is a
     * ~40px target, so a fast scroll (a trackpad flick, or Page Down) can move
     * the viewport past it between observer callbacks and the indicator simply
     * never updates. Sections are screen-height targets, so at any scroll
     * position one of them is always under the cursor band.
     */
    const observed = items
      .map((item) => {
        const heading = document.getElementById(item.id);
        const section = heading?.closest('section') ?? null;
        return section ? { id: item.id, section } : null;
      })
      .filter((entry): entry is { id: string; section: HTMLElement } => entry !== null);

    if (observed.length === 0) return;

    const sectionToId = new Map(observed.map(({ id, section }) => [section, id]));
    /** Running record of which sections currently overlap the band. */
    const visibility = new Map<string, boolean>();

    const observer = new IntersectionObserver(
      (entries) => {
        // Rebuild the full picture each callback rather than trusting the
        // deltas: entries only contain what *changed*, so acting on them alone
        // leaves the indicator stale whenever two boundaries cross at once.
        for (const entry of entries) {
          const id = sectionToId.get(entry.target as HTMLElement);
          if (id) visibility.set(id, entry.isIntersecting);
        }

        // Earliest section still in the band wins, in document order, which
        // keeps the indicator stable instead of flickering between two
        // sections that overlap the band during a scroll.
        const current = items.find((item) => visibility.get(item.id));
        if (current) setActiveId(current.id);
      },
      {
        // Collapses the viewport to a band just below the sticky header.
        // Without the large negative bottom, a tall section counts as visible
        // for most of its scroll and several are active at once.
        rootMargin: '-80px 0px -70% 0px',
        threshold: 0,
      },
    );

    for (const { section } of observed) observer.observe(section);

    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="section-nav" aria-label={ariaLabel}>
      <p className="section-nav__title">{ariaLabel}</p>
      <ul className="section-nav__list">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="section-nav__link"
              aria-current={activeId === item.id ? 'true' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
