// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  DISPLAY_DECIMALS,
  formatTemperature,
  formatTemperatureDelta,
  inputBounds,
  normalizeStoredTemperature,
  parseTemperature,
  temperatureInputValue,
  toCelsius,
  toFahrenheit,
} from "../src/app/temperature.ts";

// The field exists to carry two decimal places from a thermometer to the
// forecast intact. Every test here is about that: the round trip, the guard
// against a mis-keyed decimal point, and the one conversion (a *difference*
// in degrees) that is easy to get subtly wrong.

describe("conversion", () => {
  it("matches the fixed points", () => {
    expect(toFahrenheit(0)).toBeCloseTo(32, 10);
    expect(toFahrenheit(100)).toBeCloseTo(212, 10);
    expect(toFahrenheit(36.5)).toBeCloseTo(97.7, 10);
    expect(toCelsius(97.7)).toBeCloseTo(36.5, 10);
    expect(toCelsius(-40)).toBeCloseTo(-40, 10);
  });
});

describe("parseTemperature", () => {
  it("stores Celsius as typed", () => {
    expect(parseTemperature("36.52", "c")).toBe(36.52);
    expect(parseTemperature("36.5", "c")).toBe(36.5);
  });

  it("converts a Fahrenheit reading to Celsius", () => {
    expect(parseTemperature("97.70", "f")).toBeCloseTo(36.5, 3);
  });

  it("accepts a comma as the decimal separator", () => {
    // Most of Europe types it this way, and a phone keypad often offers it.
    expect(parseTemperature("36,52", "c")).toBe(36.52);
  });

  it("reads nothing as nothing", () => {
    expect(parseTemperature("", "c")).toBeNull();
    expect(parseTemperature("   ", "c")).toBeNull();
    expect(parseTemperature("warm", "c")).toBeNull();
  });

  it("rejects a mis-keyed decimal point rather than storing it", () => {
    // The classic: the point missed on a phone keypad.
    expect(parseTemperature("365", "c")).toBeNull();
    expect(parseTemperature("3.65", "c")).toBeNull();
    expect(parseTemperature("977", "f")).toBeNull();
  });
});

describe("the two-decimal round trip", () => {
  it("survives in Celsius", () => {
    for (const typed of ["35.10", "36.50", "36.52", "37.05", "38.99"]) {
      const stored = parseTemperature(typed, "c");
      expect(temperatureInputValue(stored, "c")).toBe(typed);
    }
  });

  it("survives in Fahrenheit", () => {
    // The reason storage keeps a third decimal: one Fahrenheit hundredth is
    // 0.0056 °C, so rounding the stored Celsius to two places would lose it
    // and read back a different reading than the one that was typed.
    for (const typed of [
      "96.80",
      "97.70",
      "97.71",
      "97.72",
      "98.61",
      "99.99",
    ]) {
      const stored = parseTemperature(typed, "f");
      expect(temperatureInputValue(stored, "f")).toBe(typed);
    }
  });

  it("shows an absent reading as an empty field", () => {
    expect(temperatureInputValue(null, "c")).toBe("");
    expect(temperatureInputValue(null, "f")).toBe("");
  });
});

describe("formatting", () => {
  it("always shows two decimals with the unit", () => {
    expect(formatTemperature(36.5, "c")).toBe("36.50 °C");
    expect(formatTemperature(36.5, "f")).toBe("97.70 °F");
    expect(DISPLAY_DECIMALS).toBe(2);
  });

  it("converts a difference by the ratio alone", () => {
    // A third of a degree Celsius is 0.6 °F, not 92 °F — running a delta
    // through the +32 offset is the bug this test exists to prevent.
    expect(formatTemperatureDelta(0.32, "c")).toBe("+0.32 °C");
    expect(formatTemperatureDelta(0.32, "f")).toBe("+0.58 °F");
    expect(formatTemperatureDelta(-0.2, "c")).toBe("−0.20 °C");
    expect(formatTemperatureDelta(0, "c")).toBe("0.00 °C");
  });
});

describe("inputBounds", () => {
  it("offers a hundredth step in either unit", () => {
    expect(inputBounds("c").step).toBe(0.01);
    expect(inputBounds("f").step).toBe(0.01);
  });

  it("converts the plausible range", () => {
    expect(inputBounds("c")).toMatchObject({ min: 30, max: 45 });
    expect(inputBounds("f").min).toBeCloseTo(86, 2);
    expect(inputBounds("f").max).toBeCloseTo(113, 2);
  });
});

describe("normalizeStoredTemperature", () => {
  it("passes a plausible reading through", () => {
    expect(normalizeStoredTemperature(36.52)).toBe(36.52);
  });

  it("drops anything that is not a plausible reading", () => {
    expect(normalizeStoredTemperature(null)).toBeNull();
    expect(normalizeStoredTemperature("36.5")).toBeNull();
    expect(normalizeStoredTemperature(NaN)).toBeNull();
    expect(normalizeStoredTemperature(365)).toBeNull();
    expect(normalizeStoredTemperature(0)).toBeNull();
  });

  it("trims a value carrying more precision than was ever entered", () => {
    expect(normalizeStoredTemperature(36.5055555)).toBe(36.506);
  });
});
