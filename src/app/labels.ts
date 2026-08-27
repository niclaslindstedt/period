// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Domain value → translated label, in one place. Every screen that shows a
// cycle phase reads it from here, so a wording change lands everywhere at once
// and the catalog keys stay mechanically derivable from the union type.

import { addDays, type DayKey } from "@niclaslindstedt/oss-framework/calendar";

import type { CyclePhase } from "./cycle.ts";
import { formatDay } from "./format.ts";
import type { TFn } from "./i18n/index.ts";

export function phaseLabel(t: TFn, phase: CyclePhase): string {
  return t(`history.phase.${phase}` as const);
}

/**
 * A day as a heading.
 *
 * "Today" and "Yesterday" carry more than a date does — they are the two days
 * almost every report is filed for — and every other day is the app's one date
 * form (see `formatDay`). Both the Report screen's date card and the Calendar
 * screen's day editor name a day this way, which is the reason it is here and
 * not in either of them.
 */
export function dayHeadline(t: TFn, day: DayKey, today: DayKey): string {
  if (day === today) return t("common.today");
  if (day === addDays(today, -1)) return t("common.yesterday");
  return formatDay(day);
}

/** A number of days, said the way the catalog says it — a count with its noun,
 *  and the singular spelled out rather than assembled from "1" and "days". */
export function dayCount(t: TFn, days: number): string {
  return days === 1
    ? t("common.day")
    : t("common.days", { count: String(days) });
}
