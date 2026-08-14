// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { normalizeDoc, parseDoc, serializeDoc } from "../src/app/migrations.ts";
import { emptyDoc, type AppData } from "../src/app/types.ts";

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
    expect(doc.version).toBe(1);
  });

  it("drops unknown fields and coerces bad ones to their defaults", () => {
    const doc = normalizeDoc({
      version: 1,
      entries: {
        "2026-03-01": {
          date: "2026-03-01",
          bleeding: "torrential",
          moods: ["happy", "hungry"],
          swing: 9,
          colour: "blue",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      },
    });
    const entry = doc.entries["2026-03-01"]!;
    expect(entry.bleeding).toBe("none");
    expect(entry.moods).toEqual(["happy"]);
    expect(entry.swing).toBe(0);
    expect(entry).not.toHaveProperty("colour");
  });

  it("normalises moods to roster order however they were stored", () => {
    const doc = normalizeDoc({
      version: 1,
      entries: {
        "2026-03-01": { moods: ["tired", "calm", "sad"] },
      },
    });
    expect(doc.entries["2026-03-01"]!.moods).toEqual(["calm", "sad", "tired"]);
  });

  it("files an entry under its own date, not the key it was stored beside", () => {
    const doc = normalizeDoc({
      version: 1,
      entries: { wrong: { date: "2026-03-01", bleeding: "light" } },
    });
    expect(Object.keys(doc.entries)).toEqual(["2026-03-01"]);
  });

  it("refuses a document from a newer build rather than mangling it", () => {
    expect(() => normalizeDoc({ version: 99, entries: {} })).toThrow();
  });
});

describe("serializeDoc", () => {
  it("round-trips a document", () => {
    const doc: AppData = {
      version: 1,
      entries: {
        "2026-03-01": {
          date: "2026-03-01",
          bleeding: "heavy",
          moods: ["sad"],
          swing: 2,
          note: "rough one",
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
        bleeding: "light",
        moods: [],
        swing: 0,
        updatedAt: "2026-03-01T00:00:00.000Z",
      };
    }
    for (const date of ["2026-03-01", "2026-03-02", "2026-03-03"]) {
      b.entries[date] = {
        date,
        bleeding: "light",
        moods: [],
        swing: 0,
        updatedAt: "2026-03-01T00:00:00.000Z",
      };
    }
    expect(serializeDoc(a)).toBe(serializeDoc(b));
  });

  it("throws on bytes that aren't JSON at all", () => {
    expect(() => parseDoc("{not json")).toThrow();
  });
});
