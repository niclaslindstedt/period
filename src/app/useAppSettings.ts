// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback } from "react";

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import type { WeekStart } from "@niclaslindstedt/oss-framework/calendar";

import { DEFAULT_CYCLE_OPTIONS, type CycleOptions } from "./cycle.ts";

// The app's own (non-theme) settings: which of the two themes is active, how
// the calendar is laid out, the cycle assumptions the forecast falls back on,
// and the developer knobs. The framework deliberately leaves this in the app;
// it only owns the appearance *projection*. Persisted to localStorage so a
// reload keeps your choices.

/** The theme choice. Deliberately three values and no more — one light, one
 *  dark, and "follow the device". No palette variations: a tracker you open
 *  for fifteen seconds a day does not need a theme gallery. */
export type ThemeChoice = "light" | "dark" | "system";

export type AppSettings = {
  theme: ThemeChoice;
  /** First day of the week in every calendar grid (`Date.getDay()` numbering:
   *  0 = Sunday, 1 = Monday). */
  weekStartsOn: WeekStart;
  /** Cycle length assumed until two periods have been logged. */
  defaultCycleLength: number;
  /** Period length assumed until one has been logged. */
  defaultPeriodLength: number;
  /** Days from ovulation to the next period start — the forecast counts back
   *  from the predicted start by this many days. */
  lutealPhaseLength: number;
  /** Show the predicted fertile window at all. Off for anyone tracking only
   *  their period, who would rather not read a fertility estimate every time
   *  they open the app. */
  showFertileWindow: boolean;
  /** Surface the developer affordances (the sync log panel, the raw document
   *  size) in Settings. */
  devMode: boolean;
  /** Mirror console output into the in-app log buffer. */
  captureLogs: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  // Follow the device out of the box: a cycle tracker is often opened in bed,
  // and the OS already knows whether that means dark.
  theme: "system",
  weekStartsOn: 1,
  defaultCycleLength: DEFAULT_CYCLE_OPTIONS.defaultCycleLength,
  defaultPeriodLength: DEFAULT_CYCLE_OPTIONS.defaultPeriodLength,
  lutealPhaseLength: DEFAULT_CYCLE_OPTIONS.lutealPhaseLength,
  showFertileWindow: true,
  devMode: false,
  captureLogs: false,
};

const STORAGE_KEY = "period:settings";

/** Clamp a stored number into a sane range, falling back when it isn't one.
 *  A hand-edited (or partially synced) settings blob must never be able to
 *  produce a forecast that divides by zero or predicts a 400-day cycle. */
function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseSettings(raw: string): AppSettings {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_SETTINGS;
  }
  const stored = parsed as Record<string, unknown>;
  const merged = { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
  return {
    ...merged,
    theme:
      merged.theme === "light" || merged.theme === "dark"
        ? merged.theme
        : "system",
    weekStartsOn: clampNumber(merged.weekStartsOn, 0, 6, 1) as WeekStart,
    defaultCycleLength: clampNumber(
      merged.defaultCycleLength,
      15,
      60,
      DEFAULT_SETTINGS.defaultCycleLength,
    ),
    defaultPeriodLength: clampNumber(
      merged.defaultPeriodLength,
      1,
      15,
      DEFAULT_SETTINGS.defaultPeriodLength,
    ),
    lutealPhaseLength: clampNumber(
      merged.lutealPhaseLength,
      8,
      20,
      DEFAULT_SETTINGS.lutealPhaseLength,
    ),
  };
}

export function useAppSettings() {
  // The framework hook owns the persistence mechanics (safe parse,
  // write-through); this store owns the key, the settings shape, and the
  // range clamping.
  const [settings, setSettings] = useLocalStorageState<AppSettings>(
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    { parse: parseSettings },
  );

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
      setSettings((prev) => ({ ...prev, [key]: value })),
    [setSettings],
  );

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [setSettings]);

  return { settings, update, reset, setSettings };
}

/** Project the persisted settings onto the shape `cycle.ts` takes. The fertile
 *  window's width is not user-tunable — it is the biology, not a preference —
 *  so those two fields always come from the module defaults. */
export function cycleOptions(s: AppSettings): CycleOptions {
  return {
    defaultCycleLength: s.defaultCycleLength,
    defaultPeriodLength: s.defaultPeriodLength,
    lutealPhaseLength: s.lutealPhaseLength,
    fertileWindowBefore: DEFAULT_CYCLE_OPTIONS.fertileWindowBefore,
    fertileWindowAfter: DEFAULT_CYCLE_OPTIONS.fertileWindowAfter,
  };
}
