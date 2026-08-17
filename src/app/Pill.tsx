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
}: {
  start: DayKey;
  end: DayKey;
  label?: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {label && <span className="sr-only">{label}</span>}
      <span
        aria-hidden={label ? "true" : undefined}
        className="flex items-center gap-1.5"
      >
        <Pill>{formatDay(start)}</Pill>
        <span className="text-xs text-muted">—</span>
        <Pill>{formatDay(end)}</Pill>
      </span>
    </span>
  );
}
