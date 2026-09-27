// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The demo document — a year of one invented person's daily reports. It is the
// live demo (`make demo`, Settings → Developer → Demo data) and what the App
// Store screenshots are taken of, so it is written to be photographed: an
// ordinary, healthy year that gives every screen something real to draw, and
// nothing on it that would alarm, embarrass or single anyone out.
//
// The story, such as it is: someone who has logged their period for a year.
// Cycles run 26 to 31 days and wander a little from month to month, periods
// last four to six days, and their mood reliably turns in the few days before
// one arrives — the one symptom the report asks about. In spring they took up
// a waking temperature on most mornings, which is what lets the forecast date
// the current cycle's rise. Nothing else: the Lust and Sex answers are never
// yes and no fertility test is ever logged, because a demo anyone might open
// on a train should not narrate an intimate life or assume what someone is
// tracking for.
//
// **Every date is an offset from the moment the demo opens.** The document is
// authored as "26 days ago", "the period before that", so it never ages and
// the screens read the same on any day of the year (`tests/demoData_test.ts`
// walks a whole year of them). Today itself is left unlogged: the Report
// screen opens on it, and a report already filed has nothing to show being
// filled in.
//
// Pure and deterministic: `now` is a parameter, and the "randomness" is a hash
// of a day's offset, so two calls with the same moment produce identical
// documents. Reached only through the in-memory demo backend
// (`demoBackend.ts`) — nothing here is ever written to disk.

import {
  addDays,
  dayKeyOf,
  type DayKey,
} from "@niclaslindstedt/oss-framework/calendar";

import { parseTemperature } from "../temperature.ts";
import { DOC_VERSION, type AppData, type DayEntry } from "../types.ts";

/** How many days of history the demo carries. A year: a dozen cycles, which
 *  is what gives the forecast's backtest something to score and the History
 *  screen a chart worth reading. */
export const DEMO_DAYS = 365;

/** Where today sits in the cycle in progress: day 24 of an expected 29. The
 *  period and the fertile window after it are both behind, the temperature
 *  rise has been caught, and the next period is a few days out — the state in
 *  which the forecast is sharpest and the month view holds all its marks. */
export const CURRENT_CYCLE_DAY = 24;

/** The length the cycle in progress is heading for. Only used to place its
 *  ovulation and its temperature rise — the onset it predicts is never
 *  logged. */
const EXPECTED_CURRENT_CYCLE = 29;

/**
 * Completed cycle lengths, most recent first.
 *
 * A real cycle is neither a constant nor noise: it wanders a few days around
 * its own centre. Twenty-six to thirty-one around an average of 28 is an
 * ordinary year, and that spread is what gives the forecast an interval worth
 * drawing rather than one falsely confident date.
 */
const CYCLE_LENGTHS = [28, 30, 27, 29, 31, 28, 26, 29, 28, 28, 27, 29, 30];

/** How many days each period bled, cycle by cycle (index 0 is the one in
 *  progress). Four to six, as periods are. */
const PERIOD_LENGTHS = [5, 5, 4, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 4];

/** The luteal phase of each cycle — the days from ovulation to the next
 *  period. The steadiest span in the cycle, which is why the model counts
 *  ovulation backwards from an onset rather than forwards from a start. */
const LUTEAL_LENGTHS = [14, 14, 13, 14, 14, 13, 14, 15, 14, 13, 14, 14, 13, 14];

/** The days before each period on which the mood turned, by the index of the
 *  cycle that period opens (1 = the day before). Two to four of the last five
 *  days — a pattern, never a whole week of it. */
const MOOD_LEADS: readonly (readonly number[])[] = [
  [1, 2, 4],
  [1, 3],
  [2, 3, 4],
  [1, 2],
  [1, 2, 3, 5],
  [2, 4],
  [1, 3, 4],
  [1, 2],
  [2, 3],
  [1, 2, 4],
  [1, 3],
  [2, 3, 5],
  [1, 2],
  [1, 4],
];

/** Cycles (by index) whose first day of bleeding came with a mood swing too. */
const MOOD_ON_DAY_ONE = new Set([1, 4, 7, 10]);

/** Ordinary bad days elsewhere in the cycle, as offsets from today. A handful
 *  in a year, spread out, none of them in the last month. */
const STRAY_MOOD_DAYS = new Set([47, 96, 151, 212, 268, 331]);

/** How far back the waking temperatures go: about five months, since the
 *  spring the thermometer arrived. */
export const TEMPERATURE_DAYS = 150;

/** Mornings the thermometer stayed in the drawer: a week away and a long
 *  weekend. `[first offset, length]`, in days before today. Real coverage is
 *  not evenly scattered — it comes in runs. */
const TEMPERATURE_GAPS: readonly (readonly [number, number])[] = [
  [104, 6],
  [58, 3],
];

// Channel tags for the hash below, so each draw has its own stream.
const CH_TEMP = 4;
const CH_TEMP_MISS = 5;
const CH_HOUR = 7;
const CH_MINUTE = 8;

/**
 * A stable pseudo-random number in `[0, 1)` for one day and one channel.
 *
 * Keyed on the day's **offset from today**, not on its date, which keeps the
 * demo the same demo whenever it is opened: a given cycle day always draws the
 * same numbers, and the document only slides along the calendar.
 */
function noise(offset: number, channel: number): number {
  let h = (Math.imul(offset, 374761393) + Math.imul(channel, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** One cycle, in days-before-today coordinates. Larger offsets are further in
 *  the past, so a cycle runs from `start` *down* to `nextStart + 1`. */
export type DemoCycle = {
  /** 0 for the cycle in progress, counting back from there. */
  index: number;
  /** Offset of the day the period began. */
  start: number;
  /** Offset of the following period's start — negative for the cycle in
   *  progress, whose next start is still ahead of today. */
  nextStart: number;
  /** Days the period bled. */
  periodLength: number;
  /** Offset of ovulation: `nextStart` plus this cycle's luteal phase. */
  ovulation: number;
};

/**
 * Lay the year out as cycles, most recent first.
 *
 * Built backwards from today because that is the end that has to stay put:
 * the demo's whole point is that today lands on a particular day of a
 * particular cycle.
 */
export function demoCycles(): DemoCycle[] {
  const cycles: DemoCycle[] = [];
  let start = CURRENT_CYCLE_DAY - 1;
  let nextStart = start - EXPECTED_CURRENT_CYCLE;
  // One cycle past the far end of the window, so the oldest logged days sit
  // inside a modelled cycle: a year of logging that began mid-cycle.
  for (let i = 0; ; i++) {
    cycles.push({
      index: i,
      start,
      nextStart,
      periodLength: PERIOD_LENGTHS[i % PERIOD_LENGTHS.length]!,
      ovulation: nextStart + LUTEAL_LENGTHS[i % LUTEAL_LENGTHS.length]!,
    });
    if (start > DEMO_DAYS) return cycles;
    nextStart = start;
    start += CYCLE_LENGTHS[i % CYCLE_LENGTHS.length]!;
  }
}

/** The cycle a day belongs to: the first whose start is at or before it. */
function cycleAt(cycles: DemoCycle[], offset: number): DemoCycle {
  for (const cycle of cycles) {
    if (offset <= cycle.start) return cycle;
  }
  return cycles[cycles.length - 1]!;
}

/** Build one day's report. `offset` is days before today; `newer` is the
 *  cycle the next period opens, whose premenstrual days these are. */
function demoEntry(
  date: DayKey,
  offset: number,
  cycle: DemoCycle,
  newer: DemoCycle | undefined,
): DayEntry {
  const cycleDay = cycle.start - offset + 1;
  /** Days from this day to the next period start. */
  const lead = offset - cycle.nextStart;
  /** Days from this day to ovulation — positive before it, negative after. */
  const ovLead = offset - cycle.ovulation;
  const bleeding = cycleDay >= 1 && cycleDay <= cycle.periodLength;

  // The premenstrual days are the pattern the mood chart is read for, and the
  // onset's own morning sometimes joins them. The cycle in progress has no
  // onset yet, so none of its days are premenstrual.
  const premenstrual =
    newer !== undefined &&
    MOOD_LEADS[newer.index % MOOD_LEADS.length]!.includes(lead);
  const moodSwings =
    premenstrual ||
    (cycleDay === 1 && MOOD_ON_DAY_ONE.has(cycle.index)) ||
    STRAY_MOOD_DAYS.has(offset);

  return {
    date,
    bleeding,
    moodSwings,
    lust: false,
    sex: false,
    temperature:
      offset <= TEMPERATURE_DAYS ? demoTemperature(offset, lead, ovLead) : null,
    fertilityTest: null,
    updatedAt: demoStamp(date, offset),
  };
}

/**
 * The morning's waking temperature, or null on a morning it wasn't taken.
 *
 * Authored in Fahrenheit to two decimals — what a basal thermometer on a US
 * nightstand reads, and what the store frames show — and stored the way the
 * Report screen stores a typed °F reading (`parseTemperature`), so every value
 * reads back as the digits that were typed. A biphasic curve: a follicular
 * baseline near 97.4 °F, a dip on the morning of ovulation, a rise of about
 * two thirds of a degree over the mornings after it, and a drop back in the
 * last mornings before the period. The noise is about ±0.09 °F — a real
 * thermometer and a real night's sleep — small enough that the rise clears
 * the app's own three-over-six rule (`detectThermalShift`) in every cycle.
 */
function demoTemperature(
  offset: number,
  lead: number,
  ovLead: number,
): number | null {
  for (const [first, length] of TEMPERATURE_GAPS) {
    if (offset <= first && offset > first - length) return null;
  }
  if (noise(offset, CH_TEMP_MISS) < 0.12) return null;

  let f = 97.4;
  if (ovLead === 0) f -= 0.08;
  else if (ovLead === -1) f += 0.5;
  else if (ovLead === -2) f += 0.6;
  else if (ovLead < -2) f += 0.66;
  if (lead >= 0 && lead <= 1) f -= 0.3;
  else if (lead === 2) f -= 0.12;
  f += (noise(offset, CH_TEMP) - 0.5) * 0.18;
  return parseTemperature(f.toFixed(2), "f");
}

/** When the report was filed: the evening of its own day, as a local
 *  wall-clock time (the way a save stamps it), so it reads right in any time
 *  zone. */
function demoStamp(date: DayKey, offset: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const hour = 21 + Math.floor(noise(offset, CH_HOUR) * 2);
  const minute = Math.floor(noise(offset, CH_MINUTE) * 60);
  return new Date(year!, month! - 1, day!, hour, minute).toISOString();
}

/**
 * Build the demo document for the moment it opens: one report a day for the
 * year ending yesterday.
 */
export function buildDemoData(now: Date): AppData {
  const today = dayKeyOf(now);
  const cycles = demoCycles();
  const entries: Record<DayKey, DayEntry> = {};
  for (let offset = DEMO_DAYS; offset >= 1; offset--) {
    const date = addDays(today, -offset);
    const cycle = cycleAt(cycles, offset);
    const newer = cycle.index > 0 ? cycles[cycle.index - 1] : undefined;
    entries[date] = demoEntry(date, offset, cycle, newer);
  }
  return { version: DOC_VERSION, entries };
}
