// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { mergeDocs } from "../src/app/merge.ts";
import { emptyDoc, type AppData, type DayEntry } from "../src/app/types.ts";

// The merge decides what happens to two devices' reports when they meet. Every
// path through it is a chance to silently drop somebody's data, so it gets the
// cases spelled out.

function entry(date: string, patch: Partial<DayEntry> = {}): DayEntry {
  return {
    date,
    bleeding: true,
    moodSwings: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

function docOf(...entries: DayEntry[]): AppData {
  const doc = emptyDoc();
  for (const e of entries) doc.entries[e.date] = e;
  return doc;
}

describe("mergeDocs", () => {
  it("keeps days only one side holds", () => {
    const merged = mergeDocs(
      docOf(entry("2026-03-01")),
      docOf(entry("2026-03-02")),
    );
    expect(Object.keys(merged.entries).sort()).toEqual([
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("keeps the later edit when both hold the same day", () => {
    const merged = mergeDocs(
      docOf(
        entry("2026-03-01", {
          bleeding: false,
          updatedAt: "2026-03-01T08:00:00.000Z",
        }),
      ),
      docOf(
        entry("2026-03-01", {
          bleeding: true,
          updatedAt: "2026-03-01T20:00:00.000Z",
        }),
      ),
    );
    expect(merged.entries["2026-03-01"]!.bleeding).toBe(true);
  });

  it("keeps the local edit when it is the later one", () => {
    const merged = mergeDocs(
      docOf(
        entry("2026-03-01", {
          bleeding: true,
          updatedAt: "2026-03-01T20:00:00.000Z",
        }),
      ),
      docOf(
        entry("2026-03-01", {
          bleeding: false,
          updatedAt: "2026-03-01T08:00:00.000Z",
        }),
      ),
    );
    expect(merged.entries["2026-03-01"]!.bleeding).toBe(true);
  });

  it("agrees on the outcome whichever side is passed first", () => {
    const a = docOf(
      entry("2026-03-01", { updatedAt: "2026-03-01T20:00:00.000Z" }),
      entry("2026-03-03", { moodSwings: true }),
    );
    const b = docOf(
      entry("2026-03-01", {
        bleeding: true,
        updatedAt: "2026-03-02T20:00:00.000Z",
      }),
      entry("2026-03-05"),
    );
    expect(mergeDocs(a, b)).toEqual(mergeDocs(b, a));
  });

  it("is a no-op against an empty document", () => {
    const doc = docOf(entry("2026-03-01"));
    expect(mergeDocs(doc, emptyDoc())).toEqual(doc);
    expect(mergeDocs(emptyDoc(), doc)).toEqual(doc);
  });
});
