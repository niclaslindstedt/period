// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, useState, type ReactNode } from "react";

import {
  Section,
  SegmentedControl,
} from "@niclaslindstedt/oss-framework/components";

import { cycleStats, type CycleOptions } from "./cycle.ts";
import { formatDay } from "./format.ts";
import { HistoryChart, type HistoryMark } from "./HistoryChart.tsx";
import {
  ChartIcon,
  ColumnsIcon,
  CurveIcon,
  DropletIcon,
  ThermometerIcon,
  WaveIcon,
} from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { phaseLabel } from "./labels.ts";
import { DateSpan } from "./Pill.tsx";
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
//
// The charts are drawn by `HistoryChart.tsx`, in the Forecast chart's grammar
// — the same recessive frame, the same rounded columns, the same pinned
// readout — because the two screens share a reader and should not teach them
// two ways to read a plot. Cycle length defaults to columns for the Forecast
// chart's reason: each cycle really is one discrete number, and a column per
// cycle says so where a line implies a continuum between them.

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

  // How the cycle-length series is marked. Session-local on purpose: it
  // changes how the chart is drawn, not what it says, and the columns default
  // is the right first impression every time the screen opens.
  const [cycleMark, setCycleMark] = useState<HistoryMark>("bars");

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
  const unitLabel = temperatureUnit === "f" ? "°F" : "°C";

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
        <Section
          title={t("history.cycleLengthChart")}
          icon={<ChartIcon className="h-3.5 w-3.5" />}
        >
          <HistoryChart
            values={stats.cycleLengths}
            // Each point is the cycle that *started* with that period, so
            // the label is the period's start date.
            labels={stats.periods.slice(0, -1).map((p) => formatDay(p.start))}
            mark={cycleMark}
            ariaLabel={t("history.cycleLengthChart")}
            desc={t("history.cycleLengthChartDesc")}
            formatValue={(v) =>
              t("history.cycleGap", { count: String(Math.round(v)) })
            }
          />
          <SegmentedControl<HistoryMark>
            value={cycleMark}
            options={[
              {
                value: "bars",
                label: (
                  <SegmentLabel icon={<ColumnsIcon />}>
                    {t("forecast.chart.marksBars")}
                  </SegmentLabel>
                ),
              },
              {
                value: "curve",
                label: (
                  <SegmentLabel icon={<CurveIcon />}>
                    {t("forecast.chart.marksCurve")}
                  </SegmentLabel>
                ),
              },
            ]}
            onChange={setCycleMark}
            ariaLabel={t("forecast.chart.marksLabel")}
          />
        </Section>
      )}

      {temperatures && (
        <Section
          title={t("history.temperatureChart")}
          icon={<ThermometerIcon className="h-3.5 w-3.5" />}
        >
          <HistoryChart
            values={temperatures.values}
            labels={temperatures.labels}
            mark="curve"
            zeroBased={false}
            ariaLabel={t("history.temperatureChart")}
            desc={t("history.temperatureChartDesc")}
            formatValue={(v) => `${v.toFixed(2)} ${unitLabel}`}
          />
          <p className="text-xs text-muted">
            {t("history.temperatureReadings", {
              count: String(temperatures.count),
              unit: unitLabel,
            })}
          </p>
        </Section>
      )}

      {hasSwingData && (
        <Section
          title={t("history.swingChart")}
          icon={<WaveIcon className="h-3.5 w-3.5" />}
        >
          <HistoryChart
            values={swingSeries}
            labels={phases.map((p) => phaseLabel(t, p.phase))}
            mark="bars"
            ariaLabel={t("history.swingChart")}
            desc={t("history.swingChartDesc")}
            formatValue={(v) =>
              t("history.swingShare", { percent: `${Math.round(v)}%` })
            }
            // A share is only a share against its sign — 45 next to 20 could
            // be days as easily as percent.
            formatTick={(v) => `${Math.round(v)}%`}
            details={phases.map((p) =>
              t("history.swingSample", { count: String(p.days) }),
            )}
          />
        </Section>
      )}

      <Section
        title={t("history.periods")}
        icon={<DropletIcon className="h-3.5 w-3.5" />}
      >
        <ul className="flex flex-col gap-2 text-sm">
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
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <DateSpan
                  start={period.start}
                  end={period.end}
                  label={t("history.periodRow", {
                    start: formatDay(period.start),
                    end: formatDay(period.end),
                  })}
                />
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

/** One segment's contents — the Forecast screen's helper, doing the same job
 *  here: hide the glyph from the accessible name and size it. */
function SegmentLabel({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span aria-hidden="true" className="[&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </span>
      {children}
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-3 p-3">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-lg font-bold text-fg-bright tabular-nums">
        {value}
      </p>
    </div>
  );
}
