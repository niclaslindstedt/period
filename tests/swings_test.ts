// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { DEFAULT_CYCLE_OPTIONS } from "../src/app/cycle.ts";
import { swingsByPhase, swingTotals } from "../src/app/swings.ts";
import { emptyDoc, type AppData, type DayEntry } from "../src/app/types.ts";

// The swing tallies are what the History screen's "is it always like this the
// week before?" answer is built from. Getting a day into the wrong phase would
// produce a confident, wrong answer, so the bucketing is pinned down here.

function doc(entries: Partial<DayEntry>[]): AppData {
  const data = emptyDoc();
  for (const partial of entries) {
    const entry: DayEntry = {
      date: partial.date!,
      bleeding: partial.bleeding ?? false,
      moodSwings: partial.moodSwings ?? false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    data.entries[entry.date] = entry;
  }
  return data;
}

// One 28-day cycle starting 1 March, plus the next period so the cycle length
// is observed rather than assumed.
const cycle = doc([
  { date: "2026-03-01", bleeding: true, moodSwings: true },
  { date: "2026-03-02", bleeding: true, moodSwings: true },
  { date: "2026-03-03", bleeding: true },
  { date: "2026-03-04", bleeding: true },
  { date: "2026-03-05", bleeding: true },
  { date: "2026-03-08" },
  { date: "2026-03-12" },
  { date: "2026-03-25", moodSwings: true },
  { date: "2026-03-29", bleeding: true },
]);

describe("swingsByPhase", () => {
  it("buckets each reported day into its phase", () => {
    const phases = swingsByPhase(cycle, DEFAULT_CYCLE_OPTIONS);
    const by = Object.fromEntries(phases.map((p) => [p.phase, p]));

    // The observed average period is 3 days (a 5-day period and the 1-day one
    // that opens the next cycle), so 1–3 March are menstrual — and so is 29
    // March, which is day one of the following cycle.
    expect(by.menstrual!.days).toBe(4);
    expect(by.follicular!.days).toBe(3);
    // Ovulation lands on day 15 of a 28-day cycle, so 12 March is fertile.
    expect(by.fertile!.days).toBe(1);
    expect(by.luteal!.days).toBe(1);
  });

  it("reports the share of a phase's reported days that had swings", () => {
    const phases = swingsByPhase(cycle, DEFAULT_CYCLE_OPTIONS);
    const menstrual = phases.find((p) => p.phase === "menstrual")!;
    // 1 and 2 March swung, 3 and 29 March did not — two days in four.
    expect(menstrual.swingDays).toBe(2);
    expect(menstrual.swingShare).toBe(50);

    const luteal = phases.find((p) => p.phase === "luteal")!;
    expect(luteal.swingShare).toBe(100);
  });

  it("reports no share for a phase with nothing logged in it", () => {
    const phases = swingsByPhase(
      doc([{ date: "2026-03-01", bleeding: true }]),
      DEFAULT_CYCLE_OPTIONS,
    );
    expect(phases.find((p) => p.phase === "luteal")!.swingShare).toBeNull();
  });

  it("skips days before the first logged period rather than guessing", () => {
    const phases = swingsByPhase(
      doc([
        { date: "2026-02-20", moodSwings: true },
        { date: "2026-03-01", bleeding: true },
      ]),
      DEFAULT_CYCLE_OPTIONS,
    );
    const total = phases.reduce((sum, p) => sum + p.swingDays, 0);
    expect(total).toBe(0);
  });

  it("returns every phase even with no data at all", () => {
    const phases = swingsByPhase(emptyDoc(), DEFAULT_CYCLE_OPTIONS);
    expect(phases.map((p) => p.phase)).toEqual([
      "menstrual",
      "follicular",
      "fertile",
      "luteal",
    ]);
    expect(phases.every((p) => p.days === 0)).toBe(true);
  });
});

describe("swingTotals", () => {
  it("counts the swing days against every reported day", () => {
    expect(swingTotals(cycle)).toEqual({ swingDays: 3, days: 9 });
  });

  it("counts nothing in an empty document", () => {
    expect(swingTotals(emptyDoc())).toEqual({ swingDays: 0, days: 0 });
  });
});
