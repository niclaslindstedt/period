// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { niceTicks } from "../src/app/chartAxis.ts";

// The y axis on the History charts. A gridline is a claim about a height, so
// the numbers on it are pinned here against the three domains the real charts
// hand it — cycle lengths from zero, a temperature series hugging its own
// range, and a share out of a hundred.

const MAX = 5;

describe("niceTicks", () => {
  it("steps a zero-based count in tens", () => {
    // The cycle-length chart: lengths around 28, plotted from zero with the
    // chart's 15% headroom.
    expect(niceTicks(0, 33 * 1.15, MAX)).toEqual({
      values: [0, 10, 20, 30],
      decimals: 0,
    });
  });

  it("steps a Celsius window in halves, and prints one decimal", () => {
    // What the waking-temperature chart passes for readings between 36.05 and
    // 36.72: the data-hugging domain plus its margin.
    const ticks = niceTicks(35.316, 37.454, MAX);
    expect(ticks).toEqual({ values: [35.5, 36, 36.5, 37], decimals: 1 });
    // A tick landing on a fractional step is the classic place for binary
    // floating point to leak into the label.
    expect(ticks.values.map((v) => v.toFixed(ticks.decimals))).toEqual([
      "35.5",
      "36.0",
      "36.5",
      "37.0",
    ]);
  });

  it("widens the step rather than crowding the plot", () => {
    // The same window in Fahrenheit spans about five degrees: a step of one
    // would rule six lines, which is over the cap, so it takes twos.
    expect(niceTicks(94.938, 100.062, MAX)).toEqual({
      values: [96, 98, 100],
      decimals: 0,
    });
  });

  it("never returns more lines than asked for", () => {
    for (const [lo, hi] of [
      [0, 1],
      [0, 51.75],
      [0, 3.45],
      [-4, 4],
      [98.1, 1044.7],
      [0.0031, 0.0092],
    ]) {
      const { values } = niceTicks(lo!, hi!, MAX);
      expect(values.length).toBeLessThanOrEqual(MAX);
      // And every one of them is a height the chart actually draws.
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(lo!);
        expect(v).toBeLessThanOrEqual(hi!);
      }
    }
  });

  it("labels no scale at all when there is none", () => {
    // Every reading identical, or no readings: an axis of one number repeated
    // says nothing, so the plot goes bare instead.
    expect(niceTicks(2, 2, MAX)).toEqual({ values: [], decimals: 0 });
    expect(niceTicks(5, 1, MAX)).toEqual({ values: [], decimals: 0 });
    expect(niceTicks(0, Number.NaN, MAX)).toEqual({ values: [], decimals: 0 });
  });
});
