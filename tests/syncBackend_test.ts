// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stored backend choice (`readStoredBackend` in `src/app/useSyncEngine.ts`).
//
// The reports are health data, and they stay on this device or in the user's
// own Dropbox. A stored choice the app no longer offers must land on this
// device — never on a backend that silently does nothing, and never on a place
// the reports may not go.

import { describe, expect, it } from "vitest";

import { localCacheKey } from "@niclaslindstedt/oss-framework/storage";

import { readStoredBackend } from "../src/app/useSyncEngine.ts";

const KEY = "cycle:sync:backend";

/** A stand-in for `localStorage`, over a plain map. */
function memoryStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("readStoredBackend", () => {
  it("is this device when nothing was chosen", () => {
    expect(readStoredBackend(memoryStorage())).toBe("local");
  });

  it("keeps Dropbox", () => {
    const storage = memoryStorage({ [KEY]: "dropbox" });
    expect(readStoredBackend(storage)).toBe("dropbox");
    expect(storage.map.get(KEY)).toBe("dropbox");
  });

  it("falls back to this device from the retired iCloud choice, and forgets it", () => {
    const storage = memoryStorage({
      [KEY]: "icloud",
      [localCacheKey("icloud", "cycle")]: '{"entries":{}}',
      "cycle:doc": "the reports",
    });
    expect(readStoredBackend(storage)).toBe("local");
    // The choice is rewritten and the offline copy of the cloud file goes;
    // the reports on this device are not the guard's to touch.
    expect(Object.fromEntries(storage.map)).toEqual({
      [KEY]: "local",
      "cycle:doc": "the reports",
    });
    // …so the next launch reads a plain "this device".
    expect(readStoredBackend(storage)).toBe("local");
  });

  it("is this device for any value it does not know", () => {
    for (const raw of ["gdrive", "folder", "", "iCloud"]) {
      expect(readStoredBackend(memoryStorage({ [KEY]: raw }))).toBe("local");
    }
  });
});
