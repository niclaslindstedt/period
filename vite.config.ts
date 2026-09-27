// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import { appPwa } from "./pwa-plugin.ts";

// The base path is injected by the deploy workflow via VITE_BASE, one per
// release channel on the custom domain (cycle.niclaslindstedt.se): the
// released app at `/` and the rolling main build at `/preview/`. Defaults to
// `/` for local dev and preview builds.
const base = process.env.VITE_BASE ?? "/";

// Sibling release channels that live *under* this build's base and must be
// disowned by its service worker (see pwa-plugin.ts `ignorePaths`). Only the
// root release sets this — comma-separated absolute paths, e.g. `/preview/`.
const ignorePaths = (process.env.VITE_PWA_IGNORE_PATHS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// Build identity for the Settings → About grid.
const commit =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
      }).trim();
    } catch {
      return "unknown";
    }
  })();
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? "dev";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The app's released version, the base of the About build label.
const appVersion = (
  JSON.parse(readFileSync(here("./package.json"), "utf8")) as {
    version: string;
  }
).version;

// The build identifier shown in Settings → About. Shape:
// `<version>[.<run>][-<slot>][+<commit>]` — `<run>` is the CI run number,
// `<slot>` is `pre` for the `/preview/` deploy (omitted for the production `/`
// build), and `<commit>` is the short commit hash as semver build metadata. A
// local build collapses to just `<version>`.
const buildSlot = base === "/preview/" ? "pre" : "";
const buildLabel =
  appVersion +
  (process.env.GITHUB_RUN_NUMBER ? `.${process.env.GITHUB_RUN_NUMBER}` : "") +
  (buildSlot ? `-${buildSlot}` : "") +
  (process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : "");

// The label the PWA update toast shows for the incoming build. It also lands
// in the generated `sw.js`, so the worker's bytes change every deploy and the
// browser reliably discovers the update; a CI build's label carries the run
// number and commit, so it is unique per deploy. A local build's label
// collapses to just `<version>`, so append a timestamp there to keep the
// per-build uniqueness the worker relies on.
const version = process.env.GITHUB_SHA
  ? buildLabel
  : `${buildLabel}+${new Date().toISOString()}`;

// A build for the DESKTOP SHELL (tauri/), set by `tauri/scripts/bundle-web.mjs`.
//
// It changes exactly one thing, and it is about the medium rather than the
// audience: the service worker is left out (`serviceWorker: false` below —
// everything else `appPwa` writes into the `<head>` still applies). A desktop
// build has no deployment to discover an update from — a new version arrives
// as a new binary — so a worker here would precache a copy of files already on
// local disk and then serve the page from ITS copy. `__SHELL_BUILD__` carries
// the same fact into the app, where it switches off the update prompt that has
// nothing left to prompt about.
const shellBuild = process.env.VITE_SHELL_BUILD === "on";

// A build EMBEDDED in a store app — the phone wrapper's
// `native/assets/webroot.zip` and the desktop shell's `tauri/webroot/` — set
// by both `bundle-web.mjs` scripts. A store app carries no link back to the
// source or to the web edition's host, by owner decision and without
// exception, so this build leaves out the two things in the site that name
// them: the Open Graph and Twitter Card tags (the web edition's URL, there
// only for link previews of it) and the GitHub Pages `CNAME`. Nothing in
// `src/` changes. The bundle scripts refuse a bundle that still names the
// author's handle anywhere, so a new trace fails the build instead of
// shipping.
const embeddedBuild = process.env.VITE_EMBEDDED_BUILD === "on";

function embedded(): Plugin {
  let outDir = "";
  return {
    name: "embedded-build",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return html
        .replace(/\n\s*<!-- (?:Open Graph|Twitter Card) -->/g, "")
        .replace(
          /\n\s*<meta\b[^>]*\b(?:property="og:|name="twitter:)[^>]*>/g,
          "",
        );
    },
    // Public files are copied before the bundle is written, so by now the
    // `CNAME` is in `dist/`.
    writeBundle() {
      rmSync(join(outDir, "CNAME"), { force: true });
    },
  };
}

export default defineConfig({
  base,
  define: {
    __SHELL_BUILD__: JSON.stringify(shellBuild),
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
  },
  // No size budgets, by owner decision: the chunk-size warning never fires.
  build: { chunkSizeWarningLimit: Infinity },
  // `appPwa` only applies on build, so dev keeps registering no worker (the
  // app passes `enabled: !import.meta.env.DEV` to `usePwaUpdate`).
  //
  // The runtime is Preact, not React: `@preact/preset-vite` compiles JSX
  // against `preact/jsx-runtime` and aliases `react` / `react-dom` (and the
  // `/jsx-runtime` + `/client` subpaths) onto `preact/compat`, so both this
  // app's `import … from "react"` lines and the pre-built framework chunks —
  // which import `react`, `react-dom`, and `react/jsx-runtime` as externals —
  // resolve to Preact. Nothing from React itself reaches the bundle; see
  // `docs/architecture.md`.
  plugins: [
    preact(),
    tailwindcss(),
    appPwa({ base, version, ignorePaths, serviceWorker: !shellBuild }),
    ...(embeddedBuild ? [embedded()] : []),
  ],
});
