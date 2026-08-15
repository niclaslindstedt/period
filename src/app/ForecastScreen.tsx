// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, type ReactNode } from "react";

import {
  addDays,
  daysBetween,
  type DayKey,
  type GridCell,
  type WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import {
  SegmentedControl,
  Section,
} from "@niclaslindstedt/oss-framework/components";

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
import { DropletFilledIcon, ForecastIcon } from "./icons.tsx";
import { useT, type TFn } from "./i18n/index.ts";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { MoodProfileChart, TemperatureProfileChart } from "./ProfileCharts.tsx";
import { formatTemperatureDelta, type TemperatureUnit } from "./temperature.ts";
import type { AppData, DayEntry } from "./types.ts";

// The "so what?" screen: where you are in the cycle, when the next period is
// due, how sure that is, and — unless the user turned it off — the fertile
// window around the projected ovulation.
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
// The chart's appearance controls stay visible in both. Detail governs how much
// is *said*; the chips govern how it is *drawn*, and nothing behind them
// changes a number.
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
  weekStartsOn: WeekStart;
  detail: "simple" | "advanced";
  model: ForecastModelKind;
  look: ChartLook;
  temperatureUnit: TemperatureUnit;
  onDetailChange: (next: "simple" | "advanced") => void;
  onModelChange: (next: ForecastModelKind) => void;
  onLookChange: (next: Partial<ChartLook>) => void;
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
  detail,
  model,
  look,
  temperatureUnit,
  onDetailChange,
  onModelChange,
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

  // The calendar's predicted span runs from the date the headline names, for
  // however long a period usually lasts. It is deliberately drawn from the
  // *model's* date rather than `cycle.ts`'s: the two normally agree, but a day
  // of disagreement would show up as a calendar contradicting the sentence
  // above it. The uncertainty around that date is the chart's job — widening
  // the ring to cover an interval would say "period" about days that are only
  // candidate *starts*.
  const predictedStart = probabilistic.expectedDay;
  const predictedEnd = addDays(
    predictedStart,
    f.nextEnd && f.nextStart ? daysBetween(f.nextStart, f.nextEnd) : 0,
  );

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

      <Section title={t("forecast.calendar")}>
        <MonthCalendar
          anchor={today}
          weekStartsOn={weekStartsOn}
          renderDay={(cell: GridCell) => (
            <DayMarker
              cell={cell}
              data={data}
              predictedStart={predictedStart}
              predictedEnd={predictedEnd}
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

      {/* The two controls that change what is on screen sit at the bottom, not
          the top: the answer comes first, and the knobs are for the second
          visit. */}
      <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-3 p-3">
        <Choice
          label={t("forecast.detail.label")}
          value={detail}
          options={[
            { value: "simple", label: t("forecast.detail.simple") },
            { value: "advanced", label: t("forecast.detail.advanced") },
          ]}
          onChange={(next) => onDetailChange(next as "simple" | "advanced")}
          hint={t("forecast.detail.sameAnswer")}
        />
        <Choice
          label={t("forecast.evidence.label")}
          value={model}
          options={[
            { value: "univariate", label: t("forecast.evidence.cycles") },
            {
              value: "multivariate",
              label: t("forecast.evidence.cyclesAndReports"),
            },
          ]}
          onChange={(next) => onModelChange(next as ForecastModelKind)}
          hint={
            model === "univariate"
              ? t("forecast.evidence.cyclesHint")
              : t("forecast.evidence.cyclesAndReportsHint")
          }
        />
      </div>

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

/** A labelled segmented control with the explanation under it. */
function Choice({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      <SegmentedControl
        value={value}
        options={options}
        onChange={onChange}
        ariaLabel={label}
        fullWidth
      />
      <p className="text-[11px] leading-snug text-muted">{hint}</p>
    </div>
  );
}

/** One day cell's markers: a filled droplet for a logged bleeding day, a ring
 *  for a predicted period day, a dot for the fertile window. Non-interactive —
 *  the cell itself is the button.
 *
 *  The gap under the day number is owned here rather than left to the glyph.
 *  The cell is a `flex-col` with no gap of its own, so a mark's spacing came
 *  from whatever transparent margin its own shape happened to carry: the
 *  droplet's path stops short of its viewBox and looked spaced, while the
 *  circles are a bare 8px of solid colour and sat flush against the digits.
 *  One row of fixed height, one margin, and every mark clears the number by
 *  the same amount. */
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
  const mark = markFor(
    data.entries[cell.key],
    cell.key,
    predictedStart,
    predictedEnd,
    fertileStart,
    fertileEnd,
  );
  if (!mark) return null;
  return (
    <span className="mt-1 flex h-2.5 items-center justify-center">{mark}</span>
  );
}

/** Which of the four marks a day carries, in priority order: what actually
 *  happened outranks what was predicted. */
function markFor(
  entry: DayEntry | undefined,
  key: DayKey,
  predictedStart: DayKey | null,
  predictedEnd: DayKey | null,
  fertileStart: DayKey | null,
  fertileEnd: DayKey | null,
): ReactNode {
  if (entry?.bleeding) {
    return <DropletFilledIcon className="h-2.5 w-2.5 text-accent" />;
  }
  if (within(key, predictedStart, predictedEnd)) {
    return (
      <span className="h-2 w-2 shrink-0 rounded-full border border-accent/70" />
    );
  }
  if (within(key, fertileStart, fertileEnd)) {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-link/60" />;
  }
  // A reported day with no bleeding still deserves a mark — otherwise "I
  // logged it and felt fine" is indistinguishable from "I forgot".
  if (entry) {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />;
  }
  return null;
}

function Legend({ showFertile }: { showFertile: boolean }) {
  const t = useT();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {/* `shrink-0` on the bare circles: an empty span's min-content width is
          zero, so on a narrow row they would give up their 8px to the label
          beside them and collapse against it — the same flush-against-the-text
          look the calendar cells used to have. */}
      <li className="flex items-center gap-1.5">
        <DropletFilledIcon className="h-2.5 w-2.5 shrink-0 text-accent" />
        {t("forecast.legend.logged")}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full border border-accent/70" />
        {t("forecast.legend.predicted")}
      </li>
      {showFertile && (
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-link/60" />
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
