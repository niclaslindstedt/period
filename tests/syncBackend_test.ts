// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stored backend choice (`readStoredBackend` in `src/app/useSyncEngine.ts`).
//
// The reports are health data, and they stay on this device or in the user's
// own Dropbox — and in the phone app, on this device alone. A stored choice
// the build does not offer must land on this device — never on a backend that
// silently does nothing, and never on a place the reports may not go.

import { afterEach, describe, expect, it, vi } from "vitest";

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

// The build's own flags, read once at load: stub them, reset the module
// registry, and load the engine afresh.
async function engineBuiltWith(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return import("../src/app/useSyncEngine.ts");
}

describe("which backends a build offers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("offers Dropbox on the website when the app key is configured", async () => {
    const engine = await engineBuiltWith({ VITE_DROPBOX_APP_KEY: "key" });
    expect(engine.DROPBOX_OFFERED).toBe(true);
    expect(engine.AVAILABLE_BACKENDS).toEqual(["local", "dropbox"]);
  });

  it("offers this device alone on the website without the key", async () => {
    const engine = await engineBuiltWith({ VITE_DROPBOX_APP_KEY: "" });
    expect(engine.AVAILABLE_BACKENDS).toEqual(["local"]);
  });

  it("offers no Dropbox in the phone app, even when given the key", async () => {
    const engine = await engineBuiltWith({
      VITE_NATIVE_BUILD: "on",
      VITE_DROPBOX_APP_KEY: "key",
    });
    expect(engine.DROPBOX_OFFERED).toBe(false);
    expect(engine.AVAILABLE_BACKENDS).toEqual(["local"]);
  });

  it("brings a phone app that had Dropbox chosen back to this device", async () => {
    const engine = await engineBuiltWith({
      VITE_NATIVE_BUILD: "on",
      VITE_DROPBOX_APP_KEY: "key",
    });
    const storage = memoryStorage({
      [KEY]: "dropbox",
      "cycle:sync:dropbox": '{"accessToken":"t","refreshToken":null}',
      [localCacheKey("dropbox", "cycle")]: "ciphertext",
      "cycle:doc": "the reports",
    });
    expect(engine.readStoredBackend(storage)).toBe("local");
    // The choice, the sign-in and the offline copy of the cloud file go; the
    // reports on this device stay.
    expect(Object.fromEntries(storage.map)).toEqual({
      [KEY]: "local",
      "cycle:doc": "the reports",
    });
  });
});
