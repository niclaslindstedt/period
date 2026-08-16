// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer "Demo data" document — a year of daily reports for one
// invented person, built so every screen in the app has something real to draw.
//
// The story it tells, because a demo that isn't a story shows nothing: a woman
// who has logged her period for a year, whose mood reliably turns in the week
// before it arrives, and who spent the last six months trying to conceive —
// which is when the waking temperatures and the ovulation strips start, on
// roughly nine mornings in ten. Two of those mornings she was ill instead. She
// is not pregnant: every cycle in the year closes with a period, and the one in
// progress is three days from its own.
//
// **Every date is relative to `today`.** The document is authored in offsets —
// "26 days ago", "the period before that" — and only turned into `DayKey`s at
// build time, so the demo is the same demo whenever it is loaded. Fixed dates
// would age: a year from now they would show a stale document whose forecast
// ran out months ago.
//
// Pure, clock-free and deterministic, like the derivation it feeds: `today` is
// a parameter, the "randomness" is a hash of the day's offset, and two calls
// with the same argument produce identical documents (see
// `tests/demoData_test.ts`). Reached only through the in-memory demo backend
// (`demoBackend.ts`) — nothing here is ever written to disk.

import { addDays, daysBetween } from "@niclaslindstedt/oss-framework/calendar";
import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

import { FEVER_CELSIUS } from "../temperature.ts";
import {
  DOC_VERSION,
  type AppData,
  type DayEntry,
  type FertilityTest,
} from "../types.ts";

/** How many days of history the demo carries. A year: long enough for a dozen
 *  cycles, which is what makes the forecast's confidence label read "high" and
 *  gives its backtest something to score. */
export const DEMO_DAYS = 365;

/** Where the demo's "today" sits in the cycle in progress — day 27 of an
 *  expected 29, so the app opens three days from the next period. That is the
 *  state worth demonstrating: the forecast is at its sharpest, the mood-swing
 *  channel is lit, and a full cycle sits behind it on every other screen. */
const CURRENT_CYCLE_DAY = 27;

/** The length the in-progress cycle is heading for. Only used to place its
 *  ovulation and its premenstrual week — the day it predicts is never logged. */
const EXPECTED_CURRENT_CYCLE = 29;

/**
 * Completed cycle lengths, most recent first.
 *
 * A real cycle is neither a constant nor noise: it varies by a few days around
 * its own centre, with the occasional longer one. Twenty-six to thirty-two
 * around a median of 29 is an ordinary year, and that spread is what gives the
 * forecast an interval worth drawing rather than one falsely confident date.
 */
const CYCLE_LENGTHS = [28, 30, 29, 27, 31, 28, 29, 26, 30, 28, 29, 32, 27];

/** How many days each period bled, cycle by cycle (index 0 is the most recent,
 *  which started 26 days ago). Four to six, as periods are. */
const PERIOD_LENGTHS = [5, 4, 5, 6, 4, 5, 5, 4, 6, 5, 4, 5, 5];

/** The luteal phase of each cycle — the days from ovulation to the next
 *  period. The steadiest span in the cycle, which is exactly why the model
 *  counts ovulation backwards from an onset rather than forwards from a
 *  start. */
const LUTEAL_LENGTHS = [14, 14, 13, 14, 15, 14, 14, 13, 14, 14, 15, 14, 13];

/**
 * How many days before each period her mood turns, cycle by cycle.
 *
 * A window rather than a per-day coin flip, because that is what a
 * premenstrual week actually is: a stretch of days that arrives together, not
 * six independent chances of a bad afternoon. The width moves between five and
 * eight days from cycle to cycle, and one day inside each window stays calm
 * (see `quietLead`), so the pattern is strong without ever being a clean step
 * the model could read off in one cycle.
 */
const MOOD_WINDOWS = [6, 7, 5, 6, 8, 6, 7, 5, 6, 6, 7, 6, 5];

/** How far back the trying-to-conceive stretch runs. Six months: before it she
 *  logged the four answers and nothing else, and from it on the thermometer and
 *  the ovulation strips appear. */
const TTC_DAYS = 183;

/** The cycle she didn't test in, counted back from the current one. Someone who
 *  tests every morning for six months and never once runs out of strips is a
 *  spreadsheet, not a person. */
const UNTESTED_CYCLE = 4;

/** The illness: two consecutive mornings, the first this many days ago. Placed
 *  mid-follicular so it reads as what it is — an outlier with nothing to do
 *  with the cycle — rather than as an early luteal shift. */
const FEVER_OFFSET = 104;

/** Mornings the thermometer simply wasn't there: a trip and a long weekend.
 *  `[first offset, length]`, in days before today. Real coverage is not evenly
 *  scattered — it comes in runs. */
const TEMPERATURE_GAPS: readonly (readonly [number, number])[] = [
  [118, 4],
  [62, 3],
];

// Channel tags for the hash below. Each field draws from its own stream, so a
// day with a mood swing is not thereby a day with sex.
const CH_MOOD = 1;
const CH_LUST = 2;
const CH_SEX = 3;
const CH_TEMP = 4;
const CH_TEMP_MISS = 5;
const CH_TEST_MISS = 6;
const CH_HOUR = 7;
const CH_MINUTE = 8;
const CH_QUIET = 9;

/**
 * A stable pseudo-random number in `[0, 1)` for one day and one channel.
 *
 * Keyed on the day's **offset from today**, not on its date, which is what
 * makes the demo reproducible: a given cycle-day always draws the same
 * numbers, so the document has the same shape today, tomorrow, and next year —
 * it only slides along the calendar. A PRNG seeded once and walked forwards
 * would lose that the moment a day was added at the front.
 */
function noise(offset: number, channel: number): number {
  let h = (Math.imul(offset, 374761393) + Math.imul(channel, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Day of the week in `Date.getDay()` numbering, without touching a clock:
 *  2024-01-01 was a Monday, so everything counts from there. */
function weekdayOf(day: DayKey): number {
  return (((daysBetween("2024-01-01", day) + 1) % 7) + 7) % 7;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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
  /** How many days before the next period her mood turned this cycle. */
  moodWindow: number;
};

/**
 * Lay the year out as cycles, most recent first.
 *
 * Built backwards from today because that is the end that has to stay put: the
 * demo's whole point is that "today" lands on a particular day of a particular
 * cycle, and anchoring the far end instead would let that slide every time a
 * length in the table above was edited.
 */
export function demoCycles(): DemoCycle[] {
  const cycles: DemoCycle[] = [];
  let start = CURRENT_CYCLE_DAY - 1;
  let nextStart = start - EXPECTED_CURRENT_CYCLE;
  for (let i = 0; start <= DEMO_DAYS; i++) {
    cycles.push({
      index: i,
      start,
      nextStart,
      periodLength: PERIOD_LENGTHS[i % PERIOD_LENGTHS.length]!,
      ovulation: nextStart + LUTEAL_LENGTHS[i % LUTEAL_LENGTHS.length]!,
      moodWindow: MOOD_WINDOWS[i % MOOD_WINDOWS.length]!,
    });
    nextStart = start;
    start += CYCLE_LENGTHS[i % CYCLE_LENGTHS.length]!;
  }
  return cycles;
}

/** The cycle a day belongs to. Offsets descend within a cycle, so the first
 *  cycle whose start is at or before the day (in offset terms, at or above it)
 *  is the one it falls in. */
function cycleAt(cycles: DemoCycle[], offset: number): DemoCycle {
  for (const cycle of cycles) {
    if (offset <= cycle.start) return cycle;
  }
  return cycles[cycles.length - 1]!;
}

/** The one day inside a cycle's premenstrual window that stayed calm. Keyed on
 *  the cycle rather than the day, so it is one day per cycle and not a rate. */
function quietLead(cycle: DemoCycle): number {
  return 1 + Math.floor(noise(cycle.index, CH_QUIET) * cycle.moodWindow);
}

/** Build one day's report. `offset` is days before today; everything the day
 *  answers is a function of where it sits in its cycle. */
function demoEntry(date: DayKey, offset: number, cycle: DemoCycle): DayEntry {
  const cycleDay = cycle.start - offset + 1;
  /** Days from this day to the next period start. */
  const lead = offset - cycle.nextStart;
  /** Days from this day to ovulation — positive before it, negative after. */
  const ovLead = offset - cycle.ovulation;
  const bleeding = cycleDay >= 1 && cycleDay <= cycle.periodLength;
  const ttc = offset <= TTC_DAYS;
  const feverDay = offset === FEVER_OFFSET || offset === FEVER_OFFSET - 1;

  // The premenstrual window is the pattern the demo exists to show: her mood
  // turns a few days out and stays turned until the period arrives, bar the
  // one day that doesn't. Elsewhere a swing is an ordinary bad day — a little
  // likelier over the first days of bleeding, and rare otherwise.
  const premenstrual = lead >= 1 && lead <= cycle.moodWindow;
  let moodChance = 0.04;
  if (premenstrual) moodChance = lead === quietLead(cycle) ? 0 : 1;
  else if (bleeding) moodChance = cycleDay <= 2 ? 0.35 : 0.15;

  // Sex drive climbs into the fertile days and falls away during the period.
  let lustChance = 0.12;
  if (bleeding) lustChance = 0.03;
  else if (ovLead >= -1 && ovLead <= 1) lustChance = 0.65;
  else if (ovLead >= 2 && ovLead <= 4) lustChance = 0.45;
  else if (ovLead === -2) lustChance = 0.3;

  // Sex is the confounded channel, and the demo says so out loud: a weekend
  // moves it about as much as the cycle does — until the trying-to-conceive
  // months, where the fertile days are deliberately aimed at.
  let sexChance = bleeding ? 0.02 : 0.14;
  const weekday = weekdayOf(date);
  if (!bleeding && (weekday === 5 || weekday === 6)) sexChance += 0.18;
  if (ovLead >= -1 && ovLead <= 5) {
    sexChance = ttc ? (ovLead >= 0 && ovLead <= 2 ? 0.8 : 0.6) : 0.3;
  }
  // Nobody is trying for a baby on the two mornings they woke up ill.
  if (feverDay) sexChance = 0;

  return {
    date,
    bleeding,
    moodSwings: noise(offset, CH_MOOD) < moodChance,
    lust: noise(offset, CH_LUST) < lustChance,
    sex: noise(offset, CH_SEX) < sexChance,
    temperature: ttc ? demoTemperature(offset, lead, ovLead, feverDay) : null,
    fertilityTest: ttc
      ? demoFertilityTest(cycle, offset, cycleDay, ovLead)
      : null,
    updatedAt: demoStamp(date, offset),
  };
}

/**
 * The morning's waking temperature, or null on a morning it wasn't taken.
 *
 * A biphasic curve, which is the thing a chart of these is read for: a
 * follicular baseline, a dip as the LH surge peaks, a third of a degree of
 * luteal shift over the two days after ovulation, and a drop back in the last
 * days before the period. The noise is ±0.07 °C — about what a real
 * thermometer and a real night's sleep contribute, and small enough that the
 * step stays visible through it.
 */
function demoTemperature(
  offset: number,
  lead: number,
  ovLead: number,
  feverDay: boolean,
): number | null {
  // The illness overrides everything, a missed morning included: the first day
  // is the slider's fever stop (what the app stores when you tap it), the
  // second a real reading on the way back down. Both sit above the band, so
  // `forecastModel.ts` leaves them out of the temperature channel — which is
  // precisely the behaviour worth having in a demo document.
  if (feverDay) return offset === FEVER_OFFSET ? FEVER_CELSIUS : 37.8;
  for (const [first, length] of TEMPERATURE_GAPS) {
    if (offset <= first && offset > first - length) return null;
  }
  if (noise(offset, CH_TEMP_MISS) < 0.06) return null;

  let celsius = 36.36;
  if (ovLead === 1) celsius -= 0.06;
  else if (ovLead === 0) celsius += 0.02;
  else if (ovLead === -1) celsius += 0.14;
  else if (ovLead === -2) celsius += 0.24;
  else if (ovLead < -2) celsius += 0.3;
  if (lead <= 1) celsius -= 0.12;
  else if (lead === 2) celsius -= 0.06;
  celsius += (noise(offset, CH_TEMP) - 0.5) * 0.14;
  return roundTo(celsius, 2);
}

/**
 * What an ovulation strip said that morning, or null on a morning none was
 * used.
 *
 * Tested the way strips actually get used: from cycle day 9, one a morning,
 * stopping the day after the positive — there is no reason to keep testing once
 * the surge has been caught, and a box holds twenty. The positive lands the day
 * before ovulation, which is where an LH surge is.
 */
function demoFertilityTest(
  cycle: DemoCycle,
  offset: number,
  cycleDay: number,
  ovLead: number,
): FertilityTest | null {
  if (cycle.index === UNTESTED_CYCLE) return null;
  if (cycleDay < 9) return null;
  // Testing stops the morning after the surge was caught.
  if (ovLead < 0) return null;
  // The surge itself is never a missed morning — the day she caught it is by
  // definition a day she tested, and a cycle whose positive went unrecorded
  // would be a cycle the demo silently fails to show the sharpest evidence the
  // document can hold.
  if (ovLead !== 1 && noise(offset, CH_TEST_MISS) < 0.1) return null;
  return ovLead === 1 ? "positive" : "negative";
}

/** When the report was filed: the evening of its own day. Reports carry the
 *  stamp the merge tie-breaks on, so they have to be real timestamps in the
 *  past — and a tracker gets filled in at bedtime. */
function demoStamp(date: DayKey, offset: number): string {
  const hour = 20 + Math.floor(noise(offset, CH_HOUR) * 3);
  const minute = Math.floor(noise(offset, CH_MINUTE) * 60);
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

/**
 * Build the demo document: one report a day for the year ending yesterday.
 *
 * Today itself is left unlogged on purpose — the Report screen opens on today,
 * and a demo whose first screen is already filled in has nothing to show being
 * filled in.
 */
export function buildDemoData(today: DayKey): AppData {
  const cycles = demoCycles();
  const entries: Record<DayKey, DayEntry> = {};
  for (let offset = DEMO_DAYS; offset >= 1; offset--) {
    const date = addDays(today, -offset);
    entries[date] = demoEntry(date, offset, cycleAt(cycles, offset));
  }
  return { version: DOC_VERSION, entries };
}
