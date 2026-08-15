// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  BAND_MAX_CELSIUS,
  BAND_MIN_CELSIUS,
  DISPLAY_DECIMALS,
  FEVER_CELSIUS,
  SLIDER_MAX_INDEX,
  formatTemperature,
  formatTemperatureDelta,
  isFever,
  isUnusuallyLow,
  maskCelsius,
  maskDigits,
  maskOf,
  maskText,
  normalizeStoredTemperature,
  parseTemperature,
  sliderCelsiusAt,
  sliderIndexOf,
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
    for (const typed of ["3510", "3650", "3652", "3705", "3899"]) {
      const stored = maskCelsius(typed, "c");
      expect(maskOf(stored, "c")).toBe(typed);
    }
  });

  it("survives in Fahrenheit", () => {
    // The reason storage keeps a third decimal: one Fahrenheit hundredth is
    // 0.0056 °C, so rounding the stored Celsius to two places would lose it
    // and read back a different reading than the one that was typed.
    for (const typed of ["9680", "9770", "9771", "9772", "9861", "9999"]) {
      const stored = maskCelsius(typed, "f");
      expect(maskOf(stored, "f")).toBe(typed);
    }
  });

  it("shows an absent reading as an empty field", () => {
    expect(maskOf(null, "c")).toBe("");
    expect(maskOf(null, "f")).toBe("");
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

describe("the digit mask", () => {
  it("fills in the leading digit and the decimal point", () => {
    expect(maskCelsius("650", "c")).toBe(36.5);
    expect(maskCelsius("705", "c")).toBe(37.05);
    expect(maskCelsius("770", "f")).toBeCloseTo(36.5, 3);
    expect(maskDigits("650", "c")).toBe("3650");
    expect(maskDigits("770", "f")).toBe("9770");
  });

  it("takes the leading digit from anyone who types it anyway", () => {
    // The first digit is matched, not counted: a 3 is the one already on
    // screen, and anything else is the digit after it. Both spellings of
    // 36.50 have to mean 36.50 — reading 3-6-5 positionally would make it
    // 33.65, a plausible number and silently the wrong one.
    expect(maskCelsius("3650", "c")).toBe(36.5);
    expect(maskCelsius("365", "c")).toBe(36.5);
    expect(maskDigits("36.50", "c")).toBe("3650");
    expect(maskCelsius("9770", "f")).toBeCloseTo(36.5, 3);
    expect(maskDigits("97.70", "f")).toBe("9770");
  });

  it("still reaches the bottom of the storable range", () => {
    // 33.65 is spelled with both threes — the first is the one the box fills
    // in, the second is a digit that was chosen.
    expect(maskCelsius("3365", "c")).toBe(33.65);
  });

  it("reads a half-typed reading as far as it goes", () => {
    // Missing trailing digits are zeros: 36 is 36.00, not "not yet a number".
    expect(maskCelsius("6", "c")).toBe(36);
    expect(maskCelsius("65", "c")).toBe(36.5);
    // The leading digit alone is not a reading — nothing has been chosen yet.
    expect(maskCelsius("3", "c")).toBeNull();
    expect(maskCelsius("", "c")).toBeNull();
  });

  it("ignores a digit it has nowhere to put", () => {
    expect(maskDigits("36507", "c")).toBe("3650");
  });

  it("shows the digits with the point where it belongs", () => {
    expect(maskText("")).toBe("");
    expect(maskText("3")).toBe("3");
    expect(maskText("36")).toBe("36");
    expect(maskText("365")).toBe("36.5");
    expect(maskText("3650")).toBe("36.50");
  });

  it("round-trips a stored reading back into the box", () => {
    expect(maskOf(36.5, "c")).toBe("3650");
    expect(maskOf(36.5, "f")).toBe("9770");
  });

  it("cannot hold a Fahrenheit fever, and says so with an empty field", () => {
    // 38 °C is 100.4 °F — the leading digit stops being a 9, so the control
    // shows it as a fever rather than as a number with a digit missing.
    expect(maskOf(FEVER_CELSIUS, "f")).toBe("");
    expect(maskOf(FEVER_CELSIUS, "c")).toBe("3800");
  });

  it("queries a reading nobody wakes up with, without refusing it", () => {
    expect(isUnusuallyLow(34.9)).toBe(true);
    expect(isUnusuallyLow(BAND_MIN_CELSIUS)).toBe(false);
    expect(isUnusuallyLow(36.5)).toBe(false);
    // Still stored — the nudge is in the control, not in the document.
    expect(maskCelsius("3490", "c")).toBe(34.9);
  });
});

describe("the slider", () => {
  it("puts nothing recorded at the bottom stop", () => {
    expect(sliderIndexOf(null)).toBe(0);
    expect(sliderCelsiusAt(0)).toBeNull();
  });

  it("walks the band in twentieths of a degree", () => {
    expect(sliderCelsiusAt(1)).toBe(BAND_MIN_CELSIUS);
    expect(sliderCelsiusAt(8)).toBe(35.85);
    expect(sliderCelsiusAt(SLIDER_MAX_INDEX - 1)).toBe(BAND_MAX_CELSIUS);
  });

  it("records a fever at the top stop", () => {
    expect(sliderCelsiusAt(SLIDER_MAX_INDEX)).toBe(FEVER_CELSIUS);
    expect(isFever(FEVER_CELSIUS)).toBe(true);
    expect(sliderIndexOf(FEVER_CELSIUS)).toBe(SLIDER_MAX_INDEX);
    // The top of the band is not a fever — it is the last reading the
    // forecast can still read.
    expect(isFever(BAND_MAX_CELSIUS)).toBe(false);
    expect(isFever(37.51)).toBe(true);
  });

  it("round-trips every stop", () => {
    for (let i = 0; i <= SLIDER_MAX_INDEX; i++) {
      expect(sliderIndexOf(sliderCelsiusAt(i))).toBe(i);
    }
  });

  it("pins a reading below the band to the bottom of it", () => {
    // Storable, so the box still shows 34.00 — only the thumb rounds.
    expect(sliderIndexOf(34)).toBe(1);
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
