// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// App-owned glyphs — the marks the framework's set has no vocabulary for
// because they are this app's domain: a droplet for bleeding, a face for
// mood, a chart for history. Everything else (calendar, cog, cloud, chevrons)
// comes from `@niclaslindstedt/oss-framework/components`, so the two sets only
// ever differ where the domain does.
//
// Traced on the same Lucide 24×24 grid at the same 2px stroke weight as the
// framework glyphs, and stroked with `currentColor`, so a mark from either set
// sits on the same line without retuning.

import type { ReactNode } from "react";

export type IconProps = { className?: string };

function Glyph({
  className,
  filled = false,
  children,
}: IconProps & { filled?: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Bleeding. The outline form for controls, the filled form for calendar
 *  markers where a 6px outline would read as a smudge. */
export function DropletIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 2.7 6.7 8a7.5 7.5 0 1 0 10.6 0Z" />
    </Glyph>
  );
}

export function DropletFilledIcon({ className }: IconProps) {
  return (
    <Glyph className={className} filled>
      <path d="M12 2.7 6.7 8a7.5 7.5 0 1 0 10.6 0Z" />
    </Glyph>
  );
}

/** Mood swings — a wave, the shape of a mood that moved. */
export function WaveIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M2 12c2.5-4 4.5-4 7 0s4.5 4 7 0 4.5-4 6 0" />
    </Glyph>
  );
}

/** Sex — two interlocking rings. A join rather than a pair of gendered
 *  symbols: the report asks whether it happened, not who with. */
export function RingsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </Glyph>
  );
}

/** An ovulation test — a strip stood on end, with the two bands whose second
 *  line is the whole answer. Upright rather than boxed so it still reads as a
 *  strip at the 16px the report screen draws it at. */
export function TestStripIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="8" y="2" width="8" height="20" rx="2.5" />
      <path d="M9.5 8h5" />
      <path d="M9.5 12h5" />
    </Glyph>
  );
}

/** Waking temperature — a thermometer, bulb down. */
export function ThermometerIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M14 14.8V5a2.5 2.5 0 0 0-5 0v9.8a4.5 4.5 0 1 0 5 0Z" />
      <path d="M11.5 18.5h.01" />
    </Glyph>
  );
}

/** History — a bar chart. */
export function ChartIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M3 21h18" />
      <path d="M7 21V10" />
      <path d="M12 21V4" />
      <path d="M17 21v-7" />
    </Glyph>
  );
}

/** Forecast — a crescent of days ahead. */
export function ForecastIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M12 7v5l3 2" />
      <path d="M17.5 3.5 21 5l-1.5 3.5" />
    </Glyph>
  );
}

/** Saving to this device — a floppy disk, still the one shape everybody reads
 *  as "write this down" thirty years after the last one shipped. The framework
 *  has no save glyph of its own (its buttons say the word), and the cloud half
 *  of the pair does come from there: `CloudUploadIcon` is what the Report
 *  screen's Save wears once a cloud account is connected, because that is
 *  where the report is actually going. */
export function DiskIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 4v5h7" />
      <rect x="7.5" y="13" width="9" height="8" rx="1" />
    </Glyph>
  );
}

/** A span between two dates — the credible interval, a fertile window, a
 *  period. A run with an arrow at each end: two plain end stops and a line
 *  read as a letter H at the 16px this is drawn at, which is what the first
 *  attempt at it turned out to be. */
export function RangeIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 12h16" />
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
    </Glyph>
  );
}

/** An ovum — the day ovulation is projected for. A circle with its nucleus,
 *  rather than a target: this is a thing, not an aim. */
export function OvumIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" />
    </Glyph>
  );
}

/** The track record — how close past predictions landed. */
export function TargetIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" />
    </Glyph>
  );
}

// The four marks on the Forecast chart's appearance chips. Each names the state
// the chip is *in* rather than the one it switches to, so the glyph and the
// word beside it are always describing the same chart.

/** One column per day. */
export function ColumnsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M6 20v-6" />
      <path d="M12 20V6" />
      <path d="M18 20v-9" />
    </Glyph>
  );
}

/** The shape those columns trace. */
export function CurveIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M3 18c3.5 0 4-11 9-11s5.5 11 9 11" />
    </Glyph>
  );
}

/** The chance asked one day at a time: a single day cell. Deliberately not
 *  another curve — it sits beside the mark chip, and two humps a centimetre
 *  apart are two chips nobody can tell apart at a glance. */
export function PerDayIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </Glyph>
  );
}

/** The chance it has started by a day: the same distribution added up, which
 *  is a curve that climbs once and then flattens. */
export function CumulativeIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M3 19c6 0 6-14 18-14" />
    </Glyph>
  );
}

/** The credible bands behind the marks — nested, widest first. */
export function BandsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x="8" y="4" width="8" height="16" rx="1.5" />
    </Glyph>
  );
}

/** Two curves laid over one another: this forecast against the one the cycle
 *  history alone would have given. */
export function CompareIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M3 15c4 0 5-8 9-8s5 8 9 8" />
      <path d="M3 20c4 0 5-4 9-4s5 4 9 4" strokeDasharray="3 3" />
    </Glyph>
  );
}
