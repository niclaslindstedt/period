// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's data model: one dated report per day, and the document that holds
// them. Everything the forecast and the history screens draw is derived from
// these entries — nothing about a cycle is stored, so a corrected report
// re-derives every downstream number (see `cycle.ts`).
//
// A report is two yes/no answers and the day they belong to. That is
// deliberately the whole model: `bleeding` is exactly what the cycle
// derivation reads, and everything else a tracker could ask for (how heavy,
// which mood, a free-text note) turned out to feed nothing but itself. A field
// nobody derives anything from is a field asked for every evening for nothing.

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

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
 *  v3 added the optional waking temperature. */
export const DOC_VERSION = 3;

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
    temperature: null,
    updatedAt: now,
  };
}
