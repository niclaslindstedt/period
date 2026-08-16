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

import { normalizeStoredTemperature } from "./temperature.ts";
import {
  DOC_VERSION,
  emptyDoc,
  type AppData,
  type DayEntry,
  type FertilityTest,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a stored ovulation-test result. Anything that is not one of the two
 *  words this build knows becomes "no test taken" — the claim that loses the
 *  least, since a day with no test is already the common case and the model
 *  simply skips it. */
function parseFertilityTest(value: unknown): FertilityTest | null {
  return value === "positive" || value === "negative" ? value : null;
}

/** Coerce one stored entry into a valid `DayEntry`, or drop it when it isn't
 *  an object at all. Unknown fields are discarded rather than carried forward,
 *  so a v1 document's `moods` and `note` do not survive the read. */
function parseEntry(day: string, value: unknown): DayEntry | null {
  if (!isRecord(value)) return null;
  return {
    date: typeof value.date === "string" ? value.date : day,
    bleeding: value.bleeding === true,
    moodSwings: value.moodSwings === true,
    lust: value.lust === true,
    sex: value.sex === true,
    // An implausible number is dropped to null rather than clamped: a reading
    // of 365 is a mis-keyed 36.5, and inventing 45 °C out of it would be worse
    // than having no reading for the day.
    temperature: normalizeStoredTemperature(value.temperature),
    fertilityTest: parseFertilityTest(value.fertilityTest),
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : new Date(0).toISOString(),
  };
}

/** The v1 → v2 collapse for one entry: the five-level bleeding scale becomes
 *  "was there any", and the 0–3 swing scale becomes "did it move". Both read
 *  the old value permissively — this runs on bytes written by a build that is
 *  no longer here to be asked. */
function liftEntry(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const swing = Math.round(Number(value.swing));
  return {
    date: value.date,
    // Every level except "none" counted as bleeding for the derivation, and
    // still does — a v1 spotting day is a v2 bleeding day.
    bleeding: typeof value.bleeding === "string" && value.bleeding !== "none",
    // Any reported swing at all is a yes. Rounding down to "steady" would be
    // the lossier read of a scale that only ever meant "how much".
    moodSwings: Number.isFinite(swing) && swing > 0,
    updatedAt: value.updatedAt,
  };
}

// Step `n` migrates a document from version `n` to `n + 1`. v0 is a document
// that predates versioning (the framework's runner reads a missing `version`
// as 0); v1 is the first published shape, with a bleeding scale, a mood
// roster, a 0–3 swing scale and a note. Existing steps are never edited —
// that would silently rewrite documents that already migrated through them.
const migrator = createMigrator({
  latestVersion: DOC_VERSION,
  migrations: {
    0: (doc) => ({ ...doc, version: 1 }),
    1: (doc) => {
      const entriesRaw = isRecord(doc.entries) ? doc.entries : {};
      const entries: Record<string, unknown> = {};
      for (const [day, value] of Object.entries(entriesRaw)) {
        entries[day] = liftEntry(value);
      }
      return { ...doc, version: 2, entries };
    },
    // v3 adds the optional waking temperature. Purely additive: every existing
    // day gets an explicit null, which is the same claim the absent field made
    // — no reading was taken. `parseEntry` would produce that anyway; the step
    // exists so the stored version number moves and the intent is recorded.
    2: (doc) => {
      const entriesRaw = isRecord(doc.entries) ? doc.entries : {};
      const entries: Record<string, unknown> = {};
      for (const [day, value] of Object.entries(entriesRaw)) {
        entries[day] = isRecord(value)
          ? { ...value, temperature: null }
          : value;
      }
      return { ...doc, version: 3, entries };
    },
    // v4 adds the three ovulatory channels. Additive in exactly the way v3 was:
    // every existing day gets `lust: false`, `sex: false` and no test, which is
    // the claim the absent fields already made. The two booleans default to a
    // no rather than to "unknown" because that is what the rest of the document
    // means by a saved day — a report is an answer to every question on the
    // screen at the time it was filed.
    3: (doc) => {
      const entriesRaw = isRecord(doc.entries) ? doc.entries : {};
      const entries: Record<string, unknown> = {};
      for (const [day, value] of Object.entries(entriesRaw)) {
        entries[day] = isRecord(value)
          ? { ...value, lust: false, sex: false, fertilityTest: null }
          : value;
      }
      return { ...doc, version: 4, entries };
    },
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
