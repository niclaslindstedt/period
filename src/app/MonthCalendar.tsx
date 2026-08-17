// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useRef, useState, type ReactNode } from "react";

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
import { useSwipeNav } from "./useSwipeNav.ts";

// A month grid with a month-stepping header. The framework's `MonthGrid` is
// deliberately just the grid — it takes the year and month it paints and
// leaves paging to the caller — so this wraps it once with the header, the
// arrows, and the `PageUp`/`PageDown` wiring, and both the date picker and the
// Forecast calendar mount it instead of repeating that.
//
// `renderDay` passes straight through: the app's own markers (a droplet on a
// logged day, a ring on a predicted one) are drawn by the caller, which is the
// only side that knows what a day means.
//
// A swipe across the grid steps the month, and that is the same gesture the
// shell uses to move along the bottom nav (see `useSwipeNav.ts`). A grid of
// months is itself a row in a fixed left-to-right order, and it is the nearer
// one: a finger on the calendar means "the next month", not "the next tab".
// So the wrapper marks itself `data-swipe-ignore` — which stops the shell's
// swipe at this element — and then mounts the same hook on it, which reads its
// own marker as the claim it is rather than as a veto. Both mounts get it: the
// Calendar screen, and the Report screen's date picker inside its dialog.

type Props = {
  /** The day whose month the calendar opens on. */
  anchor: DayKey;
  selected?: DayKey | null;
  onSelect?: (day: DayKey) => void;
  max?: DayKey;
  /** Days this caller won't accept right now — the range picker greys out
   *  everything past its span cap once a start day is down. */
  isDisabled?: (day: DayKey) => boolean;
  weekStartsOn: WeekStart;
  renderDay?: (cell: GridCell) => ReactNode;
};

export function MonthCalendar({
  anchor,
  selected = null,
  onSelect,
  max,
  isDisabled,
  weekStartsOn,
  renderDay,
}: Props) {
  const t = useT();
  // The month on display. Seeded from the anchor and then owned here, so
  // paging away and tapping a day in another month both work.
  const [cursor, setCursor] = useState<DayKey>(anchor);
  // Updated from the month it is stepping *off*, so the callback identity
  // never changes — the swipe hook keys its listeners on it, and a new
  // function every render would tear them down and rebuild them every render.
  const step = useCallback((delta: number) => {
    setCursor((current) => addMonths(current, delta));
  }, []);

  const root = useRef<HTMLDivElement>(null);
  // A swipe leftward brings the next month in from the right, which is the
  // direction `useSwipeNav` reports as `1` — the same convention the bottom
  // nav moves in, so one gesture never means two different things.
  useSwipeNav(root, step);

  const parts = parseDayKey(cursor) ?? parseDayKey(anchor);
  if (!parts) return null;

  return (
    <div ref={root} data-swipe-ignore className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t("report.prevMonth")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
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
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
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
        isDisabled={isDisabled}
        today={dayKeyOf(new Date())}
        weekStartsOn={weekStartsOn}
        onMonthNav={step}
        renderDay={renderDay}
        fixedWeeks
      />
    </div>
  );
}
