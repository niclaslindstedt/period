// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { addDays, daysBetween } from "@niclaslindstedt/oss-framework/calendar";

import { DEFAULT_CYCLE_OPTIONS } from "../src/app/cycle.ts";
import { toneFor } from "../src/app/DayMark.tsx";
import {
  dayStatus,
  fertileProbability,
  ongoingPeriodProbability,
  periodProbability,
  statusStrip,
  upcomingPeriodProbability,
  type StatusContext,
} from "../src/app/dayStatus.ts";
import { probabilisticForecast } from "../src/app/forecastModel.ts";
import { emptyDoc, type AppData } from "../src/app/types.ts";

// The Status screen's headline and the Calendar screen's colours both come out
// of this module, so a wrong call here is a wrong word on the first screen the
// app opens on. Every case below pins a real date against a document of real
// periods — the derivation is clock-free, so no timers are needed.

const STAMP = "2026-01-01T00:00:00.000Z";

/** Six periods of five days at a steady 28-day gap, the last starting
 *  2026-05-21. Only the bleeding days are logged, so nothing else is ruled in
 *  or out and the posterior is the cycle history alone. */
const STARTS = [
  "2026-01-01",
  "2026-01-29",
  "2026-02-26",
  "2026-03-26",
  "2026-04-23",
  "2026-05-21",
];

function steadyDoc(): AppData {
  const data = emptyDoc();
  for (const start of STARTS) {
    for (let i = 0; i < 5; i++) {
      const date = addDays(start, i);
      data.entries[date] = {
        date,
        bleeding: true,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
  }
  return data;
}

/** The context the screens build, for a document and a day. */
function contextFor(
  data: AppData,
  today: string,
  showFertileWindow = true,
): StatusContext {
  return {
    data,
    forecast: probabilisticForecast(
      data,
      today,
      "univariate",
      DEFAULT_CYCLE_OPTIONS,
    ),
    options: DEFAULT_CYCLE_OPTIONS,
    showFertileWindow: showFertileWindow,
  };
}

describe("dayStatus", () => {
  it("calls a reported bleeding day a period, on the report rather than the model", () => {
    const ctx = contextFor(steadyDoc(), "2026-05-23");
    const status = dayStatus("2026-05-23", ctx);
    expect(status.kind).toBe("period");
    expect(status.observed).toBe(true);
    expect(status.probability).toBe(1);
    expect(status.reported).toBe(true);
  });

  it("calls the days around the projected ovulation fertile", () => {
    // Last start 2026-05-21 at a 28-day cycle puts the next one on 2026-06-18,
    // ovulation fourteen days before it (2026-06-04), and the window from five
    // days before that through one day after: 2026-05-30 — 2026-06-05.
    const ctx = contextFor(steadyDoc(), "2026-06-02");
    const status = dayStatus("2026-06-02", ctx);
    expect(status.kind).toBe("fertile");
    expect(status.probability).toBeGreaterThan(0.5);
    expect(status.observed).toBe(false);
  });

  it("calls a luteal day not fertile, and says so with the complement", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-10");
    const status = dayStatus("2026-06-10", ctx);
    expect(status.kind).toBe("notFertile");
    expect(status.probability).toBeCloseTo(1 - status.fertileProbability, 12);
  });

  it("calls the days the next period is likely to cover a predicted period", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-10");
    const status = dayStatus("2026-06-19", ctx);
    expect(status.kind).toBe("predictedPeriod");
    expect(status.periodProbability).toBeGreaterThan(0.5);
  });

  it("never names a fertile day — or its negative — with the window turned off", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-02", false);
    const status = dayStatus("2026-06-02", ctx);
    // Not "notFertile": the complement of a window nobody asked to see would
    // be a confident fertility claim made by a screen making none.
    expect(status.kind).toBe("noPeriod");
    expect(status.fertileProbability).toBe(0);
    expect(status.probability).toBeCloseTo(1 - status.periodProbability, 12);
  });

  it("marks a reported day with no bleeding as reported, not as a period", () => {
    const data = steadyDoc();
    data.entries["2026-06-10"] = {
      date: "2026-06-10",
      bleeding: false,
      moodSwings: true,
      lust: false,
      sex: false,
      temperature: null,
      fertilityTest: null,
      updatedAt: STAMP,
    };
    const status = dayStatus("2026-06-10", contextFor(data, "2026-06-10"));
    expect(status.kind).toBe("notFertile");
    expect(status.reported).toBe(true);
  });

  it("says nothing about the cycle before a period has been logged", () => {
    const data = emptyDoc();
    data.entries["2026-06-10"] = {
      date: "2026-06-10",
      bleeding: false,
      moodSwings: false,
      lust: false,
      sex: false,
      temperature: null,
      fertilityTest: null,
      updatedAt: STAMP,
    };
    const ctx = contextFor(data, "2026-06-10");
    expect(ctx.forecast).toBeNull();
    const status = dayStatus("2026-06-10", ctx);
    expect(status.kind).toBe("unknown");
    expect(status.probability).toBe(0);
    expect(status.reported).toBe(true);
  });
});

describe("fertileProbability / periodProbability", () => {
  const data = steadyDoc();
  const ctx = contextFor(data, "2026-06-02");

  it("peaks across the window and falls away either side of it", () => {
    const f = ctx.forecast!;
    const at = (day: string) =>
      fertileProbability(f, day, DEFAULT_CYCLE_OPTIONS);
    // Inside the 2026-05-30 — 2026-06-05 window, past it, and long before it.
    expect(at("2026-06-02")).toBeGreaterThan(at("2026-06-08"));
    expect(at("2026-06-02")).toBeGreaterThan(at("2026-05-24"));
    expect(at("2026-06-08")).toBeLessThan(0.5);
  });

  it("is a probability — never negative, never above one", () => {
    const f = ctx.forecast!;
    for (let i = -40; i <= 40; i++) {
      const day = addDays("2026-06-02", i);
      const fertile = fertileProbability(f, day, DEFAULT_CYCLE_OPTIONS);
      const period = periodProbability(f, day, data);
      expect(fertile).toBeGreaterThanOrEqual(0);
      expect(fertile).toBeLessThanOrEqual(1);
      expect(period).toBeGreaterThanOrEqual(0);
      expect(period).toBeLessThanOrEqual(1);
    }
  });

  it("covers the days after a predicted start, with a soft trailing edge", () => {
    const f = ctx.forecast!;
    // Five-day periods at a 28-day cycle from 2026-05-21 put the next start on
    // 2026-06-18. The second day of it is more certain than the fifth, and the
    // fifth than the tenth — a fixed span could not say that.
    const second = upcomingPeriodProbability(f, "2026-06-19");
    const fifth = upcomingPeriodProbability(f, "2026-06-22");
    const tenth = upcomingPeriodProbability(f, "2026-06-27");
    expect(second).toBeGreaterThan(fifth);
    expect(fifth).toBeGreaterThan(tenth);
    expect(second).toBeGreaterThan(0.5);
    expect(tenth).toBeLessThan(0.5);
  });
});

describe("the period already running", () => {
  /** The steady history, but with the last period cut back to its first
   *  `days` reported days — someone who has just logged this morning. */
  function partialDoc(days: number): AppData {
    const data = steadyDoc();
    for (let i = days; i < 5; i++)
      delete data.entries[addDays("2026-05-21", i)];
    return data;
  }

  it("paints the days ahead on the first morning of a period", () => {
    // The regression this exists for: on cycle day 1 the start-day posterior is
    // describing an onset four weeks out, so on its own it says nothing at all
    // about tomorrow — and the week row went blank from today forward.
    const data = partialDoc(1);
    const ctx = contextFor(data, "2026-05-21");
    const f = ctx.forecast!;

    expect(upcomingPeriodProbability(f, "2026-05-22")).toBeLessThan(0.01);
    for (const day of ["2026-05-22", "2026-05-23", "2026-05-24"]) {
      expect(dayStatus(day, ctx).kind).toBe("predictedPeriod");
      expect(ongoingPeriodProbability(f, day, data)).toBeGreaterThan(0.5);
    }
  });

  it("runs out as the episode outlasts what history says is typical", () => {
    const data = partialDoc(1);
    const f = contextFor(data, "2026-05-21").forecast!;
    const at = (day: string) => ongoingPeriodProbability(f, day, data);
    // Day 2 through day 8 of a history of five-day periods.
    expect(at("2026-05-22")).toBeGreaterThan(at("2026-05-25"));
    expect(at("2026-05-25")).toBeGreaterThan(at("2026-05-28"));
    expect(at("2026-05-28")).toBeLessThan(0.5);
  });

  it("gets more confident about tomorrow the longer the episode has run", () => {
    // A period already six days in has outlasted the typical one, so the odds
    // it lasts a seventh are better than the odds a one-day-old period lasts a
    // seventh — conditioning on how far it has come is what says so.
    const early = partialDoc(1);
    const late = partialDoc(5);
    // Extend the running episode two days past the logged five.
    for (const day of ["2026-05-26", "2026-05-27"]) {
      late.entries[day] = {
        date: day,
        bleeding: true,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const day8 = "2026-05-28";
    expect(
      ongoingPeriodProbability(contextFor(late, day8).forecast!, day8, late),
    ).toBeGreaterThan(
      ongoingPeriodProbability(
        contextFor(early, "2026-05-21").forecast!,
        day8,
        early,
      ),
    );
  });

  it("says nothing once the episode has finished", () => {
    // The last bleeding day is 2026-05-25 and nothing has been logged since, so
    // by 2026-05-30 the episode is over — no bleeding day could still join it.
    const data = steadyDoc();
    const f = contextFor(data, "2026-05-30").forecast!;
    expect(f.periodLength.inProgress).toBeNull();
    expect(ongoingPeriodProbability(f, "2026-05-30", data)).toBe(0);
  });

  it("never paints a period over a day reported without bleeding", () => {
    const data = partialDoc(1);
    data.entries["2026-05-22"] = {
      date: "2026-05-22",
      bleeding: false,
      moodSwings: false,
      lust: false,
      sex: false,
      temperature: null,
      fertilityTest: null,
      updatedAt: STAMP,
    };
    const ctx = contextFor(data, "2026-05-22");
    expect(ongoingPeriodProbability(ctx.forecast!, "2026-05-22", data)).toBe(0);
    expect(dayStatus("2026-05-22", ctx).kind).not.toBe("predictedPeriod");
    // …and the episode is still open, so tomorrow is still a period day: one
    // dry day inside a period is bridged, not the end of it.
    expect(dayStatus("2026-05-23", ctx).kind).toBe("predictedPeriod");
  });

  it("does not let the running episode shorten its own expected length", () => {
    // Its length is censored — "one day" on the first morning. Averaging it in
    // is what used to make the model predict a one-day period.
    const first = contextFor(partialDoc(1), "2026-05-21").forecast!;
    const whole = contextFor(steadyDoc(), "2026-05-25").forecast!;
    expect(first.periodLength.observedEpisodes).toBe(5);
    expect(first.periodLength.typicalLength).toBe(5);
    expect(whole.periodLength.typicalLength).toBe(5);
  });
});

// The months after next. The half rule cannot reach them — a few cycles out no
// single day is more likely than not a period day — so the *mark* follows the
// projected spans while the *word* and the percentage stay on the rule they
// always were. These pin both halves of that split.
describe("the cycles after the next one", () => {
  it("expects the second period a cycle after the first", () => {
    const f = contextFor(steadyDoc(), "2026-06-01").forecast!;
    expect(f.upcomingStarts.length).toBeGreaterThan(1);
    expect(f.upcomingStarts[0]).toBe(f.expectedDay);
    expect(daysBetween(f.upcomingStarts[0]!, f.upcomingStarts[1]!)).toBe(28);
  });

  it("marks the second period's days without calling them period days", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-01");
    const second = ctx.forecast!.upcomingStarts[1]!;
    const status = dayStatus(addDays(second, 1), ctx);

    expect(status.expectedPeriod).toBe(true);
    expect(toneFor(status)).toBe("predicted");
    // …and the honest number underneath is still the honest number: that far
    // out the spread is wider than a period is long, so no day clears a half.
    expect(status.kind).not.toBe("predictedPeriod");
    expect(status.periodProbability).toBeLessThan(0.5);
  });

  it("puts a fertile window a luteal phase before each projected period", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-01");
    const second = ctx.forecast!.upcomingStarts[1]!;
    // Ovulation fourteen days before the onset, the window from five days
    // before that through one day after.
    for (let lag = 19; lag >= 13; lag--) {
      expect(dayStatus(addDays(second, -lag), ctx).expectedFertile).toBe(true);
    }
    expect(dayStatus(addDays(second, -20), ctx).expectedFertile).toBe(false);
    expect(dayStatus(addDays(second, -12), ctx).expectedFertile).toBe(false);
  });

  it("fills the fertile window of the cycle that is under way", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-01");
    // The cycle running now opened with the period logged on 2026-05-21 and
    // will close with the one expected on 2026-06-18, putting ovulation on
    // 2026-06-04 and the window at 2026-05-30 — 2026-06-05. The onset it points
    // at has not arrived, but the cycle carrying it is dated by a report — so
    // it is filled.
    const current = dayStatus("2026-06-02", ctx);
    expect(current.startedFertile).toBe(true);
    expect(current.expectedFertile).toBe(false);
    expect(toneFor(current)).toBe("fertile");

    // The window one cycle further on sits in a cycle only a projected onset
    // opens, and is drawn hollow for exactly that reason.
    const later = dayStatus("2026-06-30", ctx);
    expect(later.startedFertile).toBe(false);
    expect(later.expectedFertile).toBe(true);
    expect(toneFor(later)).toBe("predictedFertile");
  });

  it("fills the windows of cycles already behind it", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-01");
    // The cycle that opened 2026-04-23 closed with the period on 2026-05-21,
    // so its window ran 2026-05-02 — 2026-05-08. Both ends happened.
    const past = dayStatus("2026-05-05", ctx);
    expect(past.startedFertile).toBe(true);
    expect(toneFor(past)).toBe("fertile");
  });

  it("says nothing about a window before the first period ever logged", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-01");
    // A fortnight before 2026-01-01 is a cycle the app never saw open, so it
    // gets neither mark rather than a guess about a month it has no report for.
    const before = dayStatus("2025-12-15", ctx);
    expect(before.startedFertile).toBe(false);
    expect(before.expectedFertile).toBe(false);
    expect(toneFor(before)).toBe("none");
  });

  it("says nothing about the fertile window when it is turned off", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-01", false);
    const second = ctx.forecast!.upcomingStarts[1]!;
    expect(dayStatus(addDays(second, -14), ctx).expectedFertile).toBe(false);
    expect(dayStatus("2026-05-05", ctx).startedFertile).toBe(false);
    expect(dayStatus(addDays(second, 1), ctx).expectedPeriod).toBe(true);
  });

  it("lets a logged day of no bleeding outrank the span it falls in", () => {
    // A report is a fact, and it outranks a projection the same way it rules a
    // candidate start day out of the forecast.
    const inside = addDays(
      contextFor(steadyDoc(), "2026-06-01").forecast!.upcomingStarts[1]!,
      1,
    );
    const data = steadyDoc();
    data.entries[inside] = {
      date: inside,
      bleeding: false,
      moodSwings: false,
      lust: false,
      sex: false,
      temperature: null,
      fertilityTest: null,
      updatedAt: STAMP,
    };
    const ctx = contextFor(data, "2026-06-01");
    expect(dayStatus(inside, ctx).expectedPeriod).toBe(false);
    expect(dayStatus(addDays(inside, 1), ctx).expectedPeriod).toBe(true);
  });

  it("stops where the projection does", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-01");
    const starts = ctx.forecast!.upcomingStarts;
    const past = addDays(starts[starts.length - 1]!, 60);
    expect(dayStatus(past, ctx).expectedPeriod).toBe(false);
    expect(dayStatus(past, ctx).expectedFertile).toBe(false);
    expect(dayStatus(past, ctx).startedFertile).toBe(false);
  });
});

describe("statusStrip", () => {
  it("runs from `before` days back to `after` days forward, in order", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-02");
    const strip = statusStrip("2026-06-02", 3, 3, ctx);
    expect(strip).toHaveLength(7);
    expect(strip.map((s) => s.day)).toEqual([
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
  });

  it("agrees with `dayStatus` on every day it covers", () => {
    const ctx = contextFor(steadyDoc(), "2026-06-02");
    for (const status of statusStrip("2026-06-02", 3, 3, ctx)) {
      expect(status).toEqual(dayStatus(status.day, ctx));
    }
  });
});
