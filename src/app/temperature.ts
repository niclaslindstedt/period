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

// --- The control on the Report screen ---------------------------------------
//
// Two ways into the same number, because they are good at different things: a
// slider you can move with the thumb that is already on the screen, and a box
// for the mornings you want the exact reading in. Neither is a mode — they
// write the same field and each shows what the other did.

/**
 * The band the slider spans, in Celsius.
 *
 * Narrower than {@link MIN_CELSIUS}/{@link MAX_CELSIUS} on purpose: those
 * bound what the document will *store* (a guard against a mis-keyed decimal
 * point), while these bound what a waking temperature actually does. The whole
 * cyclic signal is a step of about 0.3 °C somewhere between 36 and 37.3, and a
 * slider given fifteen degrees to cover would bury that step under a
 * fingertip.
 */
export const BAND_MIN_CELSIUS = 35.5;
export const BAND_MAX_CELSIUS = 37.5;

/** The slider's resolution inside the band — coarser than the two decimals the
 *  field stores, because a thumb cannot place a hundredth of a degree. The box
 *  beside it is how an exact 36.52 gets in. */
export const BAND_STEP_CELSIUS = 0.05;

/**
 * What the slider's top stop records: a fever.
 *
 * A febrile morning is a real measurement and worth keeping — it is just not a
 * *cycle* measurement, and it cannot be quietly averaged in with ones that
 * are. The post-ovulatory rise the model reads is a third of a degree; an
 * illness is several times that, so one fever left in the evidence would drag
 * a whole cycle's estimate after it. The stop stores the clinical threshold,
 * and `forecastModel.ts` leaves everything above the band out of the
 * temperature channel (see {@link isFever}).
 */
export const FEVER_CELSIUS = 38;

/** Whether a reading is too high to say anything about a cycle. */
export function isFever(celsius: number): boolean {
  return celsius > BAND_MAX_CELSIUS;
}

/**
 * Whether a reading should be read back as the word "Fever" rather than as a
 * number.
 *
 * The fever stop is a state the user chose, not a temperature they measured —
 * it stores {@link FEVER_CELSIUS} because the document has nowhere else to put
 * "febrile", and showing that back as "38.00 °C" would claim a reading nobody
 * took. So at the clinical threshold and above, the control says the word.
 *
 * The threshold rather than {@link isFever}'s band edge, because 37.60 *is* a
 * number someone read off a thermometer: it is left out of the forecast (the
 * line under the control says so) but it is still their measurement, and
 * replacing it with a word would be the mirror of the same mistake.
 */
export function readsAsFever(celsius: number): boolean {
  return celsius >= FEVER_CELSIUS;
}

/** Stops on the slider: 0 records nothing, 1…`BAND_STOPS` walk the band, and
 *  {@link SLIDER_MAX_INDEX} is the fever stop past the end.
 *
 *  Index space rather than degrees because a range input steps in whole
 *  numbers reliably and in hundredths of a degree only approximately — and
 *  because "nothing recorded" is a position on this control, not a
 *  temperature. Skipping the field is the common case, so it has to be
 *  reachable by dragging back rather than only by emptying the box. */
const BAND_STOPS =
  Math.round((BAND_MAX_CELSIUS - BAND_MIN_CELSIUS) / BAND_STEP_CELSIUS) + 1;
export const SLIDER_MAX_INDEX = BAND_STOPS + 1;

/** Where a reading sits on the slider. Anything below the band pins to its
 *  bottom stop — the box still shows the reading itself, so the thumb is the
 *  only thing that rounds. */
export function sliderIndexOf(celsius: number | null): number {
  if (celsius === null) return 0;
  if (isFever(celsius)) return SLIDER_MAX_INDEX;
  const step = Math.round((celsius - BAND_MIN_CELSIUS) / BAND_STEP_CELSIUS);
  return Math.min(BAND_STOPS, Math.max(1, step + 1));
}

/** The reading a slider stop records, or null for "nothing recorded". */
export function sliderCelsiusAt(index: number): number | null {
  if (index <= 0) return null;
  if (index >= SLIDER_MAX_INDEX) return FEVER_CELSIUS;
  return roundTo(BAND_MIN_CELSIUS + (index - 1) * BAND_STEP_CELSIUS, 2);
}

/**
 * The digits the box actually asks for.
 *
 * A waking temperature is 3x.xx °C or 9x.xx °F. The leading digit never
 * carries information and the decimal point never moves, so the box fills both
 * in: type 6, 5, 0 and it reads back 36.50, which is three keystrokes instead
 * of five and no hunting for a decimal point on a phone keypad.
 *
 * Typing the leading digit anyway has to work, because half the people who
 * pick the app up will. So the first digit is *matched* rather than counted —
 * a leading 3 is understood as the one already on screen, and anything else is
 * understood as the digit after it. Both routes converge on the same four
 * digits, and the field shows the whole number the whole time, so there is
 * never a moment where what is displayed is not what will be stored.
 *
 * The mask therefore reaches 30.00–39.99 °C / 90.00–99.99 °F. Everything the
 * band cares about is inside that, and above it the slider's fever stop
 * records a fever without anyone typing a digit.
 */
const MASK_DIGITS = 4;

/** The digit the box fills in for the user. */
export function maskPrefix(unit: TemperatureUnit): string {
  return unit === "f" ? "9" : "3";
}

/**
 * The digits of a reading, as the box holds them: the leading digit first,
 * then up to three that were actually chosen.
 *
 * Everything that is not a digit is dropped, so a stray separator from a
 * keypad — or a pasted "36.50" — lands in the right slots either way.
 */
export function maskDigits(input: string, unit: TemperatureUnit): string {
  const typed = input.replace(/\D/g, "");
  if (typed === "") return "";
  const prefix = maskPrefix(unit);
  const full = typed[0] === prefix ? typed : prefix + typed;
  return full.slice(0, MASK_DIGITS);
}

/** The digits with the decimal point where it belongs: "36.50". A half-typed
 *  reading renders as far as it goes, so the point appears under the finger at
 *  the moment it becomes true. */
export function maskText(digits: string): string {
  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}.${digits.slice(2)}`;
}

/** What the digits mean, in stored Celsius. Missing trailing digits read as
 *  zeros — 36 is 36.00, complete the moment it is unambiguous — while the
 *  leading digit on its own is not a reading yet. */
export function maskCelsius(
  digits: string,
  unit: TemperatureUnit,
): number | null {
  const d = maskDigits(digits, unit);
  if (d.length < 2) return null;
  return parseTemperature(
    `${d.slice(0, 2)}.${d.slice(2).padEnd(2, "0")}`,
    unit,
  );
}

/** A stored reading as the box's digits, or "" when the box should show a word
 *  instead of a number: nothing recorded, or a fever (see
 *  {@link readsAsFever}). "" is also what the mask returns when it cannot hold
 *  the reading at all — which, now that fevers are spelled out in both units,
 *  is only reachable from a hand-edited document. */
export function maskOf(celsius: number | null, unit: TemperatureUnit): string {
  if (celsius === null) return "";
  if (readsAsFever(celsius)) return "";
  const shown = inUnit(celsius, unit).toFixed(DISPLAY_DECIMALS);
  if (shown.length !== 5 || shown[0] !== maskPrefix(unit)) return "";
  return shown.replace(".", "");
}

/**
 * A reading the box should query rather than accept quietly.
 *
 * The second digit of a waking temperature is a 5, a 6 or a 7 (a 9 through a 9
 * in Fahrenheit); below that is a reading nobody wakes up with, and by far its
 * likeliest cause is a finger landing one key over. The field still takes it —
 * this is a nudge, not a validator, and a tracker that argued with what
 * someone measured would be the wrong kind of confident. Above the band is a
 * fever, which is a different thing and gets its own answer (see
 * {@link isFever}).
 */
export function isUnusuallyLow(celsius: number): boolean {
  return celsius < BAND_MIN_CELSIUS;
}

/** Coerce an arbitrary stored value into a temperature, or null. The only
 *  module that trusts stored bytes is `migrations.ts`, which calls this. */
export function normalizeStoredTemperature(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < MIN_CELSIUS || value > MAX_CELSIUS) return null;
  return roundTo(value, STORED_DECIMALS);
}
