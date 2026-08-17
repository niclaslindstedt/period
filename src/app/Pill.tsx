// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { ReactNode } from "react";

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

import { formatDay } from "./format.ts";

// The date pills the reading screens share.
//
// They began on the Forecast screen, where the dates came out of the prose and
// into pills so the eye finds them without reading the sentence around them.
// History quotes dates the same way now — its list of periods is the record
// the Forecast's list of *upcoming* periods continues, and the two should read
// as one voice — so the pills live here rather than in either screen.

/**
 * A date, or a short phrase about one, set apart from the prose around it.
 *
 * A pill is the smallest thing that makes a date findable without shouting:
 * same type size, closed shape, `tabular-nums` so a column of them does not
 * jitter as the digits change.
 *
 * Three tones, and they mean three different things rather than being three
 * decorations: `solid` is the one date a screen is actually claiming,
 * `accent` is a date that qualifies it (the ends of a range, a period further
 * out, a period already logged), `muted` is a phrase about a date rather than
 * a date.
 */
export function Pill({
  tone = "accent",
  children,
}: {
  tone?: "solid" | "accent" | "muted";
  children: ReactNode;
}) {
  const toneClass =
    tone === "solid"
      ? "bg-accent font-semibold text-page-bg"
      : tone === "accent"
        ? "border border-accent/35 bg-accent/10 font-semibold text-fg-bright"
        : "border border-muted/30 text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm leading-none tabular-nums ${toneClass}`}
    >
      {children}
    </span>
  );
}

/**
 * The two ends of a span, as a pair of pills.
 *
 * A range is one fact, so it is read out as one: `label` is the whole sentence
 * the catalog holds ("Most likely 5 Sep — 12 Sep"), and the pills that draw it
 * are hidden from the accessibility tree. Without that a screen reader would
 * hear two dates with a dash between them and have to infer the rest — and the
 * catalog would have to be broken into fragments a translator cannot reorder.
 * Where the span has no sentence of its own (the fertile window, which is
 * already under a heading that names it) the pills speak for themselves.
 */
export function DateSpan({
  start,
  end,
  label,
  columns = false,
}: {
  start: DayKey;
  end: DayKey;
  label?: string;
  /** Hand the three parts to a `DateSpanRow`'s columns instead of packing them
   *  flush against each other. See `DateSpanList`. */
  columns?: boolean;
}) {
  const parts = (
    // In a row, `contents` lets the pills and the dash become cells of the
    // row's own grid while this element keeps carrying the `aria-hidden` —
    // the alignment needs them to be siblings of the meta text, the reading
    // order needs them wrapped.
    <span
      aria-hidden={label ? "true" : undefined}
      className={columns ? "contents" : "flex items-center gap-1.5"}
    >
      <Pill>{formatDay(start)}</Pill>
      <span className="text-xs text-muted">—</span>
      <Pill>{formatDay(end)}</Pill>
    </span>
  );

  // The label is absolutely positioned (`sr-only`), so it takes no column of
  // its own in a row.
  if (columns) {
    return (
      <>
        {label && <span className="sr-only">{label}</span>}
        {parts}
      </>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      {label && <span className="sr-only">{label}</span>}
      {parts}
    </span>
  );
}

/**
 * A list of date spans, ruled into columns.
 *
 * A span is three things of variable width — "Sep 2" is narrower than "Aug 11"
 * — so a stack of them packed flush left puts every second date, and every
 * dash, at a different place on the page. Reading down the list then means
 * re-finding the second date on every row. The list holds one set of column
 * widths and each row borrows them (`grid-cols-subgrid`), so the starts line
 * up under the starts and the ends under the ends, and the widths still come
 * from the dates themselves rather than from a number guessed here.
 *
 * The last column takes the rest of the width, for the muted phrase these
 * rows all end with — a length, a countdown — set against the right edge.
 */
export function DateSpanList({
  lead = false,
  children,
}: {
  /** Reserve a column before the span, for rows that name their range (the
   *  50 / 80 / 95% chips on the forecast's intervals). */
  lead?: boolean;
  children: ReactNode;
}) {
  return (
    <ul
      className={`grid items-center gap-x-1.5 gap-y-2 text-sm ${
        lead
          ? "grid-cols-[auto_auto_auto_auto_1fr]"
          : "grid-cols-[auto_auto_auto_1fr]"
      }`}
    >
      {children}
    </ul>
  );
}

/** One row of a `DateSpanList`, laid out on the list's columns. */
export function DateSpanRow({ children }: { children: ReactNode }) {
  return (
    <li className="col-span-full grid grid-cols-subgrid items-center gap-x-1.5">
      {children}
    </li>
  );
}
