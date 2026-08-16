// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  confidenceFor,
  cycleStats,
  derivePeriods,
  forecast,
  inProgressPeriod,
  phaseOf,
  typicalPeriodLength,
  upcomingStarts,
  DEFAULT_CYCLE_OPTIONS,
} from "../src/app/cycle.ts";
import { emptyDoc, type AppData } from "../src/app/types.ts";

// The cycle derivation is the app's load-bearing logic: every number on the
// Forecast and History screens comes out of it, and a wrong one is invisible
// until someone plans a holiday around it. It is pure and takes `today` as an
// argument, so these tests need no fake timers.

/** Build a document from a compact spec: `{ "2026-01-01": true }`, where the
 *  value is whether that day was reported as bleeding. */
function docOf(days: Record<string, boolean>): AppData {
  const data = emptyDoc();
  for (const [date, bleeding] of Object.entries(days)) {
    data.entries[date] = {
      date,
      bleeding,
      moodSwings: false,
      lust: false,
      sex: false,
      temperature: null,
      fertilityTest: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }
  return data;
}

/** A run of bleeding days starting at `start`. */
function period(start: string, length: number): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const base = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < length; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    out[d.toISOString().slice(0, 10)] = true;
  }
  return out;
}

describe("derivePeriods", () => {
  it("returns nothing when no bleeding was reported", () => {
    expect(derivePeriods(docOf({ "2026-03-02": false }))).toEqual([]);
  });

  it("groups consecutive bleeding days into one period", () => {
    const periods = derivePeriods(docOf(period("2026-03-01", 5)));
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      start: "2026-03-01",
      end: "2026-03-05",
      length: 5,
      bleedingDays: 5,
    });
  });

  it("bridges a single missing day rather than splitting the period", () => {
    // Day 3 unreported: still one period, and the bridged day is excluded from
    // `bleedingDays` while still counting toward the span's `length`.
    const periods = derivePeriods(
      docOf({
        "2026-03-01": true,
        "2026-03-02": true,
        "2026-03-04": true,
      }),
    );
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ length: 4, bleedingDays: 3 });
  });

  it("splits on a gap of two days or more", () => {
    const periods = derivePeriods(
      docOf({
        "2026-03-01": true,
        "2026-03-05": true,
      }),
    );
    expect(periods.map((p) => p.start)).toEqual(["2026-03-01", "2026-03-05"]);
  });

  it("treats a reported day with no bleeding as a gap, not a period", () => {
    // The distinction the whole document rests on: an answered "no" is a
    // report, and it must not read as a bleeding day.
    const periods = derivePeriods(
      docOf({
        "2026-03-01": true,
        "2026-03-02": false,
        "2026-03-03": false,
        "2026-03-04": true,
      }),
    );
    expect(periods.map((p) => p.start)).toEqual(["2026-03-01", "2026-03-04"]);
  });
});

describe("cycleStats", () => {
  it("measures the gap between period starts, not between periods", () => {
    const stats = cycleStats(
      docOf({
        ...period("2026-01-01", 5),
        ...period("2026-01-29", 5),
        ...period("2026-02-26", 5),
      }),
    );
    expect(stats.cycleLengths).toEqual([28, 28]);
    expect(stats.averageCycle).toBe(28);
    expect(stats.medianCycle).toBe(28);
    expect(stats.averagePeriodLength).toBe(5);
    expect(stats.variability).toBe(0);
  });

  it("has no cycle length to report from a single period", () => {
    const stats = cycleStats(docOf(period("2026-01-01", 4)));
    expect(stats.cycleLengths).toEqual([]);
    expect(stats.averageCycle).toBeNull();
    expect(stats.confidence).toBe("none");
  });

  it("reports the observed spread", () => {
    const stats = cycleStats(
      docOf({
        ...period("2026-01-01", 4),
        ...period("2026-01-26", 4), // 25
        ...period("2026-03-01", 4), // 34
      }),
    );
    expect(stats.shortestCycle).toBe(25);
    expect(stats.longestCycle).toBe(34);
  });
});

describe("confidenceFor", () => {
  it("is none with no cycles and low with one", () => {
    expect(confidenceFor([])).toBe("none");
    expect(confidenceFor([28])).toBe("low");
  });

  it("rises with steady cycles and a bigger sample", () => {
    expect(confidenceFor([28, 28, 29])).toBe("medium");
    expect(confidenceFor([28, 28, 29, 28, 27, 28])).toBe("high");
  });

  it("stays low when the cycles are all over the place, however many", () => {
    expect(confidenceFor([21, 35, 22, 34, 40, 20, 33, 25])).toBe("low");
  });
});

describe("forecast", () => {
  const history = docOf({
    ...period("2026-01-01", 5),
    ...period("2026-01-29", 5),
    ...period("2026-02-26", 5),
  });

  it("predicts the next start one typical cycle on", () => {
    const f = forecast(history, "2026-03-05");
    expect(f.currentPeriodStart).toBe("2026-02-26");
    expect(f.cycleDay).toBe(8);
    expect(f.nextStart).toBe("2026-03-26");
    expect(f.daysUntilNext).toBe(21);
    expect(f.usingDefault).toBe(false);
  });

  it("counts ovulation back from the next start, not forward from the last", () => {
    const f = forecast(history, "2026-03-05");
    // 2026-03-26 minus the 14-day luteal phase.
    expect(f.ovulation).toBe("2026-03-12");
    expect(f.fertileStart).toBe("2026-03-07");
    expect(f.fertileEnd).toBe("2026-03-13");
  });

  it("reports an overdue period rather than skipping to the next one", () => {
    const f = forecast(history, "2026-03-29");
    expect(f.nextStart).toBe("2026-03-26");
    expect(f.daysUntilNext).toBe(-3);
  });

  it("rolls forward over cycles that went unlogged", () => {
    // Nothing logged since February and today is in June: three cycles went
    // unrecorded, so the forecast rolls to a current date rather than naming
    // one four months gone. It stops at the most recent projection, which can
    // still be days in the past — that is the overdue reading above.
    const f = forecast(history, "2026-06-10");
    expect(f.nextStart).toBe("2026-05-21");
    expect(f.daysUntilNext).toBe(-20);
  });

  it("falls back to the configured cycle length until two periods exist", () => {
    const f = forecast(docOf(period("2026-01-01", 5)), "2026-01-10", {
      ...DEFAULT_CYCLE_OPTIONS,
      defaultCycleLength: 30,
    });
    expect(f.usingDefault).toBe(true);
    expect(f.cycleLength).toBe(30);
    expect(f.nextStart).toBe("2026-01-31");
  });

  it("predicts nothing at all with no history", () => {
    const f = forecast(emptyDoc(), "2026-03-05");
    expect(f.nextStart).toBeNull();
    expect(f.cycleDay).toBeNull();
    expect(f.confidence).toBe("none");
  });

  it("uses the median, so one odd cycle doesn't drag the prediction", () => {
    const withOutlier = docOf({
      ...period("2026-01-01", 4),
      ...period("2026-01-29", 4), // 28
      ...period("2026-02-26", 4), // 28
      ...period("2026-05-01", 4), // 64 — a season of not logging
      ...period("2026-05-29", 4), // 28
    });
    expect(forecast(withOutlier, "2026-06-02").cycleLength).toBe(28);
  });
});

describe("inProgressPeriod", () => {
  const periods = derivePeriods(
    docOf({ ...period("2026-03-01", 5), ...period("2026-03-29", 4) }),
  );

  it("is the last episode while a bleeding day could still join it", () => {
    // The run ends 2026-04-01, and `derivePeriods` bridges up to one dry day —
    // so bleeding on the 3rd would extend it, and the episode is still open.
    expect(inProgressPeriod(periods, "2026-04-01")?.start).toBe("2026-03-29");
    expect(inProgressPeriod(periods, "2026-04-03")?.start).toBe("2026-03-29");
  });

  it("is nothing once no bleeding day could join it any more", () => {
    expect(inProgressPeriod(periods, "2026-04-04")).toBeNull();
    expect(inProgressPeriod(periods, "2026-04-20")).toBeNull();
  });

  it("is nothing when nothing has been logged", () => {
    expect(inProgressPeriod([], "2026-04-04")).toBeNull();
  });
});

describe("typicalPeriodLength", () => {
  it("averages the episodes that have finished", () => {
    const periods = derivePeriods(
      docOf({ ...period("2026-03-01", 6), ...period("2026-03-29", 4) }),
    );
    expect(
      typicalPeriodLength(periods, "2026-04-20", DEFAULT_CYCLE_OPTIONS),
    ).toBe(5);
  });

  it("leaves the episode in progress out of its own average", () => {
    // Six days logged, then a new period one day old. Counting that one day
    // would say a period lasts three and a half days.
    const periods = derivePeriods(
      docOf({ ...period("2026-03-01", 6), ...period("2026-03-29", 1) }),
    );
    expect(
      typicalPeriodLength(periods, "2026-03-29", DEFAULT_CYCLE_OPTIONS),
    ).toBe(6);
  });

  it("falls back to the configured default before anything has finished", () => {
    const periods = derivePeriods(docOf(period("2026-03-01", 1)));
    expect(
      typicalPeriodLength(periods, "2026-03-01", DEFAULT_CYCLE_OPTIONS),
    ).toBe(DEFAULT_CYCLE_OPTIONS.defaultPeriodLength);
    expect(typicalPeriodLength([], "2026-03-01", DEFAULT_CYCLE_OPTIONS)).toBe(
      DEFAULT_CYCLE_OPTIONS.defaultPeriodLength,
    );
  });

  it("keeps a forecast from predicting a one-day period", () => {
    // The regression: on the first morning of a new period the predicted span
    // used to collapse to that morning.
    const data = docOf({
      ...period("2026-03-01", 5),
      ...period("2026-03-29", 5),
      ...period("2026-04-26", 1),
    });
    const f = forecast(data, "2026-04-26", DEFAULT_CYCLE_OPTIONS);
    expect(f.nextStart).toBe("2026-05-24");
    expect(f.nextEnd).toBe("2026-05-28");
  });
});

describe("upcomingStarts", () => {
  it("spaces each prediction one cycle apart and keeps the span length", () => {
    const f = forecast(
      docOf({
        ...period("2026-01-01", 5),
        ...period("2026-01-29", 5),
      }),
      "2026-02-10",
    );
    const next = upcomingStarts(f, 3);
    expect(next.map((s) => s.start)).toEqual([
      "2026-02-26",
      "2026-03-26",
      "2026-04-23",
    ]);
    expect(next[0]).toEqual({ start: "2026-02-26", end: "2026-03-02" });
  });

  it("returns nothing when there is no prediction", () => {
    expect(upcomingStarts(forecast(emptyDoc(), "2026-03-05"), 3)).toEqual([]);
  });
});

describe("phaseOf", () => {
  const start = "2026-03-01";

  it("puts the bleeding days in the menstrual phase", () => {
    expect(phaseOf("2026-03-01", start, 28, 5)).toBe("menstrual");
    expect(phaseOf("2026-03-05", start, 28, 5)).toBe("menstrual");
  });

  it("puts the days around ovulation in the fertile window", () => {
    // Ovulation sits at index 14 (28 - 14); the window runs index 9–15.
    expect(phaseOf("2026-03-10", start, 28, 5)).toBe("fertile");
    expect(phaseOf("2026-03-16", start, 28, 5)).toBe("fertile");
  });

  it("splits the rest into follicular before and luteal after", () => {
    expect(phaseOf("2026-03-07", start, 28, 5)).toBe("follicular");
    expect(phaseOf("2026-03-20", start, 28, 5)).toBe("luteal");
  });

  it("has no phase for a day outside the cycle", () => {
    expect(phaseOf("2026-02-28", start, 28, 5)).toBeNull();
    expect(phaseOf("2026-03-29", start, 28, 5)).toBeNull();
  });
});
