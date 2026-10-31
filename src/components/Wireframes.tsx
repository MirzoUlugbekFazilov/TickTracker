/**
 * Wireframes — one of the optional "extra mile" items in the brief.
 *
 * Drawn as inline SVG rather than attached as images so they live in the repo as
 * reviewable source, stay crisp at any zoom, and theme with the rest of the app.
 * Each one is annotated with the reasoning behind the layout, because a
 * wireframe without the "why" is just a box diagram.
 */

const STROKE = 'var(--border-strong)';
const FILL = 'var(--surface-sunken)';
const ACCENT = 'var(--brand)';
const TEXT = 'var(--ink-secondary)';

function Label({
  x,
  y,
  children,
  bold = false,
  size = 11,
}: {
  x: number;
  y: number;
  children: string;
  bold?: boolean;
  size?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={bold ? 700 : 500}
      fill={bold ? 'var(--ink)' : TEXT}
      fontFamily="var(--font-body)"
    >
      {children}
    </text>
  );
}

function Box({
  x,
  y,
  w,
  h,
  fill = FILL,
  dashed = false,
  radius = 4,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  dashed?: boolean;
  radius?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={radius}
      fill={fill}
      stroke={STROKE}
      strokeWidth={1.5}
      strokeDasharray={dashed ? '5 4' : undefined}
    />
  );
}

/* ------------------------------------------------- Desktop map wireframe */

export function MapWireframe() {
  return (
    <svg viewBox="0 0 800 460" role="img" aria-labelledby="wf-map-title wf-map-desc">
      <title id="wf-map-title">Wireframe of the desktop map screen</title>
      <desc id="wf-map-desc">
        A three-column layout. A fixed header runs across the top. On the left, a
        336 pixel column holds four summary tiles above the filter controls. The
        centre is the map canvas, with a floating toolbar top-left and a legend
        bottom-left. On the right, a 420 pixel detail panel slides in when a
        marker is selected, containing the sighting facts, three quick action
        buttons, the area timeline and the severity derivation.
      </desc>

      {/* Header */}
      <Box x={0} y={0} w={800} h={36} fill="var(--surface)" radius={0} />
      <Box x={12} y={9} w={18} h={18} fill={ACCENT} />
      <Label x={38} y={22} bold>
        TickTrack UK
      </Label>
      <Box x={520} y={9} w={48} h={18} />
      <Box x={574} y={9} w={48} h={18} />
      <Box x={628} y={9} w={48} h={18} />
      <Box x={682} y={9} w={48} h={18} />
      <Box x={760} y={9} w={28} h={18} />
      <Label x={536} y={22}>
        Nav
      </Label>

      {/* Sidebar */}
      <Box x={0} y={36} w={210} h={424} fill="var(--surface)" radius={0} />
      <Label x={12} y={56} bold>
        Summary tiles
      </Label>
      <Box x={12} y={64} w={88} h={46} />
      <Box x={108} y={64} w={88} h={46} />
      <Box x={12} y={116} w={88} h={46} />
      <Box x={108} y={116} w={88} h={46} />

      <Label x={12} y={184} bold>
        Filters
      </Label>
      <Label x={12} y={200}>
        Date range (from / to)
      </Label>
      <Box x={12} y={206} w={184} h={22} />
      <Box x={12} y={232} w={184} h={22} />
      <Label x={12} y={268}>
        Species (checkboxes + counts)
      </Label>
      {[0, 1, 2, 3, 4].map((index) => (
        <Box key={`sp-${index}`} x={12} y={276 + index * 22} w={184} h={18} />
      ))}
      <Label x={12} y={408}>
        Severity, city, recency
      </Label>
      {[0, 1, 2].map((index) => (
        <Box key={`sev-${index}`} x={12} y={416 + index * 14} w={184} h={11} />
      ))}

      {/* Map canvas */}
      <Box x={210} y={36} w={590} h={424} fill="var(--plane)" radius={0} />

      {/* Floating toolbar */}
      <Box x={224} y={50} w={62} h={24} fill="var(--surface)" />
      <Label x={234} y={65}>
        Filters
      </Label>
      <Box x={292} y={50} w={74} h={24} fill="var(--surface)" />
      <Label x={300} y={65}>
        1,000 shown
      </Label>
      <Box x={372} y={50} w={74} h={24} fill="var(--surface)" />
      <Label x={380} y={65}>
        Reset view
      </Label>

      {/* Markers and clusters */}
      {[
        [300, 170, 9],
        [340, 210, 6],
        [268, 260, 13],
        [330, 300, 7],
        [296, 340, 10],
        [258, 150, 7],
      ].map(([cx, cy, r], index) => (
        <circle
          key={`m-${index}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="var(--severity-moderate)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
      ))}
      <circle cx={300} cy={230} r={18} fill={ACCENT} stroke="var(--surface)" strokeWidth={2.5} />
      <text
        x={300}
        y={235}
        fontSize={11}
        fontWeight={700}
        fill="#ffffff"
        textAnchor="middle"
        fontFamily="var(--font-body)"
      >
        42
      </text>
      <Label x={228} y={122} bold>
        Clustered markers
      </Label>
      <Label x={228} y={136}>
        size + shade = severity
      </Label>

      {/* Legend */}
      <Box x={224} y={366} w={120} h={80} fill="var(--surface)" />
      <Label x={234} y={382} bold>
        Legend
      </Label>
      {[0, 1, 2, 3].map((index) => (
        <g key={`lg-${index}`}>
          <circle cx={240} cy={396 + index * 12} r={3 + index} fill="var(--severity-moderate)" />
          <Label x={252} y={400 + index * 12}>
            {['Low', 'Moderate', 'High', 'Severe'][index] ?? ''}
          </Label>
        </g>
      ))}

      {/* Detail panel */}
      <Box x={540} y={36} w={260} h={424} fill="var(--surface)" radius={0} />
      <Label x={552} y={58} bold size={13}>
        Marsh tick
      </Label>
      <Label x={552} y={74}>
        Ixodes apronophorus
      </Label>
      <Box x={552} y={82} w={56} h={16} fill="var(--severity-high)" />
      <Label x={552} y={122} bold>
        Sighting record
      </Label>
      {[0, 1, 2, 3].map((index) => (
        <Box key={`fact-${index}`} x={552} y={130 + index * 18} w={236} h={13} />
      ))}

      <Label x={552} y={226} bold>
        Quick actions
      </Label>
      <Box x={552} y={234} w={74} h={38} dashed />
      <Box x={633} y={234} w={74} h={38} dashed />
      <Box x={714} y={234} w={74} h={38} dashed />
      <Label x={558} y={257}>
        Report
      </Label>
      <Label x={639} y={257}>
        Directions
      </Label>
      <Label x={726} y={257}>
        Share
      </Label>

      <Label x={552} y={300} bold>
        Area timeline
      </Label>
      {[0, 1, 2, 3, 4].map((index) => (
        <g key={`tl-${index}`}>
          <Label x={552} y={320 + index * 16}>
            {String(2024 - index)}
          </Label>
          <rect
            x={584}
            y={311 + index * 16}
            width={120 - index * 18}
            height={10}
            rx={2}
            fill="var(--severity-moderate)"
          />
        </g>
      ))}

      <Label x={552} y={416} bold>
        How the rating was derived
      </Label>
      {[0, 1, 2].map((index) => (
        <Box key={`bd-${index}`} x={552} y={424 + index * 12} w={236} h={8} />
      ))}
    </svg>
  );
}

/* -------------------------------------------------- Mobile map wireframe */

export function MobileWireframe() {
  return (
    <svg viewBox="0 0 640 420" role="img" aria-labelledby="wf-mob-title wf-mob-desc">
      <title id="wf-mob-title">Wireframe of the mobile map and report screens</title>
      <desc id="wf-mob-desc">
        Three phone-width screens. On the first, the filter panel becomes a
        slide-over sheet reached from a Filters chip, with a dimming scrim behind
        it. On the second, the detail panel becomes a bottom sheet occupying at
        most 82 percent of the height so the map stays partly visible. On the
        third, the report form is a single column with full-width inputs and a
        44 pixel minimum touch target on every control.
      </desc>

      {/* Screen 1: filters as a sheet */}
      <Box x={10} y={10} w={180} h={400} fill="var(--plane)" radius={14} />
      <Box x={10} y={10} w={180} h={30} fill="var(--surface)" radius={14} />
      <Label x={22} y={30} bold>
        Header
      </Label>
      <Box x={10} y={40} w={180} h={26} fill="var(--surface)" />
      <Label x={22} y={57}>
        Nav strip (scrolls)
      </Label>
      {/* Scrim + sheet */}
      <rect x={10} y={66} width={180} height={344} fill="var(--ink)" opacity={0.35} />
      <Box x={10} y={66} w={132} h={344} fill="var(--surface)" radius={0} />
      <Label x={22} y={86} bold>
        Filters sheet
      </Label>
      <Box x={120} y={74} w={16} h={16} />
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <Box key={`msf-${index}`} x={22} y={96 + index * 26} w={108} h={20} />
      ))}
      <Label x={22} y={300}>
        Escape or scrim
      </Label>
      <Label x={22} y={314}>
        closes, focus returns
      </Label>

      {/* Screen 2: detail as bottom sheet */}
      <Box x={230} y={10} w={180} h={400} fill="var(--plane)" radius={14} />
      <Box x={230} y={10} w={180} h={30} fill="var(--surface)" radius={14} />
      <Label x={242} y={30} bold>
        Map visible
      </Label>
      {[
        [280, 90],
        [330, 120],
        [300, 150],
        [350, 100],
      ].map(([cx, cy], index) => (
        <circle
          key={`mm-${index}`}
          cx={cx}
          cy={cy}
          r={6}
          fill="var(--severity-moderate)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
      ))}
      <Box x={230} y={190} w={180} h={220} fill="var(--surface)" radius={14} />
      <rect x={300} y={198} width={40} height={4} rx={2} fill={STROKE} />
      <Label x={242} y={222} bold>
        Detail bottom sheet
      </Label>
      <Label x={242} y={238}>
        max 82% height
      </Label>
      {[0, 1, 2].map((index) => (
        <Box key={`mdb-${index}`} x={242} y={248 + index * 18} w={156} h={13} />
      ))}
      <Box x={242} y={310} w={48} h={34} dashed />
      <Box x={296} y={310} w={48} h={34} dashed />
      <Box x={350} y={310} w={48} h={34} dashed />
      <Label x={242} y={366}>
        3 quick actions
      </Label>
      <Box x={242} y={374} w={156} h={26} fill={ACCENT} />

      {/* Screen 3: report form */}
      <Box x={450} y={10} w={180} h={400} fill="var(--plane)" radius={14} />
      <Box x={450} y={10} w={180} h={30} fill="var(--surface)" radius={14} />
      <Label x={462} y={30} bold>
        Report form
      </Label>
      {['Date *', 'Time *', 'City *', 'Species *', 'Notes'].map((label, index) => (
        <g key={label}>
          <Label x={462} y={62 + index * 44}>
            {label}
          </Label>
          <Box x={462} y={68 + index * 44} w={156} h={26} fill="var(--surface)" />
        </g>
      ))}
      <Label x={462} y={290}>
        Photo upload
      </Label>
      <Box x={462} y={296} w={156} h={52} dashed />
      <Label x={476} y={326}>
        Drag or choose
      </Label>
      <Box x={462} y={360} w={156} h={30} fill="var(--accent-bright)" />
      <text
        x={540}
        y={380}
        fontSize={11}
        fontWeight={700}
        fill="#2b1a00"
        textAnchor="middle"
        fontFamily="var(--font-body)"
      >
        Submit sighting
      </text>
    </svg>
  );
}
