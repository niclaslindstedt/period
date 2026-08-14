// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState, type ReactNode } from "react";

import {
  MonthGrid,
  addMonths,
  dayKeyOf,
  parseDayKey,
  type DayKey,
  type GridCell,
  type WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@niclaslindstedt/oss-framework/components";

import { formatMonth } from "./format.ts";
import { useT } from "./i18n/index.ts";

// A month grid with a month-stepping header. The framework's `MonthGrid` is
// deliberately just the grid — it takes the year and month it paints and
// leaves paging to the caller — so this wraps it once with the header, the
// arrows, and the `PageUp`/`PageDown` wiring, and both the date picker and the
// Forecast calendar mount it instead of repeating that.
//
// `renderDay` passes straight through: the app's own markers (a droplet on a
// logged day, a ring on a predicted one) are drawn by the caller, which is the
// only side that knows what a day means.

type Props = {
  /** The day whose month the calendar opens on. */
  anchor: DayKey;
  selected?: DayKey | null;
  onSelect?: (day: DayKey) => void;
  max?: DayKey;
  weekStartsOn: WeekStart;
  renderDay?: (cell: GridCell) => ReactNode;
};

export function MonthCalendar({
  anchor,
  selected = null,
  onSelect,
  max,
  weekStartsOn,
  renderDay,
}: Props) {
  const t = useT();
  // The month on display. Seeded from the anchor and then owned here, so
  // paging away and tapping a day in another month both work.
  const [cursor, setCursor] = useState<DayKey>(anchor);
  const parts = parseDayKey(cursor) ?? parseDayKey(anchor);
  if (!parts) return null;

  const step = (delta: number) => setCursor(addMonths(cursor, delta));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t("report.prevMonth")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-fg-bright">
          {formatMonth(parts.year, parts.month)}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t("report.nextMonth")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
      <MonthGrid
        year={parts.year}
        month={parts.month}
        selected={selected}
        onSelect={onSelect}
        max={max}
        today={dayKeyOf(new Date())}
        weekStartsOn={weekStartsOn}
        onMonthNav={step}
        renderDay={renderDay}
        fixedWeeks
      />
    </div>
  );
}
