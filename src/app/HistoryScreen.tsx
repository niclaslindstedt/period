// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, type ReactNode } from "react";

import { BarChart, LineChart } from "@niclaslindstedt/oss-framework/charts";
import { Section } from "@niclaslindstedt/oss-framework/components";

import { cycleStats, type CycleOptions } from "./cycle.ts";
import { formatDay } from "./format.ts";
import { ChartIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { phaseLabel } from "./labels.ts";
import { swingsByPhase } from "./swings.ts";
import { inUnit, isFever, type TemperatureUnit } from "./temperature.ts";
import { sortedEntries, type AppData, type DayEntry } from "./types.ts";

// What the reports add up to: the four numbers worth knowing, the shape of the
// cycle lengths over time, whether the mood swings cluster in a phase, and the
// list of periods behind all of it.
//
// The list matters as much as the charts. A summary nobody can check is just a
// claim — showing the periods the averages were computed from is how a wrong
// number becomes a fixable report rather than a mystery.

type Props = {
  data: AppData;
  options: CycleOptions;
  temperatureUnit: TemperatureUnit;
};

/** Readings shown on the temperature chart. About three cycles: enough to see
 *  the sawtooth repeat, few enough that each point still has room. */
const TEMPERATURE_WINDOW = 90;

export function HistoryScreen({ data, options, temperatureUnit }: Props) {
  const t = useT();
  const stats = useMemo(() => cycleStats(data), [data]);
  const phases = useMemo(() => swingsByPhase(data, options), [data, options]);
  const daysLogged = Object.keys(data.entries).length;

  // The recent temperature series, in the unit being read. Gaps stay gaps —
  // a `null` is a morning the reading was skipped, and joining across it would
  // draw a trend nobody measured.
  //
  // A fever is a gap too. The chart exists to show a step of about a third of
  // a degree; one 38.6 morning rescales the axis until every cycle on it is a
  // flat line, and the reading it drew that for was never a cycle measurement
  // (see `isFever`). It stays on the Report screen for the day it belongs to.
  const temperatures = useMemo(() => {
    const recent = sortedEntries(data).slice(-TEMPERATURE_WINDOW);
    const reading = (e: DayEntry) =>
      e.temperature === null || isFever(e.temperature) ? null : e.temperature;
    const readings = recent.filter((e) => reading(e) !== null);
    if (readings.length < 5) return null;
    return {
      values: recent.map((e) => {
        const value = reading(e);
        return value === null ? null : inUnit(value, temperatureUnit);
      }),
      labels: recent.map((e) => formatDay(e.date)),
      count: readings.length,
    };
  }, [data, temperatureUnit]);

  if (stats.periods.length === 0) {
    return (
      <div className="px-3 py-3">
        <div className="rounded-2xl border border-line bg-surface-3 p-6 text-center">
          <ChartIcon className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-muted">{t("history.empty")}</p>
        </div>
      </div>
    );
  }

  // A share of the reported days, not a count: the phases are different
  // lengths, so raw counts would make the luteal phase look worse for free.
  const swingSeries = phases.map((p) => p.swingShare ?? 0);
  const hasSwingData = phases.some((p) => p.days > 0);

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={t("history.averageCycle")}
          value={
            stats.averageCycle === null
              ? "—"
              : t("common.days", { count: String(stats.averageCycle) })
          }
        />
        <Stat
          label={t("history.averagePeriod")}
          value={
            stats.averagePeriodLength === null
              ? "—"
              : t("common.days", { count: String(stats.averagePeriodLength) })
          }
        />
        <Stat
          label={t("history.cyclesTracked")}
          value={String(stats.cycleLengths.length)}
        />
        <Stat label={t("history.daysLogged")} value={String(daysLogged)} />
      </div>

      {stats.cycleLengths.length >= 2 && (
        <Section title={t("history.cycleLengthChart")}>
          <LineChart
            series={[{ values: stats.cycleLengths }]}
            x={{
              // Each point is the cycle that *started* with that period, so
              // the label is the period's start date.
              labels: stats.periods.slice(0, -1).map((p) => formatDay(p.start)),
            }}
            height={160}
            showDots
            ariaLabel={t("history.cycleLengthChart")}
            desc={t("history.cycleLengthChartDesc")}
            formatValue={(v) => `${Math.round(v)}`}
          />
        </Section>
      )}

      {temperatures && (
        <Section title={t("history.temperatureChart")}>
          <LineChart
            series={[{ values: temperatures.values }]}
            x={{ labels: temperatures.labels }}
            height={160}
            curve="monotone"
            ariaLabel={t("history.temperatureChart")}
            desc={t("history.temperatureChartDesc")}
            formatValue={(v) => v.toFixed(2)}
          />
          <p className="text-xs text-muted">
            {t("history.temperatureReadings", {
              count: String(temperatures.count),
              unit: temperatureUnit === "f" ? "°F" : "°C",
            })}
          </p>
        </Section>
      )}

      {hasSwingData && (
        <Section title={t("history.swingChart")}>
          <BarChart
            series={[{ values: swingSeries }]}
            labels={phases.map((p) => phaseLabel(t, p.phase))}
            height={160}
            ariaLabel={t("history.swingChart")}
            desc={t("history.swingChartDesc")}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </Section>
      )}

      <Section title={t("history.periods")}>
        <ul className="flex flex-col gap-1.5 text-sm">
          {/* Newest first: the period someone wants to check is almost always
              the last one. */}
          {[...stats.periods].reverse().map((period, i) => {
            // `stats.cycleLengths[n]` is the gap from period n to n + 1, so
            // the gap that *ended* at this period is the one before it.
            const index = stats.periods.length - 1 - i;
            const gap = index > 0 ? stats.cycleLengths[index - 1] : undefined;
            return (
              <li
                key={period.start}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
              >
                <span className="text-fg">
                  {t("history.periodRow", {
                    start: formatDay(period.start),
                    end: formatDay(period.end),
                  })}
                </span>
                <span className="text-xs text-muted">
                  {t("history.periodLength", { count: String(period.length) })}
                  {gap !== undefined &&
                    ` · ${t("history.cycleGap", { count: String(gap) })}`}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-3 p-3">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-lg font-bold text-fg-bright">{value}</p>
    </div>
  );
}
