// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's data model: one dated report per day, and the document that holds
// them. Everything the forecast and the history screens draw is derived from
// these entries — nothing about a cycle is stored, so a corrected report
// re-derives every downstream number (see `cycle.ts`).

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

/** How heavy the bleeding was on a given day. `none` is a logged day with no
 *  bleeding — deliberately distinct from *no report at all*, which is what an
 *  absent entry means: "I didn't record anything" is not the same claim as "I
 *  wasn't bleeding", and the cycle derivation must not confuse the two. */
export type BleedingLevel = "none" | "spotting" | "light" | "medium" | "heavy";

/** Bleeding levels in increasing order — the order the report screen shows
 *  them in, and the order any "how heavy was it" comparison reads. */
export const BLEEDING_LEVELS = [
  "none",
  "spotting",
  "light",
  "medium",
  "heavy",
] as const;

/** Relative weight per level, used to plot a period's intensity over time.
 *  Ordinal, not medical — the spacing only has to be monotonic. */
export const BLEEDING_WEIGHT: Record<BleedingLevel, number> = {
  none: 0,
  spotting: 1,
  light: 2,
  medium: 3,
  heavy: 4,
};

/** True when the level counts as bleeding for cycle derivation. Spotting
 *  counts — it is how many periods start. */
export function isBleeding(level: BleedingLevel): boolean {
  return level !== "none";
}

/** The moods a day can be tagged with. A small, fixed roster: the point is a
 *  quick tap on the way past, not an exhaustive emotional vocabulary. */
export type MoodId =
  | "calm"
  | "happy"
  | "energetic"
  | "irritable"
  | "anxious"
  | "sad"
  | "angry"
  | "tearful"
  | "tired";

/** The mood roster in display order — the settled moods first, then the ones
 *  people most often want to correlate with a cycle phase. */
export const MOODS = [
  "calm",
  "happy",
  "energetic",
  "irritable",
  "anxious",
  "sad",
  "angry",
  "tearful",
  "tired",
] as const;

/** How much the mood swung across the day, 0–3. Kept separate from the mood
 *  tags: "I was sad all day" and "I went from fine to furious and back" are
 *  different reports, and only the second is a swing. */
export type MoodSwing = 0 | 1 | 2 | 3;

/** The mood-swing levels in increasing order. */
export const MOOD_SWINGS = [0, 1, 2, 3] as const;

/** One day's report. `date` is the local calendar day it describes, not when
 *  it was typed — a report filed three days late still belongs to its day. */
export type DayEntry = {
  date: DayKey;
  bleeding: BleedingLevel;
  /** The moods tagged on the day, in roster order. May be empty. */
  moods: MoodId[];
  /** How much the mood swung, 0 (steady) to 3 (all over the place). */
  swing: MoodSwing;
  /** Free text — anything the fixed fields don't capture. */
  note?: string;
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

/** The current document schema version. */
export const DOC_VERSION = 1;

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
    bleeding: "none",
    moods: [],
    swing: 0,
    updatedAt: now,
  };
}

/** True when an entry carries nothing worth persisting. Saving one of these
 *  deletes the day's report rather than storing an empty husk, so "I logged
 *  nothing" and "I logged a blank" stay the same state. */
export function isEmptyEntry(entry: DayEntry): boolean {
  return (
    entry.bleeding === "none" &&
    entry.moods.length === 0 &&
    entry.swing === 0 &&
    !entry.note?.trim()
  );
}
