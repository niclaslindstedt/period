// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the phone app's webroot must not carry, checked over the files
// `bundle-web.mjs` is about to zip — kept apart from it so a root test can
// drive the check without running a build.
//
//   - A service worker (`sw.js`). The site ships inside the binary and a new
//     version arrives from the store, so a worker would only serve the page
//     from its own cache of files already on the device — an app updated from
//     the store could go on showing the old site — and the update prompt would
//     announce a version nobody can install from inside the app.
//     VITE_SHELL_BUILD=on is what leaves it out; this is the check that the
//     build honoured it.
//   - The author's handle, anywhere. A store app carries no link back to the
//     source — no repository, issues, releases or sponsor link, and not the
//     web edition's host. VITE_EMBEDDED_BUILD=on strips the site's own traces;
//     this is the check that nothing else carries one.
//
// A `dist/` left by a website build — which `--skip-build` would re-zip —
// carries both.

/** The handle no file in a store app may name. */
export const FORBIDDEN = "niclaslindstedt";

/** A service worker, at any depth of the webroot. */
const WORKER = /(^|\/)sw\.(js|mjs)$/;

/**
 * Why a webroot must not ship, as one line per problem — empty when it may.
 * `files` maps each path (forward slashes, relative to the webroot) to its
 * bytes.
 */
export function webrootProblems(files) {
  const problems = [];
  const workers = Object.keys(files).filter((path) => WORKER.test(path));
  if (workers.length) {
    problems.push(
      `${workers.join(", ")}: a service worker — the phone app has none ` +
        `(VITE_SHELL_BUILD=on leaves it out)`,
    );
  }
  const tainted = Object.entries(files)
    .filter(([, bytes]) =>
      Buffer.from(bytes).toString("latin1").toLowerCase().includes(FORBIDDEN),
    )
    .map(([path]) => path);
  if (tainted.length) {
    problems.push(
      `${tainted.join(", ")}: name(s) "${FORBIDDEN}" — a store app carries ` +
        `no link to the source`,
    );
  }
  return problems;
}
