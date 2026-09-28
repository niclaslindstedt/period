// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The name the app calls itself in its top bar (and names its navigation by).
//
// It is not a catalog string, because it is not copy: it is which deployment
// this is. The website and the desktop app are the project's own and say
// "Cycle". The phone app ships under a store listing, and its wordmark says
// what the icon on the home screen says — the listing name —
// which `native/scripts/bundle-web.mjs` passes to the web build as
// APP_DISPLAY_NAME. The listing name is configuration, never committed (see
// `native/identifiers.js`), so it arrives at build time through `vite.config.ts`
// as the `__APP_NAME__` define.

/** The project's own name — what every build is called unless a store
 *  listing names it otherwise. */
export const PROJECT_NAME = "Cycle";

/** The build environment {@link resolveAppName} reads. */
export type AppNameEnv = {
  VITE_EMBEDDED_BUILD?: string;
  VITE_SHELL_BUILD?: string;
  APP_DISPLAY_NAME?: string;
};

/**
 * The name a build carries: the listing name in the phone build (embedded in a
 * store app, and not the desktop shell), the project name everywhere else. A
 * stray APP_DISPLAY_NAME in a website or desktop build changes nothing — the
 * desktop app from GitHub Releases is the web edition, not a store listing.
 */
export function resolveAppName(env: AppNameEnv): string {
  const phone =
    env.VITE_EMBEDDED_BUILD === "on" && env.VITE_SHELL_BUILD !== "on";
  if (!phone) return PROJECT_NAME;
  return env.APP_DISPLAY_NAME?.trim() || PROJECT_NAME;
}

/** This build's name. Falls back to the project name where no define ran
 *  (the tests). */
export const APP_NAME: string =
  typeof __APP_NAME__ === "string" ? __APP_NAME__ : PROJECT_NAME;
