// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo } from "react";

import type {
  DayKey,
  GridCell,
  WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import { CalendarIcon } from "@niclaslindstedt/oss-framework/components";

import type { CycleOptions } from "./cycle.ts";
import {
  DayLegend,
  DayMark,
  markFor,
  toneFor,
  type DayTone,
} from "./DayMark.tsx";
import { dayStatus, type StatusContext } from "./dayStatus.ts";
import {
  probabilisticForecast,
  type ForecastModelKind,
} from "./forecastModel.ts";
import { useT } from "./i18n/index.ts";
import { MonthCalendar } from "./MonthCalendar.tsx";
import type { AppData } from "./types.ts";

// The month view — the whole cycle at a glance, past and ahead.
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

type Props = {
  data: AppData;
  today: DayKey;
  options: CycleOptions;
  showFertileWindow: boolean;
  weekStartsOn: WeekStart;
  model: ForecastModelKind;
};

export function CalendarScreen({
  data,
  today,
  options,
  showFertileWindow,
  weekStartsOn,
  model,
}: Props) {
  const t = useT();

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
      <div className="app-cycle-calendar rounded-2xl border border-line bg-surface-3 p-3">
        <MonthCalendar
          anchor={today}
          weekStartsOn={weekStartsOn}
          renderDay={(cell: GridCell) => (
            <DayMark {...markFor(cell.key, toneAt)} />
          )}
        />
        <DayLegend showFertile={showFertileWindow} />
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
    </div>
  );
}
