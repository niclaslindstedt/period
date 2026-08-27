// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useMemo, useRef, useState } from "react";

import type {
  DayKey,
  DayRange,
  GridCell,
  WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import {
  CalendarIcon,
  PencilIcon,
} from "@niclaslindstedt/oss-framework/components";

import { isSingleDay } from "./bulk.ts";
import type { CycleOptions } from "./cycle.ts";
import { DayEditModal } from "./DayEditModal.tsx";
import {
  DayLegend,
  DayMark,
  markFor,
  toneFor,
  type DayTone,
} from "./DayMark.tsx";
import {
  NO_SELECTION,
  blockedDuring,
  hold,
  tap,
  type DaySelection,
} from "./daySelection.ts";
import { dayStatus, type StatusContext } from "./dayStatus.ts";
import {
  probabilisticForecast,
  type ForecastModelKind,
} from "./forecastModel.ts";
import { useT } from "./i18n/index.ts";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { RangeEditModal } from "./RangeEditModal.tsx";
import type { TemperatureUnit } from "./temperature.ts";
import { useDayPress } from "./useDayPress.ts";
import type { DocStore } from "./useDocStore.ts";

// The month view — the whole cycle at a glance, past and ahead, and the place a
// report gets corrected.
//
// It used to be the last section of the Forecast screen, under the chart, the
// model panel and the track record. That put the one part of the forecast
// people actually navigate by (which weekend is that, then?) behind three
// screens of scrolling, and left the Forecast screen answering two different
// questions with two different instruments. Here it is the whole screen, opens
// on the current month, and pages either way.
//
// The colouring is the app's, the grid is the framework's. Every cell asks
// `dayStatus` what its day is and paints the answer behind the number — so a
// day's colour here and the same day's colour in the Status screen's week row
// cannot come apart, and neither can disagree with the Forecast screen, since
// all three read one posterior.
//
// A cell also asks about the two days either side of it, because a period and a
// fertile window are spans and are drawn as one stroke across the days they
// cover (see `DayMark.tsx`). The grid hands over one cell at a time and nothing
// else, so the run's ends are found by looking at the neighbours rather than by
// assembling spans — which also means a run reaching past the edge of the month
// on display is drawn open-ended without this screen having to notice.
//
// ## Pressing a day
//
// A month is where a mistake is *visible* — the mark on the 8th says bleeding
// and there was none, or a fortnight is logged against the wrong month — so it
// is also where the fix belongs. A tap opens that day's report (see
// `DayEditModal.tsx`); a press and hold anchors a span and the next tap closes
// it, which opens the batch editor (see `RangeEditModal.tsx`). Both can delete,
// which is the whole point of the arrangement: before it, removing a report
// meant going to the Report screen, opening its date picker, and finding the
// day you were already looking at.
//
// The rules about which press means what are in `daySelection.ts`, and the
// hold itself is in `useDayPress.ts`. What is left here is the wiring, and one
// decision: **the hold is never the only way in.** A gesture with no visible
// control is a feature only the person who wrote it knows about, and nobody
// holds anything with a keyboard — so the line under the legend carries a
// button that arms the same selection, and says out loud that holding does it
// too.
//
// A one-day span opens the day editor rather than the batch one. It is the same
// day either way, and the day editor is the better dialog for it: it seeds from
// what is stored rather than from blank, and it can change a temperature.

type Props = {
  store: DocStore;
  today: DayKey;
  options: CycleOptions;
  showFertileWindow: boolean;
  weekStartsOn: WeekStart;
  model: ForecastModelKind;
  temperatureUnit: TemperatureUnit;
  onNotice: (message: string) => void;
};

export function CalendarScreen({
  store,
  today,
  options,
  showFertileWindow,
  weekStartsOn,
  model,
  temperatureUnit,
  onNotice,
}: Props) {
  const t = useT();
  const data = store.data;

  const ctx = useMemo<StatusContext>(
    () => ({
      data,
      forecast: probabilisticForecast(data, today, model, options),
      options,
      showFertileWindow,
    }),
    [data, today, model, options, showFertileWindow],
  );

  // Asked for three days per cell — the day and both its neighbours — so a
  // month costs three times the status calls it draws. Left uncached anyway:
  // `dayStatus` only sums mass out of the posterior that was already fitted
  // above, so a month of it is a few thousand additions, and a cache keyed by
  // day would be one more thing that can hold a stale answer after an edit.
  const toneAt = (day: DayKey): DayTone => toneFor(dayStatus(day, ctx));

  // Where the two-tap gesture is, and which editor is open. The selection is
  // dropped the moment an editor opens: what the dialog does next is about the
  // days it was handed, and a half-made selection sitting behind it would be
  // waiting for a tap that is no longer about the calendar.
  const [selection, setSelection] = useState<DaySelection>(NO_SELECTION);
  const [editing, setEditing] = useState<DayKey | null>(null);
  const [batch, setBatch] = useState<DayRange | null>(null);

  const open = (day: DayKey) => {
    setSelection(NO_SELECTION);
    setEditing(day);
  };

  const select = (day: DayKey) => {
    const action = tap(selection, day, today);
    if (action.do === "edit") open(action.day);
    else if (action.do === "anchor") {
      setSelection({ kind: "anchored", anchor: action.day });
    } else if (action.do === "range") {
      setSelection(NO_SELECTION);
      // One day is one day, whichever gesture picked it.
      if (isSingleDay(action.range)) open(action.range.start);
      else setBatch(action.range);
    }
  };

  const grid = useRef<HTMLDivElement>(null);
  useDayPress(
    grid,
    useCallback(
      (day: DayKey) => {
        const action = hold(day, today);
        if (action.do === "anchor") {
          setSelection({ kind: "anchored", anchor: action.day });
        }
      },
      [today],
    ),
  );

  return (
    // Centred in the leftover height rather than parked at the top. A month
    // grid is a fixed six rows and this screen is only ever that grid, its
    // legend and one line of small print — on a tall phone the difference is
    // 150px of dead surface under the card versus half of it above and half
    // below, with the grid under the thumb either way.
    <div className="flex flex-1 flex-col justify-center gap-3 px-3 py-3">
      {/* `app-cycle-calendar` is the stylesheet hook that gives each day cell a
          stacking context of its own, so the mark `DayMark` renders can sit
          under the day number instead of over it. See styles.css. */}
      <div
        ref={grid}
        className="app-cycle-calendar rounded-2xl border border-line bg-surface-3 p-3"
      >
        <MonthCalendar
          anchor={today}
          weekStartsOn={weekStartsOn}
          selected={selection.kind === "anchored" ? selection.anchor : null}
          onSelect={select}
          // Only while a span is being picked: the days that cannot close it
          // grey out, so the cap and the "up to today" rule are visible in the
          // grid rather than discovered by a tap that does nothing.
          isDisabled={blockedDuring(selection, today)}
          renderDay={(cell: GridCell) => (
            <>
              <DayMark {...markFor(cell.key, toneAt)} />
              {/* The day key, carried into the framework's cell so a press can
                  read it back off the DOM — the grid's own markup offers no
                  other handle on which day was held. See `useDayPress.ts`. */}
              <span hidden data-day={cell.key} />
            </>
          )}
        />
        <DayLegend showFertile={showFertileWindow} />
        <SelectionBar
          selection={selection}
          onArm={() => setSelection({ kind: "arming" })}
          onCancel={() => setSelection(NO_SELECTION)}
        />
      </div>

      {ctx.forecast === null && (
        <div className="rounded-2xl border border-line bg-surface-3 p-6 text-center">
          <CalendarIcon className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-muted">{t("calendar.noHistory")}</p>
        </div>
      )}

      <p className="px-1 text-xs leading-snug text-muted">
        {t("forecast.disclaimer")}
      </p>

      {/* Mounted per day and per span, and keyed on them: each dialog seeds a
          draft from the document at the moment it opens, so a fresh mount is
          how it is guaranteed to open on the day it was asked for. */}
      {editing !== null && (
        <DayEditModal
          key={editing}
          day={editing}
          store={store}
          today={today}
          temperatureUnit={temperatureUnit}
          onClose={() => setEditing(null)}
          onNotice={onNotice}
        />
      )}
      {batch !== null && (
        <RangeEditModal
          key={`${batch.start}/${batch.end}`}
          range={batch}
          store={store}
          onClose={() => setBatch(null)}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}

/**
 * The line under the legend: what a press does, and how to start a selection
 * without one.
 *
 * It is the same row in all three states rather than an element that appears
 * when the gesture starts, because the grid above it is a fixed six rows and
 * anything that changes height under it would move the whole card — on a
 * centred screen, a hint arriving would slide the month out from under the
 * thumb that is mid-gesture.
 */
function SelectionBar({
  selection,
  onArm,
  onCancel,
}: {
  selection: DaySelection;
  onArm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const picking = selection.kind !== "off";
  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
      <p className="min-w-0 text-xs leading-snug text-muted">
        {selection.kind === "anchored"
          ? t("calendar.selectEndHint")
          : selection.kind === "arming"
            ? t("calendar.selectStartHint")
            : t("calendar.pressHint")}
      </p>
      <button
        type="button"
        onClick={picking ? onCancel : onArm}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
          picking
            ? "border-accent text-accent hover:bg-surface-2"
            : "border-line text-muted hover:border-accent/60 hover:bg-surface-2 hover:text-fg"
        }`}
      >
        {!picking && <PencilIcon className="h-3.5 w-3.5" />}
        {picking ? t("common.cancel") : t("calendar.selectDays")}
      </button>
    </div>
  );
}
