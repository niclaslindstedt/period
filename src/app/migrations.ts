// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The persistence pipeline: raw JSON in, a validated `AppData` out, and back.
// Every read — from localStorage, from a cloud backend, from an imported
// backup file — goes through `parseDoc`, so no other module has to trust the
// bytes it was handed.
//
// The framework owns the migration *runner* (`createMigrator`); this module
// owns the step table and the shape validation. Adding a schema change means
// bumping `DOC_VERSION` in `types.ts` and appending one step here — never
// editing an existing step, which would silently rewrite documents that
// already migrated through it.

import { createMigrator } from "@niclaslindstedt/oss-framework/storage";

import {
  BLEEDING_LEVELS,
  DOC_VERSION,
  MOODS,
  emptyDoc,
  type AppData,
  type BleedingLevel,
  type DayEntry,
  type MoodId,
  type MoodSwing,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBleeding(value: unknown): BleedingLevel {
  return BLEEDING_LEVELS.includes(value as BleedingLevel)
    ? (value as BleedingLevel)
    : "none";
}

function asMoods(value: unknown): MoodId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set(
    value.filter((v): v is MoodId => MOODS.includes(v as MoodId)),
  );
  // Normalise to roster order so two devices that tapped the same moods in a
  // different order produce byte-identical documents (and so never sync-fight).
  return MOODS.filter((mood) => seen.has(mood));
}

function asSwing(value: unknown): MoodSwing {
  const n = Math.round(Number(value));
  return (n === 1 || n === 2 || n === 3 ? n : 0) as MoodSwing;
}

/** Coerce one stored entry into a valid `DayEntry`, or drop it when it carries
 *  no usable date. Unknown fields are discarded rather than carried forward. */
function parseEntry(day: string, value: unknown): DayEntry | null {
  if (!isRecord(value)) return null;
  const note = typeof value.note === "string" ? value.note : undefined;
  return {
    date: typeof value.date === "string" ? value.date : day,
    bleeding: asBleeding(value.bleeding),
    moods: asMoods(value.moods),
    swing: asSwing(value.swing),
    ...(note?.trim() ? { note } : {}),
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : new Date(0).toISOString(),
  };
}

// v1 is the first published shape, so the only step is the one that stamps a
// version onto a document that predates versioning (the framework's runner
// reads a missing `version` as 0). Each future schema change appends one step
// migrating `n → n + 1`; existing steps are never edited, since that would
// silently rewrite documents that already migrated through them.
const migrator = createMigrator({
  latestVersion: DOC_VERSION,
  migrations: {
    0: (doc) => ({ ...doc, version: 1 }),
  },
});

/** Validate and normalise an arbitrary parsed value into an `AppData`. Used
 *  by both `parseDoc` and the Settings import flow, which has already turned a
 *  picked file into JSON. */
export function normalizeDoc(value: unknown): AppData {
  if (!isRecord(value)) return emptyDoc();
  const { data } = migrator.migrate(value);
  const migrated = data as unknown as Record<string, unknown>;
  const entriesRaw = isRecord(migrated.entries) ? migrated.entries : {};
  const entries: AppData["entries"] = {};
  for (const [day, raw] of Object.entries(entriesRaw)) {
    const entry = parseEntry(day, raw);
    if (entry) entries[entry.date] = entry;
  }
  return { version: DOC_VERSION, entries };
}

/** Parse serialized document bytes. Throws on malformed JSON so the caller can
 *  decide whether to quarantine the stored copy — a *shape* problem is
 *  recoverable (unknown fields are dropped), a *syntax* problem is not. */
export function parseDoc(raw: string): AppData {
  return normalizeDoc(JSON.parse(raw) as unknown);
}

/** Serialize a document for storage. Entry keys are emitted in date order so
 *  the bytes are stable — two devices holding the same reports produce the
 *  same string, which keeps cloud revisions from churning on no-op saves. */
export function serializeDoc(data: AppData): string {
  const entries: AppData["entries"] = {};
  for (const day of Object.keys(data.entries).sort()) {
    entries[day] = data.entries[day]!;
  }
  return JSON.stringify({ version: DOC_VERSION, entries });
}
