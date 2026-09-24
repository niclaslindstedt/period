// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app's URL scheme is its bundle id.
//
// A one-word scheme (`cycle://`) can be claimed by any app on the phone, and
// whichever registered it last receives what was meant for this one — a
// sign-in's redirect included. RFC 8252 §7.1 asks a native app for a
// reverse-DNS scheme it controls, and the bundle id is exactly that. It comes
// from `native/identifiers.js` (APP_BUNDLE_ID, or the development id), so it
// is never committed as a literal, and this pins that it stays derived.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const native = join(dirname(fileURLToPath(import.meta.url)), "..", "native");
const require = createRequire(join(native, "app.config.js"));

type ExpoConfig = {
  expo: { scheme?: unknown; ios?: { bundleIdentifier?: unknown } };
};

/** Evaluate app.config.js afresh, under `env`. */
function loadConfig(env: Record<string, string | undefined>): ExpoConfig {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    for (const file of ["app.config.js", "identifiers.js"]) {
      delete require.cache[require.resolve(join(native, file))];
    }
    const make = require(join(native, "app.config.js")) as () => ExpoConfig;
    return make();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("the URL scheme", () => {
  afterEach(() => {
    for (const file of ["app.config.js", "identifiers.js"]) {
      delete require.cache[require.resolve(join(native, file))];
    }
  });

  it("is the development bundle id in a plain checkout", () => {
    const { expo } = loadConfig({ APP_BUNDLE_ID: undefined });
    expect(expo.scheme).toBe("dev.local.cycle");
    expect(expo.scheme).toBe(expo.ios?.bundleIdentifier);
  });

  it("follows APP_BUNDLE_ID in a store build", () => {
    const { expo } = loadConfig({ APP_BUNDLE_ID: "se.agilator.cycle" });
    expect(expo.scheme).toBe("se.agilator.cycle");
    expect(expo.scheme).toBe(expo.ios?.bundleIdentifier);
  });

  it("is never committed as a literal", () => {
    const config = readFileSync(join(native, "app.config.js"), "utf8");
    expect(config).toMatch(/^\s*scheme: BUNDLE_ID,$/m);
    expect(config).not.toMatch(/^\s*scheme:\s*["'`]/m);
  });
});
