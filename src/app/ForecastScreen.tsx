// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo } from "react";

import {
  daysBetween,
  type DayKey,
  type GridCell,
  type WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import { Section } from "@niclaslindstedt/oss-framework/components";

import {
  cycleStats,
  forecast,
  upcomingStarts,
  type CycleOptions,
} from "./cycle.ts";
import { formatDay, formatShortDay } from "./format.ts";
import { DropletFilledIcon, ForecastIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { isBleeding, type AppData } from "./types.ts";

// The "so what?" screen: where you are in the cycle, when the next period is
// due, and — unless the user turned it off — the fertile window around the
// projected ovulation.
//
// Everything here is derived on the fly from the reports (see `cycle.ts`), so
// there is nothing to refresh and nothing that can go stale. The confidence
// line is not decoration: a prediction from two cycles and one from twelve
// look identical otherwise, and only one of them deserves to be believed.

type Props = {
  data: AppData;
  today: DayKey;
  options: CycleOptions;
  showFertileWindow: boolean;
  weekStartsOn: WeekStart;
};

/** Whether a day falls inside an inclusive range of `DayKey`s. */
function within(
  day: DayKey,
  start: DayKey | null,
  end: DayKey | null,
): boolean {
  return start !== null && end !== null && day >= start && day <= end;
}

export function ForecastScreen({
  data,
  today,
  options,
  showFertileWindow,
  weekStartsOn,
}: Props) {
  const t = useT();
  const f = useMemo(
    () => forecast(data, today, options),
    [data, today, options],
  );
  // The sample size the confidence line quotes — how many complete cycles the
  // typical length was drawn from.
  const trackedCycles = useMemo(
    () => cycleStats(data).cycleLengths.length,
    [data],
  );
  // Three cycles ahead is enough to answer "will it clash with the holiday?"
  // without pretending the fourth one is knowable.
  const upcoming = useMemo(() => upcomingStarts(f, 3), [f]);

  if (!f.nextStart || f.cycleDay === null) {
    return (
      <div className="flex flex-col gap-3 px-3 py-3">
        <EmptyState message={t("forecast.noHistory")} />
      </div>
    );
  }

  const daysUntil = f.daysUntilNext ?? 0;
  const whenLine =
    daysUntil > 1
      ? t("forecast.inDays", { count: String(daysUntil) })
      : daysUntil === 1
        ? t("forecast.tomorrow")
        : daysUntil === 0
          ? t("forecast.todayIs")
          : t("forecast.overdue", { count: String(-daysUntil) });

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {/* The headline card — cycle day, then the one date most people opened
          the app for. */}
      <div className="rounded-md border border-accent/40 bg-accent/10 p-4">
        <div className="flex items-center gap-2 text-accent">
          <ForecastIcon className="h-4 w-4" />
          <span className="text-xs font-bold tracking-wide uppercase">
            {t(`forecast.confidence.${f.confidence}` as const)}
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold text-fg-bright">
          {t("forecast.cycleDay", { day: String(f.cycleDay) })}
        </p>
        <p className="mt-1 text-sm text-fg">
          {t("forecast.nextPeriod")}: {formatDay(f.nextStart)} — {whenLine}
        </p>
        <p className="mt-2 text-xs text-muted">
          {f.usingDefault
            ? t("forecast.basedOnDefault", { length: String(f.cycleLength) })
            : t("forecast.basedOn", {
                count: String(trackedCycles),
                length: String(f.cycleLength),
              })}
        </p>
      </div>

      {showFertileWindow && f.fertileStart && f.fertileEnd && f.ovulation && (
        <Section title={t("forecast.fertileWindow")}>
          <p className="text-sm text-fg">
            {formatDay(f.fertileStart)} — {formatDay(f.fertileEnd)}
          </p>
          <p className="text-xs text-muted">
            {t("forecast.ovulation", { date: formatDay(f.ovulation) })}
          </p>
        </Section>
      )}

      <Section title={t("forecast.title")}>
        <MonthCalendar
          anchor={today}
          weekStartsOn={weekStartsOn}
          renderDay={(cell: GridCell) => (
            <DayMarker
              cell={cell}
              data={data}
              predictedStart={f.nextStart}
              predictedEnd={f.nextEnd}
              fertileStart={showFertileWindow ? f.fertileStart : null}
              fertileEnd={showFertileWindow ? f.fertileEnd : null}
            />
          )}
        />
        <Legend showFertile={showFertileWindow} />
      </Section>

      {upcoming.length > 1 && (
        <Section title={t("history.periods")}>
          <ul className="flex flex-col gap-1 text-sm">
            {upcoming.map((span) => (
              <li
                key={span.start}
                className="flex justify-between gap-2 text-muted"
              >
                <span className="text-fg">
                  {t("history.periodRow", {
                    start: formatShortDay(span.start),
                    end: formatShortDay(span.end),
                  })}
                </span>
                <span>
                  {t("forecast.inDays", {
                    count: String(daysBetween(today, span.start)),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="px-1 text-xs leading-snug text-muted">
        {t("forecast.disclaimer")}
      </p>
    </div>
  );
}

/** One day cell's markers: a filled droplet for a logged bleeding day, a ring
 *  for a predicted period day, a dot for the fertile window. Non-interactive —
 *  the cell itself is the button. */
function DayMarker({
  cell,
  data,
  predictedStart,
  predictedEnd,
  fertileStart,
  fertileEnd,
}: {
  cell: GridCell;
  data: AppData;
  predictedStart: DayKey | null;
  predictedEnd: DayKey | null;
  fertileStart: DayKey | null;
  fertileEnd: DayKey | null;
}) {
  const entry = data.entries[cell.key];
  if (entry && isBleeding(entry.bleeding)) {
    return <DropletFilledIcon className="mx-auto h-2.5 w-2.5 text-accent" />;
  }
  if (within(cell.key, predictedStart, predictedEnd)) {
    return (
      <span className="mx-auto block h-2 w-2 rounded-full border border-accent/70" />
    );
  }
  if (within(cell.key, fertileStart, fertileEnd)) {
    return <span className="mx-auto block h-2 w-2 rounded-full bg-link/60" />;
  }
  // A reported day with no bleeding still deserves a mark — otherwise "I
  // logged it and felt fine" is indistinguishable from "I forgot".
  if (entry) {
    return <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-muted" />;
  }
  return null;
}

function Legend({ showFertile }: { showFertile: boolean }) {
  const t = useT();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <DropletFilledIcon className="h-2.5 w-2.5 text-accent" />
        {t("forecast.legend.logged")}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full border border-accent/70" />
        {t("forecast.legend.predicted")}
      </li>
      {showFertile && (
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-link/60" />
          {t("forecast.legend.fertile")}
        </li>
      )}
    </ul>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-3 p-6 text-center">
      <ForecastIcon className="mx-auto h-8 w-8 text-muted" />
      <p className="mt-3 text-sm text-muted">{message}</p>
    </div>
  );
}
