// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app, built for real the way `native/scripts/bundle-web.mjs`
// builds it: its bundle and its page describe the phone app alone. The
// other builds' privacy sentence, the browser hint and the Dropbox file's
// path stay out — every gate tests VITE_NATIVE_BUILD where it stands, so
// Vite folds them away — and the page carries no HTML comment about a PWA
// or the web edition. The privacy policy the listing points at is linked.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Every file under `dir`, recursively. */
function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

describe("the real phone build", () => {
  it("names no other edition, and links to the privacy policy", () => {
    const out = mkdtempSync(join(tmpdir(), "cycle-phone-"));
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            key !== "NODE_ENV" &&
            !key.startsWith("VITEST") &&
            !key.startsWith("VITE_"),
        ),
      );
      execFileSync(
        process.execPath,
        [
          join("node_modules", "vite", "bin", "vite.js"),
          "build",
          "--outDir",
          out,
          "--emptyOutDir",
          "--logLevel",
          "error",
        ],
        {
          env: {
            ...env,
            VITE_EMBEDDED_BUILD: "on",
            VITE_SHELL_BUILD: "on",
            VITE_NATIVE_BUILD: "on",
            VITE_DROPBOX_APP_KEY: "a-key",
          },
          stdio: "pipe",
        },
      );
      const bundle = [...files(out)]
        .filter((path) => /\.(?:html|js)$/.test(path))
        .map((path) => readFileSync(path, "utf8"))
        .join("\n");
      expect(bundle).toContain("there is no cloud copy");
      expect(bundle).not.toMatch(/connect a cloud account yourself/);
      expect(bundle).not.toMatch(/the browser's storage settings/);
      expect(bundle).not.toContain("Apps/cycle/");
      expect(bundle).not.toMatch(
        /github pages|static site|the website|no account/i,
      );
      expect(bundle).toContain("https://apps.agilator.se/cycle/privacy/");

      const html = readFileSync(join(out, "index.html"), "utf8");
      expect(html).not.toMatch(/<!--|og:|twitter:|\bPWA\b|browser|Dropbox/i);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
