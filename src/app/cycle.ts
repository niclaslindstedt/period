// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cycle derivation — every number the Forecast and History screens show is
// computed here, from the day reports alone. Nothing about a cycle is
// persisted: correct a report from three weeks ago and the averages, the
// predicted start, and the fertile window all move with it.
//
// The whole module is pure and clock-free — `today` is always passed in — so
// the behaviour is unit-testable without freezing time (see
// `tests/cycle_test.ts`).
//
// This is deliberately the *simple* model: periods are runs of bleeding days,
// the cycle length is the gap between consecutive period starts, and the next
// start is the last start plus the typical gap. No symptom-thermometer
// modelling, no learning — just the arithmetic, plus an honest confidence
// label so a two-cycle history never reads like a promise.

import { addDays, daysBetween } from "@niclaslindstedt/oss-framework/calendar";
import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

import { isBleeding, sortedEntries, type AppData } from "./types.ts";

/** One observed bleeding episode: the first and last day it covers, and how
 *  many days were actually logged as bleeding inside it. */
export type PeriodSpan = {
  start: DayKey;
  end: DayKey;
  /** Whole days from `start` to `end` inclusive. */
  length: number;
  /** Days inside the span actually reported as bleeding — `length` minus any
   *  bridged gap days. */
  bleedingDays: number;
};

/** How settled the history is. Drives the wording on the forecast card: a
 *  prediction from two cycles is a guess, and should say so. */
export type Confidence = "none" | "low" | "medium" | "high";

/** The shape of a user's history, as far as the arithmetic can tell. */
export type CycleStats = {
  periods: PeriodSpan[];
  /** Gaps between consecutive period starts, in days, oldest first. */
  cycleLengths: number[];
  /** Mean gap between starts, rounded — null until two periods are logged. */
  averageCycle: number | null;
  /** Middle gap, rounded — more robust than the mean when one cycle was odd. */
  medianCycle: number | null;
  /** Shortest and longest observed gap, or null with fewer than two periods. */
  shortestCycle: number | null;
  longestCycle: number | null;
  /** Mean length of a bleeding episode, rounded — null with no periods. */
  averagePeriodLength: number | null;
  /** Population standard deviation of the cycle lengths, or null. */
  variability: number | null;
  confidence: Confidence;
};

/** What the Forecast screen paints. Every date is a prediction except
 *  `currentPeriodStart`, which is observed. */
export type Forecast = {
  /** The cycle length the prediction used — observed, or the configured
   *  default while there isn't enough history. */
  cycleLength: number;
  /** True when `cycleLength` is the configured fallback, not an observation. */
  usingDefault: boolean;
  /** The start of the cycle `today` falls in — the most recent period start
   *  at or before today, or null when nothing is logged yet. */
  currentPeriodStart: DayKey | null;
  /** 1-based day within the current cycle, or null with no history. */
  cycleDay: number | null;
  /** Predicted first day of the next period. */
  nextStart: DayKey | null;
  /** Predicted last day of the next period, from the average period length. */
  nextEnd: DayKey | null;
  /** Whole days from today to `nextStart`; negative once it is overdue. */
  daysUntilNext: number | null;
  /** Predicted ovulation day — `nextStart` minus the luteal-phase length. */
  ovulation: DayKey | null;
  /** The days conception is considered possible around `ovulation`. */
  fertileStart: DayKey | null;
  fertileEnd: DayKey | null;
  confidence: Confidence;
};

/** Knobs the Settings screen owns. Defaults are the textbook averages, used
 *  verbatim until the history has something better to say. */
export type CycleOptions = {
  /** Cycle length assumed before two periods have been logged. */
  defaultCycleLength: number;
  /** Period length assumed before any period has been logged. */
  defaultPeriodLength: number;
  /** Days from ovulation to the next period start. Far steadier across people
   *  than the follicular phase, which is why the prediction counts *back* from
   *  the next start rather than forward from the last one. */
  lutealPhaseLength: number;
  /** Days before ovulation the fertile window opens (sperm survival). */
  fertileWindowBefore: number;
  /** Days after ovulation it closes (egg viability). */
  fertileWindowAfter: number;
};

export const DEFAULT_CYCLE_OPTIONS: CycleOptions = {
  defaultCycleLength: 28,
  defaultPeriodLength: 5,
  lutealPhaseLength: 14,
  fertileWindowBefore: 5,
  fertileWindowAfter: 1,
};

/** How many non-bleeding days may sit inside one period before it counts as
 *  two. One day of nothing mid-period is common enough that splitting on it
 *  would invent a phantom cycle of two days. */
const MAX_GAP_DAYS = 1;

/**
 * Group the reported bleeding days into periods. Consecutive bleeding days
 * form one span; a gap of at most {@link MAX_GAP_DAYS} days is bridged rather
 * than treated as the end of one period and the start of another.
 *
 * Days with no report at all are *not* bridged beyond that same tolerance: an
 * unlogged day carries no claim either way, and guessing would turn a
 * forgotten week into one long period.
 */
export function derivePeriods(data: AppData): PeriodSpan[] {
  const bleedingDays = sortedEntries(data)
    .filter((e) => isBleeding(e.bleeding))
    .map((e) => e.date);
  if (bleedingDays.length === 0) return [];

  const spans: PeriodSpan[] = [];
  let start = bleedingDays[0]!;
  let end = start;
  let count = 1;

  for (const day of bleedingDays.slice(1)) {
    const gap = daysBetween(end, day);
    if (gap <= MAX_GAP_DAYS + 1) {
      end = day;
      count += 1;
      continue;
    }
    spans.push({
      start,
      end,
      length: daysBetween(start, end) + 1,
      bleedingDays: count,
    });
    start = day;
    end = day;
    count = 1;
  }
  spans.push({
    start,
    end,
    length: daysBetween(start, end) + 1,
    bleedingDays: count,
  });
  return spans;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Population standard deviation. */
function stdev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * How much to trust a prediction, from how many cycles have been observed and
 * how much they vary. Two cycles is arithmetic, not a pattern; six steady ones
 * are worth believing. A wide spread (±4 days or more) caps the answer at
 * `low` however many cycles there are — averaging noisy data harder does not
 * make it less noisy.
 */
export function confidenceFor(cycleLengths: number[]): Confidence {
  if (cycleLengths.length === 0) return "none";
  if (cycleLengths.length < 2) return "low";
  const spread = stdev(cycleLengths);
  if (spread >= 4) return "low";
  if (cycleLengths.length >= 6 && spread < 2) return "high";
  if (cycleLengths.length >= 3) return "medium";
  return "low";
}

/** Derive every summary number from the reports. */
export function cycleStats(data: AppData): CycleStats {
  const periods = derivePeriods(data);
  const cycleLengths: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    cycleLengths.push(daysBetween(periods[i - 1]!.start, periods[i]!.start));
  }
  const hasCycles = cycleLengths.length > 0;
  return {
    periods,
    cycleLengths,
    averageCycle: hasCycles ? Math.round(mean(cycleLengths)) : null,
    medianCycle: hasCycles ? Math.round(median(cycleLengths)) : null,
    shortestCycle: hasCycles ? Math.min(...cycleLengths) : null,
    longestCycle: hasCycles ? Math.max(...cycleLengths) : null,
    averagePeriodLength:
      periods.length > 0
        ? Math.round(mean(periods.map((p) => p.length)))
        : null,
    variability: hasCycles ? Math.round(stdev(cycleLengths) * 10) / 10 : null,
    confidence: confidenceFor(cycleLengths),
  };
}

/**
 * Project the next period and fertile window from the history.
 *
 * The typical cycle length is the *median* of the observed gaps rather than
 * the mean: one outlier cycle (an illness, a missed month of logging) would
 * drag a mean around for the rest of the year, while the median shrugs it off.
 * With fewer than two periods logged there is nothing to observe, so the
 * configured default stands in and `usingDefault` says so.
 *
 * The predicted start rolls forward over unlogged cycles — if the last logged
 * period was three cycles ago the forecast names a current date, not one that
 * has been and gone — but stops short of rolling past a period that is merely
 * late, which reads as overdue (a negative `daysUntilNext`) instead of
 * silently jumping a month. See the loop below for where that line is drawn.
 */
export function forecast(
  data: AppData,
  today: DayKey,
  options: CycleOptions = DEFAULT_CYCLE_OPTIONS,
): Forecast {
  const stats = cycleStats(data);
  const observed = stats.medianCycle;
  const cycleLength = observed ?? options.defaultCycleLength;
  const periodLength = stats.averagePeriodLength ?? options.defaultPeriodLength;

  const last = stats.periods[stats.periods.length - 1];
  if (!last) {
    return {
      cycleLength,
      usingDefault: true,
      currentPeriodStart: null,
      cycleDay: null,
      nextStart: null,
      nextEnd: null,
      daysUntilNext: null,
      ovulation: null,
      fertileStart: null,
      fertileEnd: null,
      confidence: "none",
    };
  }

  // Roll the projection forward over cycles that were never logged, and stop
  // at the first one less than a full cycle in the past.
  //
  // That cut-off is the whole judgement call. A projected start a few days ago
  // with no bleeding logged is ambiguous — the period is either late, or it
  // arrived and went unrecorded — and "3 days late" is the more useful of the
  // two readings, so the date stands and `daysUntilNext` goes negative. Once a
  // whole cycle has passed, at least one cycle certainly went unlogged, and
  // holding on to a month-old date would just be wrong.
  let nextStart = addDays(last.start, cycleLength);
  while (daysBetween(nextStart, today) >= cycleLength) {
    nextStart = addDays(nextStart, cycleLength);
  }
  // The start of the cycle today sits in — observed for the current cycle,
  // projected for any that went unlogged. `cycleDay` can therefore run past
  // `cycleLength` while a period is overdue, which is the point: "day 31" says
  // more than clamping it to 28 would.
  const cycleStart = addDays(nextStart, -cycleLength);

  const ovulation = addDays(nextStart, -options.lutealPhaseLength);
  return {
    cycleLength,
    usingDefault: observed === null,
    currentPeriodStart: cycleStart,
    cycleDay: daysBetween(cycleStart, today) + 1,
    nextStart,
    nextEnd: addDays(nextStart, Math.max(0, periodLength - 1)),
    daysUntilNext: daysBetween(today, nextStart),
    ovulation,
    fertileStart: addDays(ovulation, -options.fertileWindowBefore),
    fertileEnd: addDays(ovulation, options.fertileWindowAfter),
    confidence: stats.confidence,
  };
}

/** The next `count` predicted period starts after the current cycle, each one
 *  a further `cycleLength` on. Used by the History screen's outlook list. */
export function upcomingStarts(
  f: Forecast,
  count: number,
): { start: DayKey; end: DayKey }[] {
  if (!f.nextStart || !f.nextEnd) return [];
  const spanLength = daysBetween(f.nextStart, f.nextEnd);
  const out: { start: DayKey; end: DayKey }[] = [];
  for (let i = 0; i < count; i++) {
    const start = addDays(f.nextStart, i * f.cycleLength);
    out.push({ start, end: addDays(start, spanLength) });
  }
  return out;
}

/** Where a day sits in its cycle. Used to colour the calendar and to bucket
 *  moods by phase in the History screen. */
export type CyclePhase = "menstrual" | "follicular" | "fertile" | "luteal";

/**
 * The phase a day belongs to, given the start of its cycle and the shape of a
 * typical cycle. Menstrual covers the bleeding days; fertile is the window
 * around the projected ovulation; follicular and luteal are what remain either
 * side. Returns null for a day before the cycle start or beyond its end.
 */
export function phaseOf(
  day: DayKey,
  cycleStart: DayKey,
  cycleLength: number,
  periodLength: number,
  options: CycleOptions = DEFAULT_CYCLE_OPTIONS,
): CyclePhase | null {
  const index = daysBetween(cycleStart, day);
  if (index < 0 || index >= cycleLength) return null;
  if (index < periodLength) return "menstrual";
  const ovulationIndex = cycleLength - options.lutealPhaseLength;
  if (
    index >= ovulationIndex - options.fertileWindowBefore &&
    index <= ovulationIndex + options.fertileWindowAfter
  ) {
    return "fertile";
  }
  return index < ovulationIndex ? "follicular" : "luteal";
}
