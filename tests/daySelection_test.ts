// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a press on a calendar day resolves to.
//
// The gesture reaches two editors, one of which deletes reports a month at a
// time, so the cases below are the ones where a wrong answer costs data: a span
// picked backwards, a span longer than a bulk save may write, and a day in the
// future — which has no report to open and must never acquire one.

import { describe, expect, it } from "vitest";

import { MAX_RANGE_DAYS } from "../src/app/bulk.ts";
import {
  NO_SELECTION,
  blockedDuring,
  closesRange,
  hold,
  isEditable,
  tap,
  type DaySelection,
} from "../src/app/daySelection.ts";

const TODAY = "2026-03-20";

const anchored = (anchor: string): DaySelection => ({
  kind: "anchored",
  anchor,
});
const arming: DaySelection = { kind: "arming" };

describe("isEditable", () => {
  it("accepts today and the days behind it", () => {
    expect(isEditable(TODAY, TODAY)).toBe(true);
    expect(isEditable("2025-12-31", TODAY)).toBe(true);
  });

  it("refuses tomorrow", () => {
    expect(isEditable("2026-03-21", TODAY)).toBe(false);
  });
});

describe("closesRange", () => {
  it("closes in either direction", () => {
    expect(closesRange("2026-03-10", "2026-03-15", TODAY)).toBe(true);
    expect(closesRange("2026-03-15", "2026-03-10", TODAY)).toBe(true);
  });

  it("closes on the anchor itself — one day is a span of one", () => {
    expect(closesRange("2026-03-10", "2026-03-10", TODAY)).toBe(true);
  });

  it("reaches exactly the longest span a bulk save may write", () => {
    // 2026-02-18 → 2026-03-20 is 30 days apart, i.e. 31 days inclusive.
    expect(MAX_RANGE_DAYS).toBe(31);
    expect(closesRange(TODAY, "2026-02-18", TODAY)).toBe(true);
    expect(closesRange(TODAY, "2026-02-17", TODAY)).toBe(false);
  });

  it("refuses a day in the future, however close", () => {
    expect(closesRange("2026-03-18", "2026-03-21", TODAY)).toBe(false);
  });
});

describe("tap", () => {
  it("opens a day's report when nothing is being selected", () => {
    expect(tap(NO_SELECTION, "2026-03-02", TODAY)).toEqual({
      do: "edit",
      day: "2026-03-02",
    });
  });

  it("does nothing on a future day", () => {
    expect(tap(NO_SELECTION, "2026-04-02", TODAY)).toEqual({ do: "nothing" });
    expect(tap(arming, "2026-04-02", TODAY)).toEqual({ do: "nothing" });
  });

  it("drops an anchor while arming rather than opening the day", () => {
    expect(tap(arming, "2026-03-02", TODAY)).toEqual({
      do: "anchor",
      day: "2026-03-02",
    });
  });

  it("closes a span forwards", () => {
    expect(tap(anchored("2026-03-02"), "2026-03-06", TODAY)).toEqual({
      do: "range",
      range: { start: "2026-03-02", end: "2026-03-06" },
    });
  });

  it("closes the same span picked backwards", () => {
    expect(tap(anchored("2026-03-06"), "2026-03-02", TODAY)).toEqual({
      do: "range",
      range: { start: "2026-03-02", end: "2026-03-06" },
    });
  });

  it("closes on the anchor as a one-day span", () => {
    expect(tap(anchored("2026-03-06"), "2026-03-06", TODAY)).toEqual({
      do: "range",
      range: { start: "2026-03-06", end: "2026-03-06" },
    });
  });

  it("ignores a second tap past the span cap and keeps waiting", () => {
    expect(tap(anchored(TODAY), "2026-02-17", TODAY)).toEqual({
      do: "nothing",
    });
  });
});

describe("hold", () => {
  it("anchors wherever it lands", () => {
    expect(hold("2026-03-02", TODAY)).toEqual({
      do: "anchor",
      day: "2026-03-02",
    });
  });

  it("re-anchors an existing selection rather than closing it", () => {
    // The state is not a parameter, which is the point: a hold always starts a
    // span. Closing one is the next tap's job.
    expect(hold("2026-03-09", TODAY)).toEqual({
      do: "anchor",
      day: "2026-03-09",
    });
  });

  it("does nothing on a day that has not happened", () => {
    expect(hold("2026-03-21", TODAY)).toEqual({ do: "nothing" });
  });
});

describe("blockedDuring", () => {
  it("greys out nothing while the calendar is only being read", () => {
    expect(blockedDuring(NO_SELECTION, TODAY)).toBeUndefined();
  });

  it("greys out the future while a first day is wanted", () => {
    const blocked = blockedDuring(arming, TODAY);
    expect(blocked?.("2026-03-20")).toBe(false);
    expect(blocked?.("2026-03-21")).toBe(true);
  });

  it("greys out everything the anchored span cannot reach", () => {
    const blocked = blockedDuring(anchored("2026-03-10"), TODAY);
    expect(blocked?.("2026-03-10")).toBe(false);
    expect(blocked?.("2026-02-20")).toBe(false);
    expect(blocked?.("2026-02-07")).toBe(true);
    expect(blocked?.("2026-03-21")).toBe(true);
  });
});
