/**
 * A schematic dorsal-view tick, parameterised per species.
 *
 * Drawn rather than photographed for two reasons: there are no licensed
 * photographs of these specific species available for a submission like this,
 * and a schematic can actually emphasise the features the guide is asking the
 * reader to look for — scutum pattern, mouthpart length, body proportions —
 * which a photograph of a 3 mm animal usually cannot.
 *
 * The illustration carries the identifying characters described in the text:
 * `ornate` draws the enamel marbling that separates Dermacentor from Ixodes,
 * and `longMouthparts` draws the forward-projecting hypostome of Ixodes.
 *
 * It is `aria-hidden` throughout: the appearance bullet list beside it is the
 * accessible description, and it says far more than alt text on a diagram could.
 */

export interface TickIllustrationProps {
  /** Fill for the body, normally the species' categorical colour. */
  color: string;
  /** Dermacentor: patterned, enamelled shield. */
  ornate?: boolean;
  /** Ixodes: long, forward-projecting mouthparts. */
  longMouthparts?: boolean;
  size?: number;
}

export function TickIllustration({
  color,
  ornate = false,
  longMouthparts = true,
  size = 56,
}: TickIllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {/* Legs. Four pairs, angled forward as they are in life. */}
      <g stroke="var(--ink-secondary)" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M22 28 10 21M21 34H8M22 40l-11 6M23 45l-8 8" />
        <path d="M42 28l12-7M43 34h13M42 40l11 6M41 45l8 8" />
      </g>

      {/* Idiosoma (body). */}
      <ellipse cx="32" cy="38" rx="13" ry="16" fill={color} stroke="var(--ink)" strokeWidth="1.5" />

      {/* Scutum (dorsal shield). */}
      <path
        d="M32 22c-5 0-8.5 3.4-8.5 7.6 0 3.8 3.5 6.4 8.5 6.4s8.5-2.6 8.5-6.4C40.5 25.4 37 22 32 22Z"
        fill={ornate ? 'var(--surface)' : color}
        stroke="var(--ink)"
        strokeWidth="1.5"
        /* An ornate scutum is paler than the body; a plain one matches it, so a
           subtle darkening keeps the shield readable either way. */
        fillOpacity={ornate ? 0.9 : 0.72}
      />

      {ornate ? (
        /* Enamel marbling — the single most useful field character for
           distinguishing Dermacentor from the plain-shielded Ixodes species. */
        <g fill={color} opacity="0.85">
          <circle cx="27.5" cy="28" r="2" />
          <circle cx="36.5" cy="28" r="2" />
          <circle cx="32" cy="32.5" r="1.8" />
          <circle cx="32" cy="24.5" r="1.4" />
        </g>
      ) : null}

      {/* Capitulum and hypostome (mouthparts). */}
      <g stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" fill="none">
        {longMouthparts ? (
          <>
            <path d="M32 22v-8" />
            <path d="M29 16.5l3-3 3 3" />
          </>
        ) : (
          <>
            {/* Dermacentor: short, broad, rectangular mouthparts. */}
            <path d="M28.5 21.5v-4.5h7v4.5" />
          </>
        )}
      </g>

      {/* Festoons — notches along the rear margin, a Dermacentor character. */}
      {ornate ? (
        <g stroke="var(--ink)" strokeWidth="1.2" opacity="0.6" fill="none">
          <path d="M24 50.5l1.5 2.5M28.5 52.5l.8 2.4M35.5 52.5l-.8 2.4M40 50.5l-1.5 2.5" />
        </g>
      ) : null}
    </svg>
  );
}
