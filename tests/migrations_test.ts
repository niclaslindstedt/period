// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { normalizeDoc, parseDoc, serializeDoc } from "../src/app/migrations.ts";
import { DOC_VERSION, emptyDoc, type AppData } from "../src/app/types.ts";

// Everything that reaches the app from storage — localStorage, a cloud pull, a
// restored backup — goes through here first, so this is where "the bytes are
// not what we expected" has to stop being a crash and start being a document.

describe("normalizeDoc", () => {
  it("returns an empty document for anything that isn't an object", () => {
    expect(normalizeDoc(null)).toEqual(emptyDoc());
    expect(normalizeDoc("nope")).toEqual(emptyDoc());
    expect(normalizeDoc([1, 2, 3])).toEqual(emptyDoc());
  });

  it("stamps a version onto a pre-versioning document", () => {
    const doc = normalizeDoc({ entries: {} });
    expect(doc.version).toBe(DOC_VERSION);
  });

  it("drops unknown fields and coerces bad ones to their defaults", () => {
    const doc = normalizeDoc({
      version: 2,
      entries: {
        "2026-03-01": {
          date: "2026-03-01",
          bleeding: "torrential",
          moodSwings: 1,
          colour: "blue",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      },
    });
    const entry = doc.entries["2026-03-01"]!;
    // Only a literal `true` is a yes — anything else is an answer this build
    // cannot read, and a false negative is the safer way to be wrong here.
    expect(entry.bleeding).toBe(false);
    expect(entry.moodSwings).toBe(false);
    expect(entry).not.toHaveProperty("colour");
  });

  it("files an entry under its own date, not the key it was stored beside", () => {
    const doc = normalizeDoc({
      version: 2,
      entries: { wrong: { date: "2026-03-01", bleeding: true } },
    });
    expect(Object.keys(doc.entries)).toEqual(["2026-03-01"]);
  });

  it("refuses a document from a newer build rather than mangling it", () => {
    expect(() => normalizeDoc({ version: 99, entries: {} })).toThrow();
  });
});

// The v1 → v2 collapse. A phone that has been logging on the old build has a
// document full of bleeding levels, mood tags, 0–3 swings and notes; this is
// the one chance to carry the two answers that survived out of it.
describe("the v1 → v2 migration", () => {
  const v1 = (entry: Record<string, unknown>) =>
    normalizeDoc({
      version: 1,
      entries: { "2026-03-01": { date: "2026-03-01", ...entry } },
    }).entries["2026-03-01"]!;

  it("reads every bleeding level except none as a bleeding day", () => {
    for (const level of ["spotting", "light", "medium", "heavy"]) {
      expect(v1({ bleeding: level }).bleeding).toBe(true);
    }
    expect(v1({ bleeding: "none" }).bleeding).toBe(false);
  });

  it("reads any swing above steady as mood swings", () => {
    expect(v1({ swing: 0 }).moodSwings).toBe(false);
    expect(v1({ swing: 1 }).moodSwings).toBe(true);
    expect(v1({ swing: 3 }).moodSwings).toBe(true);
  });

  it("keeps a day that only carried moods or a note, as a no/no report", () => {
    // The tags themselves are gone, but the day was reported — and "I checked
    // in and nothing happened" is a different claim from "I never opened it".
    const entry = v1({ moods: ["tired", "sad"], note: "long day" });
    expect(entry.bleeding).toBe(false);
    expect(entry.moodSwings).toBe(false);
    expect(entry).not.toHaveProperty("moods");
    expect(entry).not.toHaveProperty("note");
  });

  it("keeps the edit timestamp, so a migrated day still merges correctly", () => {
    expect(v1({ updatedAt: "2026-03-01T10:00:00.000Z" }).updatedAt).toBe(
      "2026-03-01T10:00:00.000Z",
    );
  });

  it("survives a v1 document whose entries are junk", () => {
    const doc = normalizeDoc({
      version: 1,
      entries: { "2026-03-01": "not an entry", "2026-03-02": null },
    });
    expect(doc.entries).toEqual({});
  });

  it("carries a v1 day all the way to a v3 entry", () => {
    // Two migrations in one read: the collapse to booleans, then the added
    // temperature. A phone that skipped the v2 build must land in the same
    // place as one that did not.
    const entry = v1({ bleeding: "light", swing: 2 });
    expect(entry).toEqual({
      date: "2026-03-01",
      bleeding: true,
      moodSwings: true,
      temperature: null,
      updatedAt: new Date(0).toISOString(),
    });
  });
});

// The v2 → v3 addition. Purely additive: a day that was logged before the
// field existed simply has no reading, which is the same claim as skipping it.
describe("the v2 → v3 migration", () => {
  const v2 = (entry: Record<string, unknown>) =>
    normalizeDoc({
      version: 2,
      entries: { "2026-03-01": { date: "2026-03-01", ...entry } },
    }).entries["2026-03-01"]!;

  it("gives every existing day an explicit absent reading", () => {
    expect(v2({ bleeding: true, moodSwings: false }).temperature).toBeNull();
  });

  it("keeps the two answers the day already carried", () => {
    const entry = v2({ bleeding: true, moodSwings: true });
    expect(entry.bleeding).toBe(true);
    expect(entry.moodSwings).toBe(true);
  });

  it("keeps a reading a v3 document already stored", () => {
    const doc = normalizeDoc({
      version: 3,
      entries: {
        "2026-03-01": {
          date: "2026-03-01",
          bleeding: false,
          moodSwings: false,
          temperature: 36.52,
        },
      },
    });
    expect(doc.entries["2026-03-01"]!.temperature).toBe(36.52);
  });

  it("drops a stored reading that cannot be one", () => {
    for (const value of [365, "36.5", null, 0, Number.NaN]) {
      const doc = normalizeDoc({
        version: 3,
        entries: {
          "2026-03-01": { date: "2026-03-01", temperature: value },
        },
      });
      expect(doc.entries["2026-03-01"]!.temperature).toBeNull();
    }
  });
});

describe("serializeDoc", () => {
  it("round-trips a document", () => {
    const doc: AppData = {
      version: DOC_VERSION,
      entries: {
        "2026-03-01": {
          date: "2026-03-01",
          bleeding: true,
          moodSwings: true,
          temperature: 36.52,
          updatedAt: "2026-03-01T10:00:00.000Z",
        },
      },
    };
    expect(parseDoc(serializeDoc(doc))).toEqual(doc);
  });

  it("emits days in date order, so equal content produces equal bytes", () => {
    const a = emptyDoc();
    const b = emptyDoc();
    for (const date of ["2026-03-03", "2026-03-01", "2026-03-02"]) {
      a.entries[date] = {
        date,
        bleeding: true,
        moodSwings: false,
        temperature: null,
        updatedAt: "2026-03-01T00:00:00.000Z",
      };
    }
    for (const date of ["2026-03-01", "2026-03-02", "2026-03-03"]) {
      b.entries[date] = {
        date,
        bleeding: true,
        moodSwings: false,
        temperature: null,
        updatedAt: "2026-03-01T00:00:00.000Z",
      };
    }
    expect(serializeDoc(a)).toBe(serializeDoc(b));
  });

  it("throws on bytes that aren't JSON at all", () => {
    expect(() => parseDoc("{not json")).toThrow();
  });
});
