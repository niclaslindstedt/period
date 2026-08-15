// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo } from "react";

import type {
  DayKey,
  GridCell,
  WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import { CalendarIcon } from "@niclaslindstedt/oss-framework/components";

import type { CycleOptions } from "./cycle.ts";
import { DayCircle, DayLegend, toneFor } from "./DayCircle.tsx";
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
// `dayStatus` what its day is and paints the answer as a circle behind the
// number — so a day's colour here and the same day's colour in the Status
// screen's week row cannot come apart, and neither can disagree with the
// Forecast screen, since all three read one posterior.

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

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {/* `app-cycle-calendar` is the stylesheet hook that gives each day cell a
          stacking context of its own, so the circle `DayCircle` renders can sit
          under the day number instead of over it. See styles.css. */}
      <div className="app-cycle-calendar rounded-md border border-line bg-surface-3 p-3">
        <MonthCalendar
          anchor={today}
          weekStartsOn={weekStartsOn}
          renderDay={(cell: GridCell) => (
            <DayCircle tone={toneFor(dayStatus(cell.key, ctx))} />
          )}
        />
        <DayLegend showFertile={showFertileWindow} />
      </div>

      {ctx.forecast === null && (
        <div className="rounded-md border border-line bg-surface-3 p-6 text-center">
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
