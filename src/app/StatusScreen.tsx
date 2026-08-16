// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo } from "react";

import {
  parseDayKey,
  type DayKey,
} from "@niclaslindstedt/oss-framework/calendar";

import { forecast, type CycleOptions } from "./cycle.ts";
import {
  DayLegend,
  DayMark,
  markFor,
  toneFor,
  type DayTone,
} from "./DayMark.tsx";
import {
  dayStatus,
  statusStrip,
  type DayStatus,
  type StatusContext,
} from "./dayStatus.ts";
import {
  probabilisticForecast,
  type ForecastModelKind,
} from "./forecastModel.ts";
import { formatDay, formatWeekday, probabilityPercent } from "./format.ts";
import { HeartIcon } from "@niclaslindstedt/oss-framework/components";
import { useT, type TFn } from "./i18n/index.ts";
import type { AppData } from "./types.ts";

// The first screen: what today *is*, in one word, with the honest number
// attached to it.
//
// Everything else in the app answers a question you had to think of first —
// when is it due, what did last month look like, how variable am I. This one
// answers the question you opened the app with, and it fits above the fold on
// a phone: the word, how sure the word is, and a week of days either side of
// today so "am I about to be" and "was I" are one glance rather than two taps.
//
// The number beside the word is not a decoration and not a rounding of a
// feeling. It is posterior mass out of the same fit the Forecast screen draws
// (see `dayStatus.ts`), so a confident-sounding word can never appear over a
// distribution that does not support it — and on a two-cycle history the
// percentage says so by being low.

/** How many days either side of today the week row shows. Three and three
 *  makes seven, which is a week wide enough to hold a whole fertile window and
 *  narrow enough that each cell still fits a tappable number on a 375px
 *  phone. */
const DAYS_BACK = 3;
const DAYS_AHEAD = 3;

/** The row is derived one day wider at each end than it is drawn. A period is
 *  painted as one stroke across the days it covers, and whether the last cell
 *  gets a rounded cap or runs on off the edge of the week depends on a day the
 *  row does not show — so it is computed and then dropped. */
const PADDING_DAYS = 1;

type Props = {
  data: AppData;
  today: DayKey;
  options: CycleOptions;
  showFertileWindow: boolean;
  model: ForecastModelKind;
};

export function StatusScreen({
  data,
  today,
  options,
  showFertileWindow,
  model,
}: Props) {
  const t = useT();

  const probabilistic = useMemo(
    () => probabilisticForecast(data, today, model, options),
    [data, today, model, options],
  );
  const f = useMemo(
    () => forecast(data, today, options),
    [data, today, options],
  );
  const ctx = useMemo<StatusContext>(
    () => ({
      data,
      forecast: probabilistic,
      options,
      showFertileWindow,
    }),
    [data, probabilistic, options, showFertileWindow],
  );

  const strip = useMemo(
    () =>
      statusStrip(
        today,
        DAYS_BACK + PADDING_DAYS,
        DAYS_AHEAD + PADDING_DAYS,
        ctx,
      ),
    [today, ctx],
  );
  const now = useMemo(() => dayStatus(today, ctx), [today, ctx]);

  if (!probabilistic) {
    return (
      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="rounded-2xl border border-line bg-surface-3 p-6 text-center">
          <HeartIcon className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-muted">{t("status.noHistory")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
        <p className="text-xs font-bold tracking-wide text-accent uppercase">
          {t("status.today")}
        </p>
        <p className="mt-1 text-3xl font-bold text-fg-bright">
          {statusLabel(t, now.kind)}
        </p>

        {/* The word above is a call; this is the size of the bet behind it. A
            reported day is not a bet at all, so it says where it came from
            instead of quoting a probability of a fact. */}
        <p className="mt-2 text-sm text-fg">
          {now.observed
            ? t("status.fromYourReport")
            : t("status.certainty", {
                percent: probabilityPercent(now.probability),
              })}
        </p>
        {!now.observed && (
          <p className="mt-0.5 text-xs text-muted">
            {t("status.certaintyHint")}
          </p>
        )}

        {f.cycleDay !== null && (
          <p className="mt-3 text-sm text-fg">
            {t("forecast.cycleDay", { day: String(f.cycleDay) })}
          </p>
        )}
        <p className="mt-0.5 text-sm text-fg">
          {t("forecast.nextPeriod")}: {formatDay(probabilistic.expectedDay)} —{" "}
          {whenLine(t, probabilistic.daysUntilExpected)}
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface-3 p-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {t("status.week")}
        </p>
        <WeekRow strip={strip} today={today} />
        <DayLegend showFertile={showFertileWindow} />
      </div>

      <p className="px-1 text-xs leading-snug text-muted">
        {t("forecast.disclaimer")}
      </p>
    </div>
  );
}

/** The days either side of today, each painted the colour its status earns.
 *  Read-only: the row is a readout, and the Report screen is where a day is
 *  edited.
 *
 *  `strip` arrives a day longer at each end than the row shows (see
 *  `PADDING_DAYS`): the extra days are what tell the visible ends whether their
 *  stroke stops there or carries on past the week, and they are dropped before
 *  anything is drawn. */
function WeekRow({ strip, today }: { strip: DayStatus[]; today: DayKey }) {
  const t = useT();
  const tones = new Map<DayKey, DayTone>(
    strip.map((status) => [status.day, toneFor(status)]),
  );
  const toneAt = (day: DayKey): DayTone => tones.get(day) ?? "none";
  return (
    <ul className="mt-2 grid grid-cols-7 gap-1">
      {strip.slice(PADDING_DAYS, strip.length - PADDING_DAYS).map((status) => {
        const isToday = status.day === today;
        const dayOfMonth = parseDayKey(status.day)?.day ?? "";
        return (
          <li
            key={status.day}
            className="flex flex-col items-center gap-1 text-center"
          >
            <span className="text-[0.65rem] leading-none text-muted">
              {formatWeekday(status.day)}
            </span>
            {/* `isolate` gives the cell a stacking context so the mark's
                negative stack level stays under this number and nothing
                else. */}
            <span
              aria-label={`${formatDay(status.day)}: ${statusLabel(t, status.kind)}`}
              className={`relative isolate flex aspect-square w-full items-center justify-center rounded-full text-sm tabular-nums ${
                isToday ? "font-bold text-accent" : "text-fg"
              }`}
            >
              <DayMark {...markFor(status.day, toneAt)} />
              {dayOfMonth}
            </span>
            <span
              className={`h-1 w-1 rounded-full ${isToday ? "bg-accent" : "bg-transparent"}`}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** The status of a day, as a word. */
function statusLabel(t: TFn, kind: DayStatus["kind"]): string {
  return t(`status.kind.${kind}` as const);
}

/** "in 5 days" / "tomorrow" / "expected today" / "3 days late" — the same
 *  sentence the Forecast screen's headline uses, from the same number. */
function whenLine(t: TFn, days: number): string {
  if (days > 1) return t("forecast.inDays", { count: String(days) });
  if (days === 1) return t("forecast.tomorrow");
  if (days === 0) return t("forecast.todayIs");
  return t("forecast.overdue", { count: String(-days) });
}
