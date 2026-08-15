// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A report filed for a span of days rather than for one.
//
// The Report screen exists to answer three questions about *today*, and that is
// still what it is shaped around. But one gesture it could not express is the
// common one: a period is five or six consecutive bleeding days, and somebody
// back-filling one — after a phone change, after a fortnight of forgetting, or
// simply because they log the whole thing on the day it ends — was tapping the
// date, tapping Blood, tapping Save, six times over.
//
// So the picker can select a span, and Save writes the same two answers to
// every day in it. That is the *whole* of the feature: the answers are the two
// booleans the derivation actually reads, the days are enumerated here, and
// nothing new is stored — a bulk report is exactly the reports it expands to,
// which is why the forecast needs to know nothing about this module.
//
// Pure and clock-free, like the rest of the domain: `now` arrives as an
// argument so a test can pin what a bulk save stamps.

import {
  addDays,
  daysBetween,
  type DayKey,
  type DayRange,
} from "@niclaslindstedt/oss-framework/calendar";

import type { AppData, DayEntry } from "./types.ts";

/**
 * The longest span one Save may write.
 *
 * A bulk report is for a period, not for a year. The longest thing anyone
 * plausibly fills in at once is a heavy month, and the cap is what stops a
 * mis-tap in a paged calendar — the first day of a range picked in March, the
 * second in a month someone scrolled to by accident — from writing hundreds of
 * days of "yes, bleeding" that then have to be found and undone one at a time.
 * The picker disables the days past it rather than refusing the tap, so the
 * limit is visible before it is hit.
 */
export const MAX_RANGE_DAYS = 31;

/** True when the span is a single day — i.e. an ordinary one-day report. */
export function isSingleDay(range: DayRange): boolean {
  return range.start === range.end;
}

/** How many days the span covers, both ends included. */
export function rangeLength(range: DayRange): number {
  const span = daysBetween(range.start, range.end);
  return Number.isNaN(span) ? 0 : span + 1;
}

/** Every day in the span, ascending. Empty when either end isn't a real day. */
export function daysInRange(range: DayRange): DayKey[] {
  const length = rangeLength(range);
  const days: DayKey[] = [];
  for (let i = 0; i < length; i += 1) days.push(addDays(range.start, i));
  return days;
}

/** How many days in the span already carry a report — the "4 of 6 days logged"
 *  line, and what decides whether there is anything for Clear to remove. */
export function loggedCount(data: AppData, range: DayRange): number {
  return daysInRange(range).filter((day) => data.entries[day]).length;
}

/** The two answers a bulk report carries. Deliberately not a `DayEntry`: a
 *  span has no single temperature, and this type is what says so. */
export type BulkAnswers = {
  bleeding: boolean;
  moodSwings: boolean;
};

/**
 * The entries a bulk save writes: the same two answers on every day of the
 * span, each stamped `now`.
 *
 * **A day's existing temperature survives.** A waking temperature is a
 * measurement of one morning, so a span cannot carry one — but neither may it
 * quietly erase the ones already recorded on the days it covers. Filing "I bled
 * these six days" over a week you took your temperature every morning has to
 * leave those six readings exactly where they were, or the bulk gesture would
 * be a data-loss trap wearing a convenience label. That is also why the
 * temperature control is disabled while a span is selected rather than merely
 * ignored: a control you can still move, whose value is then dropped, promises
 * something the save doesn't do.
 */
export function bulkEntries(
  data: AppData,
  range: DayRange,
  answers: BulkAnswers,
  now: string,
): DayEntry[] {
  return daysInRange(range).map((day) => ({
    date: day,
    bleeding: answers.bleeding,
    moodSwings: answers.moodSwings,
    temperature: data.entries[day]?.temperature ?? null,
    updatedAt: now,
  }));
}
