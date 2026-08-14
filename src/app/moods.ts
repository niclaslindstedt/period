// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Mood statistics — the second half of "look for patterns", alongside the
// cycle arithmetic in `cycle.ts`. Both are pure and clock-free: the caller
// supplies the reports and the cycle shape, and gets back counts.
//
// The question these answer is the one people actually open a tracker for:
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
import { sortedEntries, type AppData, type MoodId } from "./types.ts";

/** The phases a mood can be bucketed into, in cycle order. */
export const PHASES = ["menstrual", "follicular", "fertile", "luteal"] as const;

/** What was reported during one phase, across every observed cycle. */
export type PhaseMoodSummary = {
  phase: CyclePhase;
  /** Days in this phase that carry any report at all — the sample size. */
  days: number;
  /** How often each mood was tagged during the phase. */
  moodCounts: Record<MoodId, number>;
  /** Mean mood-swing level across the reported days, or null with no days. */
  averageSwing: number | null;
};

function emptyCounts(): Record<MoodId, number> {
  return {
    calm: 0,
    happy: 0,
    energetic: 0,
    irritable: 0,
    anxious: 0,
    sad: 0,
    angry: 0,
    tearful: 0,
    tired: 0,
  };
}

/**
 * Bucket every reported day into its cycle phase and tally the moods.
 *
 * A day is assigned to the *observed* cycle it falls in — the one starting at
 * the most recent period start at or before it — so only days covered by real
 * history are counted. Days before the first logged period, and days in the
 * still-unfinished current cycle beyond its projected length, are skipped
 * rather than guessed into a phase.
 */
export function moodsByPhase(
  data: AppData,
  options: CycleOptions,
): PhaseMoodSummary[] {
  const stats = cycleStats(data);
  const cycleLength = stats.medianCycle ?? options.defaultCycleLength;
  const periodLength = stats.averagePeriodLength ?? options.defaultPeriodLength;

  const summaries = new Map<CyclePhase, PhaseMoodSummary>(
    PHASES.map((phase) => [
      phase,
      { phase, days: 0, moodCounts: emptyCounts(), averageSwing: null },
    ]),
  );
  const swingTotals = new Map<CyclePhase, number>(
    PHASES.map((phase) => [phase, 0]),
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
    for (const mood of entry.moods) summary.moodCounts[mood] += 1;
    swingTotals.set(phase, swingTotals.get(phase)! + entry.swing);
  }

  return PHASES.map((phase) => {
    const summary = summaries.get(phase)!;
    return {
      ...summary,
      averageSwing:
        summary.days > 0
          ? Math.round((swingTotals.get(phase)! / summary.days) * 10) / 10
          : null,
    };
  });
}

/** The moods tagged most often overall, most frequent first. Ties break on
 *  roster order, so the list is stable between renders. */
export function topMoods(
  data: AppData,
  limit: number,
): { mood: MoodId; count: number }[] {
  const counts = emptyCounts();
  for (const entry of sortedEntries(data)) {
    for (const mood of entry.moods) counts[mood] += 1;
  }
  return (Object.entries(counts) as [MoodId, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([mood, count]) => ({ mood, count }));
}
