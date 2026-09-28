// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Types for `web-build-env.mjs`, which the root tests import.

/** The web build's environment for the phone bundle: the caller's, plus
 *  VITE_EMBEDDED_BUILD and the resolved APP_DISPLAY_NAME. Throws for a
 *  `production` profile with no APP_DISPLAY_NAME. */
export function webBuildEnv(
  env: Record<string, string | undefined>,
  profile: string,
): Record<string, string | undefined> & {
  VITE_EMBEDDED_BUILD: "on";
  APP_DISPLAY_NAME: string;
};
