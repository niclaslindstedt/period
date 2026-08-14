// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Mood-swing statistics — the second half of "look for patterns", alongside
// the cycle arithmetic in `cycle.ts`. Both are pure and clock-free: the caller
// supplies the reports and the cycle shape, and gets back counts.
//
// The question this answers is the one people actually open a tracker for:
// "is the week before my period always like this?". The honest answer is a
// count per phase — not a claim of cause — so that is exactly what is
// returned, together with the sample size behind it.

import { daysBetween } from "@niclaslindstedt/oss-framework/calendar";

import {
  cycleStats,
  phaseOf,
  type CycleOptions,
  type CyclePhase,
} from "./cycle.ts";
import { sortedEntries, type AppData } from "./types.ts";

/** The phases a day can be bucketed into, in cycle order. */
export const PHASES = ["menstrual", "follicular", "fertile", "luteal"] as const;

/** What was reported during one phase, across every observed cycle. */
export type PhaseSwingSummary = {
  phase: CyclePhase;
  /** Days in this phase that carry a report at all — the sample size. */
  days: number;
  /** How many of those days were reported as having mood swings. */
  swingDays: number;
  /** `swingDays / days` as a percentage, rounded — null with no days. Reported
   *  as a share rather than a count because the phases are different lengths:
   *  the luteal phase has roughly twice the days of a period, so raw counts
   *  would make it look worse for free. */
  swingShare: number | null;
};

/**
 * Bucket every reported day into its cycle phase and count the swings.
 *
 * A day is assigned to the *observed* cycle it falls in — the one starting at
 * the most recent period start at or before it — so only days covered by real
 * history are counted. Days before the first logged period, and days in the
 * still-unfinished current cycle beyond its projected length, are skipped
 * rather than guessed into a phase.
 */
export function swingsByPhase(
  data: AppData,
  options: CycleOptions,
): PhaseSwingSummary[] {
  const stats = cycleStats(data);
  const cycleLength = stats.medianCycle ?? options.defaultCycleLength;
  const periodLength = stats.averagePeriodLength ?? options.defaultPeriodLength;

  const summaries = new Map<CyclePhase, PhaseSwingSummary>(
    PHASES.map((phase) => [
      phase,
      { phase, days: 0, swingDays: 0, swingShare: null },
    ]),
  );

  const starts = stats.periods.map((p) => p.start);
  for (const entry of sortedEntries(data)) {
    // The most recent period start at or before this day.
    let cycleStart: string | null = null;
    for (const start of starts) {
      if (daysBetween(start, entry.date) >= 0) cycleStart = start;
      else break;
    }
    if (!cycleStart) continue;

    const phase = phaseOf(
      entry.date,
      cycleStart,
      cycleLength,
      periodLength,
      options,
    );
    if (!phase) continue;

    const summary = summaries.get(phase)!;
    summary.days += 1;
    if (entry.moodSwings) summary.swingDays += 1;
  }

  return PHASES.map((phase) => {
    const summary = summaries.get(phase)!;
    return {
      ...summary,
      swingShare:
        summary.days > 0
          ? Math.round((summary.swingDays / summary.days) * 100)
          : null,
    };
  });
}

/** Days reported with mood swings, and days reported at all. The denominator
 *  travels with the numerator on purpose: "12 days" means nothing without it. */
export function swingTotals(data: AppData): {
  swingDays: number;
  days: number;
} {
  const entries = sortedEntries(data);
  return {
    swingDays: entries.filter((e) => e.moodSwings).length,
    days: entries.length,
  };
}
