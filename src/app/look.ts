// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  DEFAULT_THEME_APPEARANCE,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";

import type { ThemeChoice } from "./useAppSettings.ts";

// The app's look. The framework ships a dozen palettes and a full appearance
// picker; this app exposes exactly two — one light, one dark — plus "follow
// the device". A tracker that gets fifteen seconds of attention a day earns
// nothing from a theme gallery, and every extra palette is another surface to
// keep legible.
//
// Everything else (font family, scale, density, elevation) stays at the
// framework defaults, except two: the sans font, because the report screen is
// prose and numbers rather than code, and the corner radius.
//
// The radius is the framework's largest preset. It is projected onto
// `--radius-sm` / `--radius-md` / `--radius-lg` on <html> at paint time, which
// is what every `rounded-*` utility in this app *and* in the framework's own
// components resolves against — so one line here rounds the buttons, the
// cards, the modals and the segmented controls together, and nothing can drift
// apart later by being styled one corner at a time. The two ends of the scale
// the engine does not write (`rounded` and `rounded-xl` upwards) are matched to
// it in `styles.css`, so the ramp stays in order.

/** The framework preset behind each of the three choices. */
const PRESET = {
  light: "githubLight",
  dark: "githubDark",
  system: "system",
} as const;

/** Project the user's theme choice onto the framework's appearance shape. */
export function appearanceFor(choice: ThemeChoice): ThemeAppearance {
  return {
    ...DEFAULT_THEME_APPEARANCE,
    theme: PRESET[choice],
    fontFamily: "sans",
    ui: { ...DEFAULT_THEME_APPEARANCE.ui, radius: "lg" },
  };
}

/** The look the app boots in before the persisted settings have been read —
 *  the same "follow the device" default `DEFAULT_SETTINGS` carries, so the
 *  first paint never flashes the wrong side. */
export const APP_LOOK: ThemeAppearance = appearanceFor("system");
