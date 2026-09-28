// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The environment the phone wrapper builds the web app under — the one seam
// between this wrapper and the site it bundles, kept apart from
// `bundle-web.mjs` so a test can read it without running a build.
//
// Four variables, all read by the root `vite.config.ts`:
//
//   VITE_EMBEDDED_BUILD  "on": a store app, so no link back to the source.
//   VITE_SHELL_BUILD     "on": the site ships inside the binary, as in the
//                        desktop shell, so there is no service worker and no
//                        in-app update prompt — a new version arrives from
//                        the store.
//   VITE_NATIVE_BUILD    "on": this is the phone app, the one build that
//                        carries a store listing's name (`src/app/appName.ts`).
//   APP_DISPLAY_NAME     the name the app calls itself in its top bar — the
//                        listing name in a store build, so the
//                        wordmark inside the app matches the name under its
//                        icon. Resolved on `identifiers.js`'s rule, as
//                        `app.config.js` resolves `expo.name`, so the two
//                        cannot differ; a plain checkout falls back to the
//                        project's own name, "Cycle".
//
// A production bundle without APP_DISPLAY_NAME is refused, as `identifiers.js`
// refuses a production EAS build: the fallback is a development name, and a
// store binary must not ship under it.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PROJECT_NAME } = require("../identifiers.js");

/** The web build's environment, given the caller's and the EAS profile. The
 *  name follows `identifiers.js`'s rule for `DISPLAY_NAME`: the listing name
 *  when one is set, the project's own name otherwise. */
export function webBuildEnv(env, profile) {
  const listingName = env.APP_DISPLAY_NAME?.trim();
  if (profile === "production" && !listingName) {
    throw new Error(
      "APP_DISPLAY_NAME is not set. A production bundle carries the listing " +
        "name in its top bar — set it (the build workflow forwards the " +
        "repository secret). See RELEASING.md.",
    );
  }
  return {
    ...env,
    VITE_EMBEDDED_BUILD: "on",
    VITE_SHELL_BUILD: "on",
    VITE_NATIVE_BUILD: "on",
    APP_DISPLAY_NAME: listingName || PROJECT_NAME,
  };
}
