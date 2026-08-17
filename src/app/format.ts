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

/**
 * "5 Jul" — how this app names a date. **The only way it names one.**
 *
 * There used to be two: a long form ("5 July") for headlines and a short one
 * for list rows and chart ticks. They met on the Forecast screen, where the
 * headline read "Next period: September 8" with "Most likely Sep 5 — Sep 12"
 * directly under it — two spellings of the same month, one line apart, with
 * nothing to tell the reader why. The abbreviation is the form that survived,
 * because it is the one a 20px-wide axis tick and a two-date range can carry;
 * "September" cannot be short, but "Sep" can be a headline.
 *
 * So there is one function rather than a pair with a rule about which to reach
 * for — the mix is not a thing to remember to avoid, it is a thing that cannot
 * be written.
 */
export function formatDay(day: DayKey): string {
  const date = toDate(day);
  return date
    ? formatter({ day: "numeric", month: "short" }).format(date)
    : day;
}

/** "Sun, 5 Jul 2026" — the same date with the weekday and the year, for the
 *  one place a report's own heading has to be unambiguous. The month is
 *  abbreviated here too: it is the same date vocabulary, spelled out further,
 *  not a second one. */
export function formatFullDay(day: DayKey): string {
  const date = toDate(day);
  return date
    ? formatter({
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : day;
}

/** The single-letter-ish weekday for a day strip ("Mon"). */
export function formatWeekday(day: DayKey): string {
  const date = toDate(day);
  return date ? formatter({ weekday: "short" }).format(date) : day;
}

/** "July 2026" — a month grid's heading. The long name survives here and only
 *  here, because this is the one string that names a *month* rather than a
 *  date: it is the grid's title, it sits alone at the top of it, and "Jul
 *  2026" over a calendar page reads as an abbreviation of nothing. */
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
 * is the one thing the confidence copy beside it exists to avoid.
 *
 * And floored to **"<1%"** rather than to "0%" at the other end, for the
 * mirror-image reason. A floor is a lower bound everywhere else on the scale,
 * but at the bottom the digit it prints is also the number zero — and "0%" is
 * the one output of this function that reads as a certainty rather than as an
 * estimate. A day the model gives a small-but-real chance is not a day it has
 * ruled out, and the app should not spend the reader's trust saying it has.
 * "<1%" is the same floor, said in the one place it needs saying out loud.
 *
 * A flat "0%" is therefore reserved for a probability that genuinely is zero
 * (and for the nonsense values a formatter still has to survive) — the
 * arithmetic can back that one.
 */
export function probabilityPercent(p: number): string {
  // `!(p > 0)` rather than `p <= 0` so a NaN from upstream lands here too,
  // instead of printing as "NaN%".
  if (!(p > 0)) return "0%";
  const whole = Math.floor(p * 100);
  return whole < 1 ? "<1%" : `${Math.min(99, whole)}%`;
}
