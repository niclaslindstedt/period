// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a press on a calendar day means.
//
// The Calendar screen is where a report gets *corrected*, which is a different
// gesture from filing one: you are looking at a month, you can see the day that
// is wrong, and the shortest path to fixing it is pressing it. A tap opens that
// day's report; a press and hold anchors a span, and the next tap closes it —
// in either direction, so a range can be picked backwards from its end.
//
// The rules that decide which of those a given press is live here rather than
// in the screen, for the same reason `bulk.ts` lives outside `ReportScreen`:
// they are arithmetic over days, they are what stops a mis-tap from writing (or
// deleting) a month of reports, and arithmetic that can quietly be wrong is
// worth pinning to real dates in a test.
//
// Pure and clock-free — `today` arrives as an argument, like everywhere else in
// the domain.

import {
  dayRange,
  daysBetween,
  type DayKey,
  type DayRange,
} from "@niclaslindstedt/oss-framework/calendar";

import { MAX_RANGE_DAYS } from "./bulk.ts";

/**
 * Where the screen is in the two-tap gesture.
 *
 *   - `off` — the ordinary state: a tap edits the day it lands on.
 *   - `arming` — a range has been asked for but has no anchor yet. This is what
 *     the button under the grid enters, and it is what makes the gesture
 *     reachable without a touchscreen: a long press is a shortcut into
 *     `anchored`, not the only way in.
 *   - `anchored` — one end is down and the next tap fixes the other.
 */
export type DaySelection =
  { kind: "off" } | { kind: "arming" } | { kind: "anchored"; anchor: DayKey };

/** The resting state. A constant rather than an object literal at each call
 *  site, so the "no selection" case is one value the whole screen shares. */
export const NO_SELECTION: DaySelection = { kind: "off" };

/**
 * Whether a day can be edited at all.
 *
 * A report is a record of a day that happened — the Report screen's picker caps
 * at today for that reason, and the calendar has to agree with it or the two
 * screens would disagree about what a report is. `DayKey` is `YYYY-MM-DD`, so
 * the comparison is a plain string one.
 *
 * Note that the calendar goes on painting the days *past* today: they carry a
 * forecast, which is exactly what the screen is for. They just cannot be
 * pressed into a report.
 */
export function isEditable(day: DayKey, today: DayKey): boolean {
  return day <= today;
}

/**
 * Whether a day may close a span anchored on another.
 *
 * The cap is the bulk report's (`MAX_RANGE_DAYS`), because closing a span here
 * opens the editor that writes one — a limit the picker enforced and this one
 * did not would be a limit in name only. It is measured as a distance rather
 * than a direction, since the second tap may land either side of the anchor.
 */
export function closesRange(
  anchor: DayKey,
  day: DayKey,
  today: DayKey,
): boolean {
  if (!isEditable(day, today)) return false;
  const distance = Math.abs(daysBetween(anchor, day));
  return Number.isFinite(distance) && distance < MAX_RANGE_DAYS;
}

/**
 * The days the grid should grey out in a given state.
 *
 * `undefined` while nothing is being selected, deliberately: outside the
 * gesture every day in the month is a perfectly good day to *look* at, and
 * greying out half a calendar to say "you can't file a report in August" would
 * cost the screen its main job to answer a question nobody asked.
 */
export function blockedDuring(
  selection: DaySelection,
  today: DayKey,
): ((day: DayKey) => boolean) | undefined {
  if (selection.kind === "off") return undefined;
  if (selection.kind === "arming") return (day) => !isEditable(day, today);
  const { anchor } = selection;
  return (day) => !closesRange(anchor, day, today);
}

/** What a press resolves to. `nothing` is a real answer, not a failure: a tap
 *  on next month's Friday has nothing to open, and the honest response is to
 *  leave the calendar exactly as it was. */
export type DayAction =
  /** Open the one-day editor on this day. */
  | { do: "edit"; day: DayKey }
  /** Put an anchor down and wait for the day that closes the span. */
  | { do: "anchor"; day: DayKey }
  /** The span is closed — open the editor for it. */
  | { do: "range"; range: DayRange }
  | { do: "nothing" };

/** A tap, read against the state the screen is in. */
export function tap(
  selection: DaySelection,
  day: DayKey,
  today: DayKey,
): DayAction {
  if (selection.kind === "anchored") {
    return closesRange(selection.anchor, day, today)
      ? // Normalized, so tapping backwards from the end of a period picks the
        // same span as tapping forwards through it.
        { do: "range", range: dayRange(selection.anchor, day) }
      : { do: "nothing" };
  }
  if (!isEditable(day, today)) return { do: "nothing" };
  return selection.kind === "arming"
    ? { do: "anchor", day }
    : { do: "edit", day };
}

/**
 * A press and hold, which always means "start a span here".
 *
 * It does not consult the state: holding while a span is half-picked re-anchors
 * it rather than closing it. A hold is a deliberate, half-second gesture, and
 * the reading that matches the effort is the one that starts something —
 * whereas closing a span is what the next *tap* is for.
 */
export function hold(day: DayKey, today: DayKey): DayAction {
  return isEditable(day, today) ? { do: "anchor", day } : { do: "nothing" };
}
