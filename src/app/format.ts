// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Date presentation. The domain speaks `DayKey` (`YYYY-MM-DD`) everywhere —
// sortable, timezone-free, and what the framework's calendar helpers take —
// so this module is the single place it turns into something readable.
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
