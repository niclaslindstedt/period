// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  formatDay,
  formatFullDay,
  formatMonth,
  probabilityPercent,
} from "../src/app/format.ts";

// The forecast is arithmetic over logged days, and the copy around it promises
// it is never more than that. `probabilityPercent` is where that promise is
// kept in the digits themselves: a quoted figure is always one the arithmetic
// can back, it never reads as a certainty, and it never claims a resolution a
// fit over a few dozen cycles does not have.

// The other promise this module keeps is smaller but just as visible: the app
// names a date exactly one way. The screen that made the case for it showed
// "September 8" and "Sep 5 — Sep 12" one line apart, so these pin the
// abbreviation rather than the wording — the month name itself is the
// runtime's to localise.

/** The month of a day, as this environment's locale spells it long and short.
 *  Derived rather than hard-coded so the assertions hold outside en-US. */
function monthNames(day: string): { long: string; short: string } {
  const [year, month] = day.split("-").map(Number);
  const date = new Date(year!, month! - 1, 1);
  return {
    long: new Intl.DateTimeFormat(undefined, { month: "long" }).format(date),
    short: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
  };
}

describe("naming a date", () => {
  // September, because its long and short forms differ in every locale worth
  // testing — a month like May would pass either way and prove nothing.
  const day = "2026-09-08";

  it("abbreviates the month", () => {
    const { long, short } = monthNames(day);
    expect(formatDay(day)).toContain(short);
    expect(formatDay(day)).not.toContain(long);
  });

  it("spells the month the same way in the long form", () => {
    // The report heading adds a weekday and a year; it does not change
    // vocabulary while doing it.
    const { long, short } = monthNames(day);
    expect(formatFullDay(day)).toContain(short);
    expect(formatFullDay(day)).not.toContain(long);
    expect(formatFullDay(day)).toContain("2026");
  });

  it("keeps the long name for a month grid's own heading", () => {
    // The one string that names a month rather than a date.
    expect(formatMonth(2026, 9)).toContain(monthNames(day).long);
  });

  it("passes a day it cannot parse straight through", () => {
    expect(formatDay("not-a-day")).toBe("not-a-day");
    expect(formatFullDay("not-a-day")).toBe("not-a-day");
  });
});

describe("probabilityPercent", () => {
  it("never quotes a certainty", () => {
    expect(probabilityPercent(1)).toBe("99%");
    expect(probabilityPercent(0.9999)).toBe("99%");
    // The case that started this: 99.6% used to round up to a flat "100%".
    expect(probabilityPercent(0.996)).toBe("99%");
    // Anything past 1 is a bug upstream, but it must still not print "100%".
    expect(probabilityPercent(1.4)).toBe("99%");
  });

  it("floors rather than rounds", () => {
    // A quoted percentage is a claim of "at least this much".
    expect(probabilityPercent(0.639)).toBe("63%");
    expect(probabilityPercent(0.63)).toBe("63%");
    expect(probabilityPercent(0.987)).toBe("98%");
    expect(probabilityPercent(0.505)).toBe("50%");
    // Under a percent floors to zero, which is what a floor says: under one.
    expect(probabilityPercent(0.004)).toBe("0%");
    expect(probabilityPercent(0)).toBe("0%");
  });

  it("never shows a decimal", () => {
    // A tenth of a point would move if one old report were corrected, so
    // printing it would dress noise up as precision.
    for (const p of [0.0523, 0.099, 0.1, 0.3336, 0.9928, 0.991]) {
      expect(probabilityPercent(p)).toMatch(/^\d{1,2}%$/);
    }
  });

  it("handles a negative the way it handles zero", () => {
    // Not reachable from the model, but a formatter must not print "-20%".
    expect(probabilityPercent(-0.2)).toBe("0%");
  });
});
