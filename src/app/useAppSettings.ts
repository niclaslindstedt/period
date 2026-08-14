// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback } from "react";

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import type { WeekStart } from "@niclaslindstedt/oss-framework/calendar";

import { DEFAULT_CYCLE_OPTIONS, type CycleOptions } from "./cycle.ts";
import {
  DEFAULT_CHART_LOOK,
  type ChartLook,
  type ChartMark,
  type ChartView,
} from "./ForecastChart.tsx";
import type { ForecastModelKind } from "./forecastModel.ts";
import type { TemperatureUnit } from "./temperature.ts";

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
  /** Which unit waking temperatures are read and typed in. A display choice
   *  only — the document always stores Celsius (see `temperature.ts`). */
  temperatureUnit: TemperatureUnit;
  /** How much of the forecast's workings are on screen. Both settings show the
   *  same prediction; `advanced` adds the model's parameters, the learned
   *  patterns, and its backtested track record. */
  forecastDetail: "simple" | "advanced";
  /** Which reports the forecast is allowed to read: the cycle history alone,
   *  or that plus this cycle's mood swings and temperatures. */
  forecastModel: ForecastModelKind;
  /** How the probability chart is drawn. Appearance only — none of these
   *  change a number, which is why they are not behind `forecastDetail`. */
  chartMark: ChartMark;
  chartView: ChartView;
  chartBands: boolean;
  chartComparePrior: boolean;
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
  temperatureUnit: "c",
  // Simple by default: the forecast's job is one date and how sure it is, and
  // most people never need to see the machinery behind it.
  forecastDetail: "simple",
  // Multivariate by default because it costs nothing to be right more often —
  // with too little history to learn a pattern it falls back to the cycle-only
  // answer on its own, so there is no early-days penalty to opt out of.
  forecastModel: "multivariate",
  chartMark: DEFAULT_CHART_LOOK.mark,
  chartView: DEFAULT_CHART_LOOK.view,
  chartBands: DEFAULT_CHART_LOOK.showBands,
  chartComparePrior: DEFAULT_CHART_LOOK.showPrior,
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
    // Enumerations get the same treatment the numbers do: a stored value this
    // build does not recognise falls back rather than reaching a `switch` that
    // has no case for it.
    temperatureUnit: merged.temperatureUnit === "f" ? "f" : "c",
    forecastDetail:
      merged.forecastDetail === "advanced" ? "advanced" : "simple",
    forecastModel:
      merged.forecastModel === "univariate" ? "univariate" : "multivariate",
    chartMark: merged.chartMark === "curve" ? "curve" : "bars",
    chartView: merged.chartView === "cumulative" ? "cumulative" : "daily",
    chartBands: merged.chartBands !== false,
    chartComparePrior: merged.chartComparePrior === true,
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

/** Project the persisted settings onto the shape the forecast chart takes. */
export function chartLook(s: AppSettings): ChartLook {
  return {
    mark: s.chartMark,
    view: s.chartView,
    showBands: s.chartBands,
    showPrior: s.chartComparePrior,
  };
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
