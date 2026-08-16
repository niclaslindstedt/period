// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Presentation. The domain speaks `DayKey` (`YYYY-MM-DD`) everywhere —
// sortable, timezone-free, and what the framework's calendar helpers take —
// so this module is the single place it turns into something readable. The
// same goes for the one number that has a presentation rule of its own: a
// probability the app quotes back (see `probabilityPercent`).
//
// `Intl` formatters are memoised per format: constructing one is the expensive
// part, and these run once per rendered calendar cell.

import {
  parseDayKey,
  type DayKey,
} from "@niclaslindstedt/oss-framework/calendar";

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let found = cache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(undefined, options);
    cache.set(key, found);
  }
  return found;
}

/** A `DayKey` as a local `Date` at midnight, or null when it isn't a real
 *  day. Calendar days are timezone-free, so the components are read back as
 *  *local* — the same day the user typed, whatever their offset. */
export function toDate(day: DayKey): Date | null {
  const parts = parseDayKey(day);
  return parts ? new Date(parts.year, parts.month - 1, parts.day) : null;
}

/** "5 July" — the everyday form, used wherever the year is obvious. */
export function formatDay(day: DayKey): string {
  const date = toDate(day);
  return date ? formatter({ day: "numeric", month: "long" }).format(date) : day;
}

/** "Sun 5 July 2026" — the unambiguous form for a report's own heading. */
export function formatFullDay(day: DayKey): string {
  const date = toDate(day);
  return date
    ? formatter({
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
    : day;
}

/** "5 Jul" — the compact form for list rows and chart ticks. */
export function formatShortDay(day: DayKey): string {
  const date = toDate(day);
  return date
    ? formatter({ day: "numeric", month: "short" }).format(date)
    : day;
}

/** The single-letter-ish weekday for a day strip ("Mon"). */
export function formatWeekday(day: DayKey): string {
  const date = toDate(day);
  return date ? formatter({ weekday: "short" }).format(date) : day;
}

/** "July 2026" — a month grid's heading. */
export function formatMonth(year: number, month: number): string {
  return formatter({ month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

/**
 * A probability the app quotes back, as a percentage.
 *
 * **A whole percent, floored, and never past 99%.**
 *
 * Whole, because a decimal claims a resolution that is not there. These are
 * estimates fitted to a few dozen logged cycles; the tenth of a percentage
 * point would move if one report from last spring were corrected, so printing
 * it dresses noise up as precision.
 *
 * Floored, because a quoted figure should be one the arithmetic can back:
 * "63%" says at least 63, never "63, give or take the half point I rounded
 * away". Flooring also means the number can only ever understate, which is the
 * safe direction for a forecast.
 *
 * Capped at 99%, because flooring leaves exactly one way to overstate: a
 * genuine 99.6% would print as a flat "100%", and the app claiming certainty
 * is the one thing the confidence copy beside it exists to avoid. A floored
 * "0%" needs no such guard — it reads as "under one percent", which is what a
 * floor says, and the chart names a day the model has genuinely excluded
 * ("Ruled out") rather than quoting a figure at all.
 */
export function probabilityPercent(p: number): string {
  return `${Math.min(99, Math.floor(Math.max(0, p) * 100))}%`;
}
