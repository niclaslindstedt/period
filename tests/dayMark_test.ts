// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where a day sits in the run of days it shares a tone with — the thing that
// decides whether its mark gets a rounded cap or runs on into the next cell.
//
// The rendering itself is not tested (no DOM in this suite), but the geometry
// is the part that can be wrong in a way you would have to squint at a phone to
// see: one missing cap and a five-day period reads as two.

import { describe, expect, it } from "vitest";

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

import { markFor, toneFor, type DayTone } from "../src/app/DayMark.tsx";
import type { DayStatus } from "../src/app/dayStatus.ts";

/** A `toneAt` over a fixed table; any day not in it is empty calendar. */
function tones(table: Record<string, DayTone>) {
  return (day: DayKey): DayTone => table[day] ?? "none";
}

/** The fields of a status that `toneFor` actually reads. */
function status(
  fields: Partial<DayStatus> & Pick<DayStatus, "kind">,
): DayStatus {
  return {
    day: "2025-03-01",
    probability: 1,
    observed: false,
    reported: false,
    fertileProbability: 0,
    periodProbability: 0,
    expectedPeriod: false,
    expectedFertile: false,
    observedFertile: false,
    ...fields,
  };
}

describe("toneFor", () => {
  it("paints a reported bleeding day as a period", () => {
    expect(toneFor(status({ kind: "period", reported: true }))).toBe("period");
  });

  it("paints a predicted period as its own tone", () => {
    expect(toneFor(status({ kind: "predictedPeriod" }))).toBe("predicted");
  });

  it("keeps a fertile day fertile even when it carries a report", () => {
    expect(
      toneFor(
        status({ kind: "fertile", observedFertile: true, reported: true }),
      ),
    ).toBe("fertile");
    expect(toneFor(status({ kind: "fertile", reported: true }))).toBe(
      "predictedFertile",
    );
  });

  it("paints a projected period in the predicted outline", () => {
    // Cycles far enough ahead that no single day clears a half still have a
    // span the model expects them in, and the outline is what says "expected".
    expect(toneFor(status({ kind: "notFertile", expectedPeriod: true }))).toBe(
      "predicted",
    );
    // A reported bleeding day is still what actually happened.
    expect(toneFor(status({ kind: "period", expectedFertile: true }))).toBe(
      "period",
    );
  });

  it("marks a quiet day only when something was logged on it", () => {
    expect(toneFor(status({ kind: "notFertile", reported: true }))).toBe(
      "reported",
    );
    expect(toneFor(status({ kind: "notFertile" }))).toBe("none");
  });
});

describe("markFor", () => {
  const period = tones({
    "2025-03-03": "period",
    "2025-03-04": "period",
    "2025-03-05": "period",
  });

  it("caps the first and last day of a run and nothing in between", () => {
    expect(markFor("2025-03-03", period)).toEqual({
      tone: "period",
      first: true,
      last: false,
    });
    expect(markFor("2025-03-04", period)).toEqual({
      tone: "period",
      first: false,
      last: false,
    });
    expect(markFor("2025-03-05", period)).toEqual({
      tone: "period",
      first: false,
      last: true,
    });
  });

  it("caps a one-day period at both ends, which draws it as a dot", () => {
    const oneDay = tones({ "2025-03-03": "period" });
    expect(markFor("2025-03-03", oneDay)).toEqual({
      tone: "period",
      first: true,
      last: true,
    });
  });

  it("keeps two runs of the same tone apart", () => {
    const twoPeriods = tones({
      "2025-03-03": "period",
      "2025-03-04": "period",
      "2025-03-31": "period",
      "2025-04-01": "period",
    });
    expect(markFor("2025-03-04", twoPeriods).last).toBe(true);
    expect(markFor("2025-03-31", twoPeriods).first).toBe(true);
  });

  it("runs a period across a month boundary uncapped", () => {
    const across = tones({
      "2025-03-30": "period",
      "2025-03-31": "period",
      "2025-04-01": "period",
    });
    expect(markFor("2025-03-31", across)).toEqual({
      tone: "period",
      first: false,
      last: false,
    });
    expect(markFor("2025-04-01", across).first).toBe(false);
  });

  it("does not join a reported day to the period beside it", () => {
    const mixed = tones({
      "2025-03-03": "period",
      "2025-03-04": "reported",
      "2025-03-05": "reported",
    });
    expect(markFor("2025-03-03", mixed).last).toBe(true);
    // Two reports on consecutive days are still two reports, not a stretch.
    expect(markFor("2025-03-04", mixed)).toEqual({
      tone: "reported",
      first: true,
      last: true,
    });
    expect(markFor("2025-03-05", mixed)).toEqual({
      tone: "reported",
      first: true,
      last: true,
    });
  });

  it("runs a period straight into the predicted rest of itself", () => {
    // The days already bled through and the days still to come are one period
    // seen from either side of today, so the stroke changes paint mid-run and
    // is capped only where the period is expected to actually stop.
    const handover = tones({
      "2025-03-03": "period",
      "2025-03-04": "period",
      "2025-03-05": "predicted",
      "2025-03-06": "predicted",
    });
    expect(markFor("2025-03-04", handover)).toEqual({
      tone: "period",
      first: false,
      last: false,
    });
    expect(markFor("2025-03-05", handover)).toEqual({
      tone: "predicted",
      first: false,
      last: false,
    });
    expect(markFor("2025-03-06", handover)).toEqual({
      tone: "predicted",
      first: false,
      last: true,
    });
    expect(markFor("2025-03-03", handover).first).toBe(true);
  });

  it("does not run a period into the fertile window beside it", () => {
    const neighbours = tones({
      "2025-03-12": "fertile",
      "2025-03-13": "period",
    });
    expect(markFor("2025-03-12", neighbours).last).toBe(true);
    expect(markFor("2025-03-13", neighbours).first).toBe(true);
  });

  it("draws a fertile window as one stroke", () => {
    const fertile = tones({
      "2025-03-10": "fertile",
      "2025-03-11": "fertile",
      "2025-03-12": "fertile",
      "2025-03-13": "fertile",
    });
    expect(markFor("2025-03-10", fertile).first).toBe(true);
    expect(markFor("2025-03-11", fertile).first).toBe(false);
    expect(markFor("2025-03-13", fertile).last).toBe(true);
  });

  it("leaves an empty day empty", () => {
    expect(markFor("2025-03-20", period).tone).toBe("none");
  });
});
