// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's data model: one dated report per day, and the document that holds
// them. Everything the forecast and the history screens draw is derived from
// these entries — nothing about a cycle is stored, so a corrected report
// re-derives every downstream number (see `cycle.ts`).
//
// A report is four yes/no answers, two optional measurements, and the day they
// belong to. Every one of them is read by something: `bleeding` derives the
// periods and the cycle lengths, and the other five are the evidence channels
// `forecastModel.ts` weighs each candidate onset day against. A field nobody
// derives anything from is a field asked for every evening for nothing — which
// is why "how heavy", "which mood" and a free-text note are not here.
//
// The five channels split into two families, and the split is the whole reason
// they earn their place separately:
//
//   - `moodSwings` and `temperature` are **premenstrual** — they say something
//     about the days immediately before an onset.
//   - `lust`, `sex` and `fertilityTest` are **ovulatory** — they peak around
//     ovulation, which is a luteal phase *before* the onset. They therefore
//     speak about a part of the cycle the first two are silent on, which is the
//     only reason a fourth, fifth and sixth question is worth asking.

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

/**
 * What an ovulation (LH) test strip said, or null when none was taken.
 *
 * Optional in the same way a temperature is, and for the same reason: strips
 * are bought for the few mid-cycle mornings they are useful on, and a channel
 * that only worked for someone who tested daily would work for nobody. A day
 * with no test is not a negative — it is no observation at all, and the model
 * skips it rather than counting it against an onset.
 */
export type FertilityTest = "positive" | "negative";

/** One day's report. `date` is the local calendar day it describes, not when
 *  it was typed — a report filed three days late still belongs to its day.
 *
 *  An *absent* entry is not the same claim as an entry with both answers no:
 *  "I didn't record anything" and "I checked in, nothing happened" are
 *  different, and the derivation must not confuse the two. That is why saving
 *  a no/no day stores it rather than clearing it. */
export type DayEntry = {
  date: DayKey;
  /** Any bleeding at all, spotting included — spotting is how periods start,
   *  and the derivation has no use for a heaviness it never reads. */
  bleeding: boolean;
  /** Whether the mood moved noticeably across the day. */
  moodSwings: boolean;
  /** Whether sex drive was noticeably raised — the day's answer to "did you
   *  want to?", which rises toward ovulation and is the one ovulatory channel
   *  that costs nothing to answer. */
  lust: boolean;
  /** Whether there was sex. Answered for the same reason `lust` is, and read
   *  the same way — as a rate per lag before an onset, learned rather than
   *  assumed. It is the more confounded of the two (a weekend is not a
   *  hormone), and the model is built so that a channel which turns out to
   *  predict nothing produces a flat profile and moves nothing. */
  sex: boolean;
  /**
   * Waking body temperature in **degrees Celsius**, or null when none was
   * taken. Celsius is the canonical unit whatever the user reads: a document
   * that changed meaning when a setting changed would be a document that syncs
   * wrong between two devices set differently.
   *
   * Optional in a way the two booleans are not. Nobody takes their temperature
   * every day, and a forecast that quietly got worse because you skipped a
   * fortnight would be a bad trade for a field you cannot always fill.
   */
  temperature: number | null;
  /**
   * What an ovulation test said this morning, or null when none was taken.
   *
   * The strongest single piece of evidence in the document, and the sparsest:
   * a positive strip dates the LH surge to within a day, and the next period
   * follows it by a luteal phase — which is the steadiest span in the cycle.
   * One positive test says more about the next onset than a fortnight of
   * anything else here, which is why a tri-state is worth the storage where a
   * fourth boolean would not be.
   */
  fertilityTest: FertilityTest | null;
  /** ISO timestamp of the last edit, used as the tiebreak when two devices
   *  edited the same day between syncs. */
  updatedAt: string;
};

/** The persisted document — the whole app state, one JSON blob. Keyed by day
 *  so a report is an upsert and the calendar screens are a map lookup. */
export type AppData = {
  /** Schema version; bumped by a migration step in `migrations.ts`. */
  version: number;
  entries: Record<DayKey, DayEntry>;
};

/** The document a first run starts from. */
export function emptyDoc(): AppData {
  return { version: DOC_VERSION, entries: {} };
}

/** The current document schema version. v2 collapsed the five-level bleeding
 *  scale, the mood roster, the 0–3 swing scale and the note into two booleans;
 *  v3 added the optional waking temperature; v4 added the three ovulatory
 *  channels — lust, sex, and the optional ovulation-test result. */
export const DOC_VERSION = 4;

/** A day's entry, or `null` when nothing was reported that day. */
export function entryFor(data: AppData, day: DayKey): DayEntry | null {
  return data.entries[day] ?? null;
}

/** Every entry in ascending date order. `DayKey` is `YYYY-MM-DD`, so a plain
 *  string sort is a date sort. */
export function sortedEntries(data: AppData): DayEntry[] {
  return Object.values(data.entries).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/** A blank report for a day — what the report screen opens on when the day
 *  has nothing logged yet. */
export function blankEntry(day: DayKey, now: string): DayEntry {
  return {
    date: day,
    bleeding: false,
    moodSwings: false,
    lust: false,
    sex: false,
    temperature: null,
    fertilityTest: null,
    updatedAt: now,
  };
}
