// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { probabilityPercent } from "../src/app/format.ts";

// The forecast is arithmetic over logged days, and the copy around it promises
// it is never more than that. `probabilityPercent` is where that promise is
// kept in the digits themselves: a quoted figure is always one the arithmetic
// can back, it never reads as a certainty, and it never claims a resolution a
// fit over a few dozen cycles does not have.

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
