// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the web app and packs its `dist/` into one asset —
// `native/assets/webroot.zip` — that the wrapper bundles, unpacks on first
// launch and serves over a loopback HTTP server (src/local-server.ts). That is
// what makes the app self-contained: the cycle log runs entirely on-device,
// and changes only when a new build ships to the store.
//
// The web build is a plain `npm run build` at the repo root — base `/`, which
// is exactly what a localhost origin wants — and NOTHING in `src/` is changed
// for the app. If the wrapper ever needs the web app to behave differently,
// that is a sign it has stopped being thin. It sets two variables
// (`web-build-env.mjs`): VITE_EMBEDDED_BUILD, which leaves the web edition's
// link-preview tags and its GitHub Pages `CNAME` out of the build, and
// APP_DISPLAY_NAME, the listing name the top bar's wordmark carries (the
// project's own name in a plain checkout). See `vite.config.ts`.
//
// Usage:
//   node scripts/bundle-web.mjs                 # build the site, then zip it
//   node scripts/bundle-web.mjs --skip-build    # re-zip an existing dist/
//   node scripts/bundle-web.mjs --profile production
//
// `--profile` is passed through by the release scripts and the CI workflow.
// The web app has no profile-dependent output; the one thing it decides is
// that a `production` bundle must carry a listing name (APP_DISPLAY_NAME).
//
// The zip is a build artifact (gitignored). Generate it before `eas build`;
// the root `.easignore` is what keeps it in the EAS upload despite that.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

import { webBuildEnv } from "./web-build-env.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const DIST_DIR = join(REPO_DIR, "dist");
const OUT_ZIP = join(APP_DIR, "assets", "webroot.zip");
const WINDOWS = process.platform === "win32";
const NPM = WINDOWS ? "npm.cmd" : "npm";

const skipBuild = process.argv.includes("--skip-build");
const profileArg = process.argv.indexOf("--profile");
const profile =
  (profileArg >= 0 ? process.argv[profileArg + 1] : undefined) ??
  process.env.EAS_BUILD_PROFILE ??
  "preview";

if (!skipBuild) {
  let env;
  try {
    env = webBuildEnv(process.env, profile);
  } catch (error) {
    console.error(`\n✗ ${error.message}\n`);
    process.exit(1);
  }
  console.log(
    `• building the web app (npm run build) — profile ${profile}, ` +
      `named "${env.APP_DISPLAY_NAME}"…`,
  );
  execFileSync(NPM, ["run", "build"], {
    cwd: REPO_DIR,
    stdio: "inherit",
    // npm on Windows is a batch shim, which Node cannot execute directly.
    shell: WINDOWS,
    env,
  });
}

/** Collect `dist/` into the flat `{ "index.html": bytes }` shape fflate wants,
 *  with forward-slash paths relative to the dist root. */
function collect(dir, files = {}) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      collect(abs, files);
    } else {
      files[relative(DIST_DIR, abs).split("\\").join("/")] = new Uint8Array(
        readFileSync(abs),
      );
    }
  }
  return files;
}

let files;
try {
  files = collect(DIST_DIR);
} catch (error) {
  console.error(
    `\n✗ could not read ${DIST_DIR} — build the web app first ` +
      `(drop --skip-build, or run 'npm run build' at the repo root).\n`,
  );
  throw error;
}

const count = Object.keys(files).length;
if (count === 0 || !files["index.html"]) {
  throw new Error(
    `dist/ has no index.html (${count} files) — the web build looks empty.`,
  );
}

// A store app carries no link back to the source — no repository, issues,
// releases or sponsor link, and no trace of the author's GitHub handle at all,
// not even the web edition's host. That is an owner decision with no
// exceptions, and VITE_EMBEDDED_BUILD is what strips the site's own traces, so
// this is the check that nothing else carries one: any file that names the
// handle refuses the bundle.
const FORBIDDEN = "niclaslindstedt";
const tainted = Object.entries(files)
  .filter(([, bytes]) =>
    Buffer.from(bytes).toString("latin1").toLowerCase().includes(FORBIDDEN),
  )
  .map(([path]) => path);
if (tainted.length) {
  console.error(
    `\n✗ refusing the bundle: ${tainted.join(", ")} name(s) "${FORBIDDEN}". ` +
      `A store app carries no link to the source. Rebuild through this ` +
      `script (not --skip-build over a plain site build), or remove the ` +
      `trace at build time.\n`,
  );
  process.exit(1);
}

// Deterministic zip: every entry pinned to the ZIP epoch (1980-01-01), so the
// artifact is reproducible instead of drifting with the clock.
const zipped = zipSync(files, { mtime: new Date("1980-01-01T00:00:00Z") });
mkdirSync(dirname(OUT_ZIP), { recursive: true });
writeFileSync(OUT_ZIP, zipped);

console.log(
  `✓ wrote ${OUT_ZIP} — ${count} files, ${(zipped.length / 1024).toFixed(0)} KB`,
);
