// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { addDays } from "@niclaslindstedt/oss-framework/calendar";

import { DEFAULT_CYCLE_OPTIONS, cycleStats } from "../src/app/cycle.ts";
import {
  dayStatus,
  fertileProbability,
  periodProbability,
  statusStrip,
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
        temperature: null,
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
    periodLength:
      cycleStats(data).averagePeriodLength ??
      DEFAULT_CYCLE_OPTIONS.defaultPeriodLength,
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
      temperature: null,
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
      temperature: null,
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
  const ctx = contextFor(steadyDoc(), "2026-06-02");

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
      const period = periodProbability(f, day, 5);
      expect(fertile).toBeGreaterThanOrEqual(0);
      expect(fertile).toBeLessThanOrEqual(1);
      expect(period).toBeGreaterThanOrEqual(0);
      expect(period).toBeLessThanOrEqual(1);
    }
  });

  it("treats a period as covering `periodLength` days from its start", () => {
    const f = ctx.forecast!;
    // A one-day period is the start-day mass alone; a five-day one adds the
    // four days behind it, so it can only be larger.
    expect(periodProbability(f, "2026-06-20", 5)).toBeGreaterThan(
      periodProbability(f, "2026-06-20", 1),
    );
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
