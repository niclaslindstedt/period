// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  MAX_RANGE_DAYS,
  bulkEntries,
  daysInRange,
  isSingleDay,
  loggedCount,
  rangeLength,
} from "../src/app/bulk.ts";
import { emptyDoc, type AppData, type DayEntry } from "../src/app/types.ts";

// A bulk report writes several days from one gesture, which makes it the one
// edit in the app that can lose more than a day's data at a time. The cases
// below are the ones that would do it: a span that enumerates wrong, and a
// save that drops the temperatures already sitting on the days it covers.

const NOW = "2026-03-20T21:00:00.000Z";

function entry(date: string, patch: Partial<DayEntry> = {}): DayEntry {
  return {
    date,
    bleeding: false,
    moodSwings: false,
    lust: false,
    sex: false,
    temperature: null,
    fertilityTest: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

function docOf(...entries: DayEntry[]): AppData {
  const doc = emptyDoc();
  for (const e of entries) doc.entries[e.date] = e;
  return doc;
}

describe("rangeLength / isSingleDay", () => {
  it("counts both ends", () => {
    expect(rangeLength({ start: "2026-03-01", end: "2026-03-06" })).toBe(6);
  });

  it("calls a one-day span one day", () => {
    const span = { start: "2026-03-01", end: "2026-03-01" };
    expect(rangeLength(span)).toBe(1);
    expect(isSingleDay(span)).toBe(true);
  });

  it("is zero for an unparseable end", () => {
    expect(rangeLength({ start: "2026-03-01", end: "2026-02-30" })).toBe(0);
  });
});

describe("daysInRange", () => {
  it("enumerates ascending, both ends included", () => {
    expect(daysInRange({ start: "2026-03-01", end: "2026-03-04" })).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
  });

  it("crosses a month boundary", () => {
    expect(daysInRange({ start: "2026-02-27", end: "2026-03-02" })).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("crosses a leap day", () => {
    expect(daysInRange({ start: "2028-02-27", end: "2028-03-01" })).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("is the single day for a one-day span", () => {
    expect(daysInRange({ start: "2026-03-01", end: "2026-03-01" })).toEqual([
      "2026-03-01",
    ]);
  });

  it("is empty when an end isn't a real day", () => {
    expect(daysInRange({ start: "2026-13-01", end: "2026-13-04" })).toEqual([]);
  });
});

describe("loggedCount", () => {
  it("counts only the days in the span that carry a report", () => {
    const doc = docOf(
      entry("2026-02-28"),
      entry("2026-03-02"),
      entry("2026-03-04"),
    );
    expect(loggedCount(doc, { start: "2026-03-01", end: "2026-03-05" })).toBe(
      2,
    );
  });
});

describe("bulkEntries", () => {
  const span = { start: "2026-03-01", end: "2026-03-05" };

  it("keeps a fertility test already recorded on a day it covers", () => {
    // Same contract as the temperature, and the same reason: a strip is one
    // morning's observation, so a span cannot carry one — and must not erase
    // the ones already there.
    const doc = docOf(
      entry("2026-03-02", { fertilityTest: "positive" }),
      entry("2026-03-04", { fertilityTest: "negative" }),
    );
    const written = bulkEntries(
      doc,
      span,
      { bleeding: true, moodSwings: false, lust: false, sex: false },
      NOW,
    );
    expect(
      Object.fromEntries(written.map((e) => [e.date, e.fertilityTest])),
    ).toEqual({
      "2026-03-01": null,
      "2026-03-02": "positive",
      "2026-03-03": null,
      "2026-03-04": "negative",
      "2026-03-05": null,
    });
  });

  it("writes the ovulatory answers to every day in the span too", () => {
    const written = bulkEntries(
      emptyDoc(),
      span,
      { bleeding: false, moodSwings: false, lust: true, sex: true },
      NOW,
    );
    expect(written.every((e) => e.lust && e.sex)).toBe(true);
  });

  it("writes the two answers to every day in the span", () => {
    const written = bulkEntries(
      emptyDoc(),
      span,
      { bleeding: true, moodSwings: false, lust: false, sex: false },
      NOW,
    );
    expect(written.map((e) => e.date)).toEqual(daysInRange(span));
    expect(written.every((e) => e.bleeding)).toBe(true);
    expect(written.every((e) => !e.moodSwings)).toBe(true);
    expect(written.every((e) => e.updatedAt === NOW)).toBe(true);
  });

  it("keeps a temperature already recorded on a day it covers", () => {
    // The whole reason the control is disabled rather than ignored: a week
    // logged every morning must survive "I bled these five days".
    const doc = docOf(
      entry("2026-03-02", { temperature: 36.42 }),
      entry("2026-03-04", { temperature: 36.71 }),
    );
    const written = bulkEntries(
      doc,
      span,
      { bleeding: true, moodSwings: true, lust: false, sex: false },
      NOW,
    );
    const temperatures = Object.fromEntries(
      written.map((e) => [e.date, e.temperature]),
    );
    expect(temperatures).toEqual({
      "2026-03-01": null,
      "2026-03-02": 36.42,
      "2026-03-03": null,
      "2026-03-04": 36.71,
      "2026-03-05": null,
    });
  });

  it("overwrites the answers on days that already had them", () => {
    const doc = docOf(
      entry("2026-03-03", { bleeding: true, moodSwings: true }),
    );
    const written = bulkEntries(
      doc,
      span,
      { bleeding: false, moodSwings: false, lust: false, sex: false },
      NOW,
    );
    const third = written.find((e) => e.date === "2026-03-03");
    expect(third).toMatchObject({ bleeding: false, moodSwings: false });
  });

  it("writes exactly one entry for a one-day span", () => {
    const written = bulkEntries(
      emptyDoc(),
      { start: "2026-03-01", end: "2026-03-01" },
      { bleeding: true, moodSwings: false, lust: false, sex: false },
      NOW,
    );
    expect(written).toHaveLength(1);
  });
});

describe("MAX_RANGE_DAYS", () => {
  it("is long enough for any real period and short of a whole cycle", () => {
    // The cap is a guard against a mis-tap in a paged calendar, not a limit on
    // anything anyone actually files: a period is under a fortnight.
    expect(MAX_RANGE_DAYS).toBeGreaterThan(14);
    expect(MAX_RANGE_DAYS).toBeLessThanOrEqual(31);
  });
});
