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
