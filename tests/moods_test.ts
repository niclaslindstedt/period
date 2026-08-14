// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { DEFAULT_CYCLE_OPTIONS } from "../src/app/cycle.ts";
import { moodsByPhase, topMoods } from "../src/app/moods.ts";
import { emptyDoc, type AppData, type DayEntry } from "../src/app/types.ts";

// The mood tallies are what the History screen's "is it always like this the
// week before?" answer is built from. Getting a day into the wrong phase would
// produce a confident, wrong answer, so the bucketing is pinned down here.

function doc(entries: Partial<DayEntry>[]): AppData {
  const data = emptyDoc();
  for (const partial of entries) {
    const entry: DayEntry = {
      date: partial.date!,
      bleeding: partial.bleeding ?? "none",
      moods: partial.moods ?? [],
      swing: partial.swing ?? 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    data.entries[entry.date] = entry;
  }
  return data;
}

// One 28-day cycle starting 1 March, plus the next period so the cycle length
// is observed rather than assumed.
const cycle = doc([
  { date: "2026-03-01", bleeding: "medium", moods: ["tired"], swing: 1 },
  { date: "2026-03-02", bleeding: "medium", moods: ["sad"], swing: 2 },
  { date: "2026-03-03", bleeding: "light" },
  { date: "2026-03-04", bleeding: "light" },
  { date: "2026-03-05", bleeding: "spotting" },
  { date: "2026-03-08", moods: ["happy"], swing: 0 },
  { date: "2026-03-12", moods: ["energetic"], swing: 0 },
  { date: "2026-03-25", moods: ["irritable"], swing: 3 },
  { date: "2026-03-29", bleeding: "medium" },
]);

describe("moodsByPhase", () => {
  it("buckets each reported day into its phase", () => {
    const phases = moodsByPhase(cycle, DEFAULT_CYCLE_OPTIONS);
    const by = Object.fromEntries(phases.map((p) => [p.phase, p]));

    expect(by.menstrual!.moodCounts.tired).toBe(1);
    expect(by.menstrual!.moodCounts.sad).toBe(1);
    expect(by.follicular!.moodCounts.happy).toBe(1);
    // Ovulation lands on day 15 of a 28-day cycle, so 12 March is fertile.
    expect(by.fertile!.moodCounts.energetic).toBe(1);
    expect(by.luteal!.moodCounts.irritable).toBe(1);
  });

  it("averages the mood-swing level over the days reported in a phase", () => {
    const phases = moodsByPhase(cycle, DEFAULT_CYCLE_OPTIONS);
    const menstrual = phases.find((p) => p.phase === "menstrual")!;
    // The observed average period is 3 days (a 5-day period and the 1-day one
    // that opens the next cycle), so 1–3 March are menstrual — and so is 29
    // March, which is day one of the following cycle. Swings 1, 2, 0 and 0 —
    // a mean of 0.75, reported to one decimal.
    expect(menstrual.days).toBe(4);
    expect(menstrual.averageSwing).toBe(0.8);

    const luteal = phases.find((p) => p.phase === "luteal")!;
    expect(luteal.averageSwing).toBe(3);
  });

  it("reports no average for a phase with nothing logged in it", () => {
    const phases = moodsByPhase(
      doc([{ date: "2026-03-01", bleeding: "medium" }]),
      DEFAULT_CYCLE_OPTIONS,
    );
    expect(phases.find((p) => p.phase === "luteal")!.averageSwing).toBeNull();
  });

  it("skips days before the first logged period rather than guessing", () => {
    const phases = moodsByPhase(
      doc([
        { date: "2026-02-20", moods: ["anxious"] },
        { date: "2026-03-01", bleeding: "medium" },
      ]),
      DEFAULT_CYCLE_OPTIONS,
    );
    const total = phases.reduce((sum, p) => sum + p.moodCounts.anxious, 0);
    expect(total).toBe(0);
  });

  it("returns every phase even with no data at all", () => {
    const phases = moodsByPhase(emptyDoc(), DEFAULT_CYCLE_OPTIONS);
    expect(phases.map((p) => p.phase)).toEqual([
      "menstrual",
      "follicular",
      "fertile",
      "luteal",
    ]);
    expect(phases.every((p) => p.days === 0)).toBe(true);
  });
});

describe("topMoods", () => {
  it("ranks by count and caps the list", () => {
    const data = doc([
      { date: "2026-03-01", moods: ["tired", "sad"] },
      { date: "2026-03-02", moods: ["tired"] },
      { date: "2026-03-03", moods: ["tired", "sad"] },
      { date: "2026-03-04", moods: ["happy"] },
    ]);
    expect(topMoods(data, 2)).toEqual([
      { mood: "tired", count: 3 },
      { mood: "sad", count: 2 },
    ]);
  });

  it("leaves out moods that were never tagged", () => {
    expect(topMoods(doc([{ date: "2026-03-01" }]), 5)).toEqual([]);
  });
});
