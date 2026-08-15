// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, type ReactNode } from "react";

import {
  daysBetween,
  type DayKey,
} from "@niclaslindstedt/oss-framework/calendar";
import { Section } from "@niclaslindstedt/oss-framework/components";

import {
  cycleStats,
  forecast,
  upcomingStarts,
  type CycleOptions,
} from "./cycle.ts";
import {
  ForecastChart,
  type ChartLook,
  type ChartMark,
  type ChartView,
} from "./ForecastChart.tsx";
import {
  backtest,
  probabilisticForecast,
  type ForecastModelKind,
  type ProbabilisticForecast,
} from "./forecastModel.ts";
import { formatDay, formatShortDay } from "./format.ts";
import { ForecastIcon } from "./icons.tsx";
import { useT, type TFn } from "./i18n/index.ts";
import { MoodProfileChart, TemperatureProfileChart } from "./ProfileCharts.tsx";
import { formatTemperatureDelta, type TemperatureUnit } from "./temperature.ts";
import type { AppData } from "./types.ts";

// The "so what?" screen: where you are in the cycle, when the next period is
// due, how sure that is, and — unless the user turned it off — the fertile
// window around the projected ovulation.
//
// The month grid that used to close this screen now *is* a screen (see
// `CalendarScreen.tsx`). It was the fourth instrument on a page that already
// had a headline, a probability chart and a track record, and it answers a
// different kind of question — "which weekend?" rather than "how sure?" — so
// it was three screens of scrolling away from the tab people reach for it on.
//
// There are two views of the same answer. The **simple** one names a date, the
// range around it, and how likely the week ahead is; the **advanced** one adds
// the fitted parameters, the patterns the model learned from the reports, and
// its backtested track record. They are not two models: both read the identical
// posterior out of `forecastModel.ts`, so the advanced view can never quote a
// number the simple one contradicts. That is the whole design — a summary a
// statistician can audit, rather than a simplification they would have to
// distrust.
//
// Which of the two is on screen, and which reports the model may read, are
// *settings* — they live on the Settings screen and this screen only reads
// them. The chart's appearance chips stay here, because they change how the
// chart is drawn rather than what is said, and nothing behind them moves a
// number.
//
// Everything is derived on the fly from the reports, so there is nothing to
// refresh and nothing that can go stale. The confidence line is not decoration:
// a prediction from two cycles and one from twelve look identical otherwise,
// and only one of them deserves to be believed.

type Props = {
  data: AppData;
  today: DayKey;
  options: CycleOptions;
  showFertileWindow: boolean;
  detail: "simple" | "advanced";
  model: ForecastModelKind;
  look: ChartLook;
  temperatureUnit: TemperatureUnit;
  onLookChange: (next: Partial<ChartLook>) => void;
};

export function ForecastScreen({
  data,
  today,
  options,
  showFertileWindow,
  detail,
  model,
  look,
  temperatureUnit,
  onLookChange,
}: Props) {
  const t = useT();
  const advanced = detail === "advanced";

  // The cycle day, the fertile window and the months-ahead list still come from
  // the simple derivation — a month grid wants one span, not a distribution
  // over twelve days.
  const f = useMemo(
    () => forecast(data, today, options),
    [data, today, options],
  );
  const probabilistic = useMemo(
    () => probabilisticForecast(data, today, model, options),
    [data, today, model, options],
  );
  const trackedCycles = useMemo(
    () => cycleStats(data).cycleLengths.length,
    [data],
  );
  // Three cycles ahead is enough to answer "will it clash with the holiday?"
  // without pretending the fourth one is knowable.
  const upcoming = useMemo(() => upcomingStarts(f, 3), [f]);

  if (!probabilistic || !f.nextStart || f.cycleDay === null) {
    return (
      <div className="flex flex-col gap-3 px-3 py-3">
        <EmptyState message={t("forecast.noHistory")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <Headline
        forecast={probabilistic}
        cycleDay={f.cycleDay}
        trackedCycles={trackedCycles}
        usingDefault={f.usingDefault}
      />

      <Section title={t("forecast.chart.title")}>
        <ForecastChart forecast={probabilistic} today={today} look={look} />
        <ChartChips look={look} onChange={onLookChange} />
      </Section>

      {advanced && (
        <>
          <ModelPanel forecast={probabilistic} trackedCycles={trackedCycles} />
          {model === "multivariate" && (
            <PatternPanels
              forecast={probabilistic}
              temperatureUnit={temperatureUnit}
            />
          )}
          <AccuracyPanel data={data} model={model} options={options} />
        </>
      )}

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

/** The card most people open the app for: the date, the range around it, and
 *  how sure the model is. */
function Headline({
  forecast: f,
  cycleDay,
  trackedCycles,
  usingDefault,
}: {
  forecast: ProbabilisticForecast;
  cycleDay: number;
  trackedCycles: number;
  usingDefault: boolean;
}) {
  const t = useT();
  const ci80 = f.intervals.find((i) => i.mass === 0.8)!;
  const days = f.daysUntilExpected;
  const whenLine =
    days > 1
      ? t("forecast.inDays", { count: String(days) })
      : days === 1
        ? t("forecast.tomorrow")
        : days === 0
          ? t("forecast.todayIs")
          : t("forecast.overdue", { count: String(-days) });

  return (
    <div className="rounded-md border border-accent/40 bg-accent/10 p-4">
      <div className="flex items-center gap-2 text-accent">
        <ForecastIcon className="h-4 w-4" />
        <span className="text-xs font-bold tracking-wide uppercase">
          {t(`forecast.confidence.${f.confidence}` as const)}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-fg-bright">
        {t("forecast.cycleDay", { day: String(cycleDay) })}
      </p>
      <p className="mt-1 text-sm text-fg">
        {t("forecast.nextPeriod")}: {formatDay(f.expectedDay)} — {whenLine}
      </p>
      {/* The range is the honest half of the sentence above it. It is not
          behind the advanced toggle for exactly that reason. */}
      <p className="mt-1 text-sm text-fg">
        {t("forecast.likelyBetween", {
          start: formatShortDay(ci80.start),
          end: formatShortDay(ci80.end),
        })}
      </p>
      <p className="mt-2 text-xs text-muted">
        {t("forecast.chanceWithinWeek", {
          percent: `${Math.round(f.probabilityWithinWeek * 100)}%`,
        })}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {usingDefault
          ? t("forecast.basedOnDefault", {
              length: String(Math.round(f.params.typicalLength)),
            })
          : t("forecast.basedOn", {
              count: String(trackedCycles),
              length: String(Math.round(f.params.typicalLength)),
            })}
      </p>
    </div>
  );
}

/** The chart's appearance controls. Chips rather than a settings panel: they
 *  are one tap, they show their own state, and they sit next to the thing they
 *  change. */
function ChartChips({
  look,
  onChange,
}: {
  look: ChartLook;
  onChange: (next: Partial<ChartLook>) => void;
}) {
  const t = useT();
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Chip
        active={look.mark === "curve"}
        onClick={() =>
          onChange({
            mark: (look.mark === "bars" ? "curve" : "bars") as ChartMark,
          })
        }
      >
        {look.mark === "bars"
          ? t("forecast.chart.marksBars")
          : t("forecast.chart.marksCurve")}
      </Chip>
      <Chip
        active={look.view === "cumulative"}
        onClick={() =>
          onChange({
            view: (look.view === "daily" ? "cumulative" : "daily") as ChartView,
          })
        }
      >
        {look.view === "daily"
          ? t("forecast.chart.viewDaily")
          : t("forecast.chart.viewCumulative")}
      </Chip>
      <Chip
        active={look.showBands}
        onClick={() => onChange({ showBands: !look.showBands })}
      >
        {t("forecast.chart.bands")}
      </Chip>
      <Chip
        active={look.showPrior}
        onClick={() => onChange({ showPrior: !look.showPrior })}
      >
        {t("forecast.chart.compare")}
      </Chip>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // The inactive border is `muted/30` rather than `line`: these chips sit on
      // a `surface-3` section, and the line token is tuned for a boundary
      // *between* surfaces rather than an outline *on* one — in the light theme
      // it disappears against its own background and the chip stops reading as
      // a control at all.
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-muted/30 bg-surface text-muted hover:border-accent/40 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** The fitted model, in the terms someone who wants to check it would use. */
function ModelPanel({
  forecast: f,
  trackedCycles,
}: {
  forecast: ProbabilisticForecast;
  trackedCycles: number;
}) {
  const t = useT();
  const usesReports = f.symptoms !== null || f.temperature !== null;
  return (
    <Section title={t("forecast.model.title")}>
      <dl className="grid grid-cols-2 gap-2">
        <Figure
          label={t("forecast.model.typicalLength")}
          value={t("common.days", {
            count: f.params.typicalLength.toFixed(1),
          })}
        />
        <Figure
          label={t("forecast.model.spread")}
          value={t("forecast.plusMinus", { days: f.spreadDays.toFixed(1) })}
        />
        <Figure
          label={t("forecast.model.effectiveSample")}
          value={t("forecast.model.effectiveSampleValue", {
            value: f.params.effectiveSample.toFixed(1),
            total: String(trackedCycles),
          })}
          hint={t("forecast.model.effectiveSampleHint")}
        />
        <Figure
          label={t("forecast.model.degreesOfFreedom")}
          value={f.params.df.toFixed(1)}
          hint={t("forecast.model.degreesOfFreedomHint")}
        />
      </dl>

      <p className="mt-1 text-xs leading-snug text-muted">
        {t("forecast.model.how")}
        {usesReports && ` ${t("forecast.model.howReports")}`}
      </p>

      <p className="mt-2 text-xs font-medium tracking-wide text-muted uppercase">
        {t("forecast.model.intervals")}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {f.intervals.map((interval) => (
          <li
            key={interval.mass}
            className="flex flex-wrap items-baseline justify-between gap-x-3"
          >
            <span className="text-fg">
              {t("forecast.model.intervalRow", {
                percent: String(interval.mass * 100),
              })}
              {": "}
              {t("forecast.model.intervalRange", {
                start: formatShortDay(interval.start),
                end: formatShortDay(interval.end),
              })}
            </span>
            <span className="text-xs text-muted">
              {t("forecast.model.intervalWidth", {
                count: String(interval.widthDays),
              })}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs font-medium tracking-wide text-muted uppercase">
        {t("forecast.observations.title")}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {f.observations.map((o, i) => (
          <li
            key={i}
            title={
              o.imputed ? t("forecast.observations.imputedHint") : undefined
            }
            className={`rounded-full border px-2 py-0.5 text-xs tabular-nums ${
              o.imputed
                ? "border-dashed border-muted/60 text-muted"
                : "border-line text-fg"
            }`}
          >
            {t("forecast.observations.row", {
              length: o.length.toFixed(o.imputed ? 1 : 0),
            })}
            <span className="ml-1 text-muted/80">
              {t("forecast.observations.weight", {
                value: o.weight.toFixed(2),
              })}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** What the model learned about mood swings and temperature, and what this
 *  cycle's reports did to the date because of it. */
function PatternPanels({
  forecast: f,
  temperatureUnit,
}: {
  forecast: ProbabilisticForecast;
  temperatureUnit: TemperatureUnit;
}) {
  const t = useT();
  return (
    <>
      <Section title={t("forecast.moodProfile.title")}>
        {f.symptoms?.informative ? (
          <>
            <MoodProfileChart profile={f.symptoms} />
            <p className="mt-1 text-xs text-muted">
              {t("forecast.moodProfile.baseline", {
                percent: `${Math.round(f.symptoms.baseline * 100)}%`,
              })}
            </p>
            <p className="text-xs text-muted">
              {t("forecast.moodProfile.sample", {
                window: String(f.symptoms.windowDays),
                baseline: String(f.symptoms.baselineDays),
              })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">{t("forecast.moodProfile.thin")}</p>
        )}
      </Section>

      <Section title={t("forecast.temperatureProfile.title")}>
        {f.temperature === null ? (
          <p className="text-sm text-muted">
            {t("forecast.temperatureProfile.none")}
          </p>
        ) : f.temperature.informative ? (
          <>
            <TemperatureProfileChart
              profile={f.temperature}
              unit={temperatureUnit}
            />
            <p className="mt-1 text-sm text-fg">
              {f.temperature.shiftCelsius >= 0.1
                ? t("forecast.temperatureProfile.shift", {
                    amount: formatTemperatureDelta(
                      f.temperature.shiftCelsius,
                      temperatureUnit,
                    ),
                  })
                : t("forecast.temperatureProfile.shiftNone")}
            </p>
            <p className="text-xs text-muted">
              {t("forecast.temperatureProfile.sample", {
                window: String(f.temperature.windowDays),
                baseline: String(f.temperature.baselineDays),
              })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            {t("forecast.temperatureProfile.thin")}
          </p>
        )}
        <p className="mt-2 text-sm text-fg">
          {shiftLine(t, f.evidenceShiftDays)}
        </p>
      </Section>
    </>
  );
}

/** How this cycle's own reports moved the date, in a sentence. */
function shiftLine(t: TFn, shiftDays: number): string {
  if (shiftDays === 0) return t("forecast.shift.none");
  const count = Math.abs(shiftDays);
  if (shiftDays < 0) {
    return count === 1
      ? t("forecast.shift.earlierOne")
      : t("forecast.shift.earlier", { count: String(count) });
  }
  return count === 1
    ? t("forecast.shift.laterOne")
    : t("forecast.shift.later", { count: String(count) });
}

/** The model scored against the cycles it did not get to see. */
function AccuracyPanel({
  data,
  model,
  options,
}: {
  data: AppData;
  model: ForecastModelKind;
  options: CycleOptions;
}) {
  const t = useT();
  const result = useMemo(
    () => backtest(data, model, options),
    [data, model, options],
  );

  return (
    <Section title={t("forecast.accuracy.title")}>
      {result.meanAbsoluteError === null ? (
        <p className="text-sm text-muted">{t("forecast.accuracy.needsMore")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <Figure
              label={t("forecast.accuracy.meanError")}
              value={t("forecast.accuracy.meanErrorValue", {
                days: result.meanAbsoluteError.toFixed(1),
              })}
            />
            <Figure
              label={t("forecast.accuracy.baseline")}
              value={t("forecast.accuracy.meanErrorValue", {
                days: result.baselineMeanAbsoluteError!.toFixed(1),
              })}
            />
            <Figure
              label={t("forecast.accuracy.coverage80")}
              value={t("forecast.accuracy.coverage", {
                percent: String(Math.round(result.coverage80!)),
                count: String(result.folds.length),
              })}
            />
            <Figure
              label={t("forecast.accuracy.coverage95")}
              value={t("forecast.accuracy.coverage", {
                percent: String(Math.round(result.coverage95!)),
                count: String(result.folds.length),
              })}
            />
          </dl>
          <p className="mt-1 text-xs leading-snug text-muted">
            {t("forecast.accuracy.how")} {t("forecast.accuracy.coverageHint")}
          </p>
        </>
      )}
    </Section>
  );
}

/** One labelled number in the advanced panel. */
function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-3 p-2.5">
      <dt className="text-[0.7rem] tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-bold text-fg-bright tabular-nums">
        {value}
      </dd>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>
      )}
    </div>
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
