// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Waking temperature: the unit conversion, the parsing, and the formatting.
//
// The document stores Celsius and only Celsius (see `DayEntry.temperature`).
// A phone set to Fahrenheit and a laptop set to Celsius sync the same file, so
// the unit has to be a *display* choice — storing the number as typed would
// make the same document mean two different things depending on which device
// wrote the day.
//
// Two decimal places is the whole point of the field. Waking temperature moves
// by roughly 0.3 °C across a cycle, so a reading rounded to 0.1 °C throws away
// two thirds of the signal the forecast is trying to read. Every function here
// is built around keeping that resolution intact in both directions.
//
// Pure and clock-free, and unit-tested in `tests/temperature_test.ts`.

/** Which unit the user reads and types. Storage is Celsius regardless. */
export type TemperatureUnit = "c" | "f";

/**
 * Plausible waking temperatures, in Celsius.
 *
 * Wide on purpose: this is a guard against a typo or a corrupted sync, not a
 * medical judgement about whose fever counts. A reading outside it is far more
 * likely to be a mis-keyed decimal point (365 rather than 36.5) than a real
 * measurement, and letting one through would drag the model's centre for weeks.
 */
export const MIN_CELSIUS = 30;
export const MAX_CELSIUS = 45;

/**
 * Decimal places kept in storage.
 *
 * Three, not two, and only because the user may be reading Fahrenheit. One
 * Fahrenheit hundredth is 0.0056 °C, so a Celsius value rounded to two places
 * cannot represent every two-place Fahrenheit reading: type 97.71 °F, store
 * 36.51 °C, read back 97.72 °F. The third decimal is what makes the field
 * round-trip in the unit it was typed in. A Celsius user's value still lands on
 * two places, because that is all they entered.
 */
const STORED_DECIMALS = 3;

/** Displayed decimal places, in either unit. */
export const DISPLAY_DECIMALS = 2;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Celsius → Fahrenheit. */
export function toFahrenheit(celsius: number): number {
  return celsius * (9 / 5) + 32;
}

/** Fahrenheit → Celsius. */
export function toCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * (5 / 9);
}

/** A stored Celsius value in the unit the user reads, unrounded. */
export function inUnit(celsius: number, unit: TemperatureUnit): number {
  return unit === "f" ? toFahrenheit(celsius) : celsius;
}

/**
 * Parse what the user typed into a stored Celsius value.
 *
 * Returns null for anything that is not a plausible reading — an empty box, a
 * stray letter, or a decimal point in the wrong place. Null is also what an
 * intentionally cleared field produces, and the two are the same claim: no
 * temperature was recorded for the day.
 */
export function parseTemperature(
  input: string,
  unit: TemperatureUnit,
): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const celsius = unit === "f" ? toCelsius(value) : value;
  if (celsius < MIN_CELSIUS || celsius > MAX_CELSIUS) return null;
  return roundTo(celsius, STORED_DECIMALS);
}

/** The value for a number input, in the display unit, at two decimals. Empty
 *  string for "nothing recorded", which is what an empty input means. */
export function temperatureInputValue(
  celsius: number | null,
  unit: TemperatureUnit,
): string {
  if (celsius === null) return "";
  return inUnit(celsius, unit).toFixed(DISPLAY_DECIMALS);
}

/** "36.50 °C" / "97.70 °F" — the read-only form. */
export function formatTemperature(
  celsius: number,
  unit: TemperatureUnit,
): string {
  const symbol = unit === "f" ? "°F" : "°C";
  return `${inUnit(celsius, unit).toFixed(DISPLAY_DECIMALS)} ${symbol}`;
}

/** A difference in temperature, in the display unit and signed — "+0.32 °C".
 *  A *span* converts by the ratio alone; running it through the offset would
 *  turn a third of a degree into ninety-seven of them. */
export function formatTemperatureDelta(
  celsiusDelta: number,
  unit: TemperatureUnit,
): string {
  const scaled = unit === "f" ? celsiusDelta * (9 / 5) : celsiusDelta;
  const symbol = unit === "f" ? "°F" : "°C";
  const sign = scaled > 0 ? "+" : scaled < 0 ? "−" : "";
  return `${sign}${Math.abs(scaled).toFixed(DISPLAY_DECIMALS)} ${symbol}`;
}

/** Step and bounds for the number input, in the display unit. Fahrenheit gets
 *  the same two-decimal step, which is finer than its Celsius equivalent — the
 *  point is that the box accepts what a thermometer shows. */
export function inputBounds(unit: TemperatureUnit): {
  min: number;
  max: number;
  step: number;
} {
  return unit === "f"
    ? {
        min: roundTo(toFahrenheit(MIN_CELSIUS), 2),
        max: roundTo(toFahrenheit(MAX_CELSIUS), 2),
        step: 0.01,
      }
    : { min: MIN_CELSIUS, max: MAX_CELSIUS, step: 0.01 };
}

/** Coerce an arbitrary stored value into a temperature, or null. The only
 *  module that trusts stored bytes is `migrations.ts`, which calls this. */
export function normalizeStoredTemperature(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < MIN_CELSIUS || value > MAX_CELSIUS) return null;
  return roundTo(value, STORED_DECIMALS);
}
