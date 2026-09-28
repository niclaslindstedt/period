// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `make store-preflight` reads the bundle id the way every build does — from
// APP_BUNDLE_ID, through native/identifiers.js — and checks the fastlane
// Appfile reads the same variable. It used to look for a `const BUNDLE_ID`
// literal in app.config.js, which the id stopped being when it became
// configuration, and failed on every checkout with "could not read BUNDLE_ID".

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Run the preflight under `env` and return its report. An empty value counts
 *  as unset, and wins over anything in a local native/.env. */
function preflight(env: Record<string, string>): string {
  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      join(root, "scripts", "store-preflight.mjs"),
    ],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  );
  return `${run.stdout}${run.stderr}`;
}

describe("store-preflight: the bundle id", () => {
  it("reads it from APP_BUNDLE_ID, as the builds and fastlane do", () => {
    const out = preflight({ APP_BUNDLE_ID: "se.example.cycle" });
    expect(out).not.toMatch(/could not read BUNDLE_ID/);
    expect(out).toMatch(/✓ bundle id se\.example\.cycle/);
  });

  it("names the variable when it is unset", () => {
    const out = preflight({ APP_BUNDLE_ID: "" });
    expect(out).toMatch(/✗ no bundle id \(APP_BUNDLE_ID\)/);
    expect(out).toMatch(/store-preflight: \d+ ready/);
  });

  it("refuses the development id", () => {
    const out = preflight({ APP_BUNDLE_ID: "dev.local.cycle" });
    expect(out).toMatch(/✗ APP_BUNDLE_ID is the development id/);
  });
});
