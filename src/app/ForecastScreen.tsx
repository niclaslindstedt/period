// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, type ReactNode } from "react";

import {
  addDays,
  daysBetween,
  type DayKey,
} from "@niclaslindstedt/oss-framework/calendar";
import {
  CalendarIcon,
  HeartIcon,
  InfoIcon,
  Section,
  SegmentedControl,
  SlidersIcon,
  SparklesIcon,
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
  type BinaryProfile,
  type FertilityTestProfile,
  type ForecastModelKind,
  type ProbabilisticForecast,
} from "./forecastModel.ts";
import { formatDay, probabilityPercent } from "./format.ts";
import {
  BandsIcon,
  ChartIcon,
  ColumnsIcon,
  CompareIcon,
  CumulativeIcon,
  CurveIcon,
  DropletIcon,
  ForecastIcon,
  OvumIcon,
  PerDayIcon,
  RangeIcon,
  RingsIcon,
  TargetIcon,
  TestStripIcon,
  ThermometerIcon,
  WaveIcon,
} from "./icons.tsx";
import { useT, type TFn } from "./i18n/index.ts";
import { DateSpan, Pill } from "./Pill.tsx";
import {
  BinaryProfileChart,
  TemperatureProfileChart,
} from "./ProfileCharts.tsx";
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
// The screen is written in sentences, because a forecast that does not qualify
// itself is a forecast that overclaims — and a page of qualified sentences is
// also a page where the one thing everybody came for, a date, is the hardest
// thing to find. So the dates come out of the prose and into pills, each row
// keeps the glyph of what it is about, and the sentence around them is still
// there to be read. Nothing about that is load-bearing for the numbers: every
// figure on screen is the same figure it was before it was set in a shape.
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

      <Section
        title={t("forecast.chart.title")}
        icon={<ForecastIcon className="h-3.5 w-3.5" />}
      >
        <ForecastChart forecast={probabilistic} today={today} look={look} />
        <ChartControls look={look} onChange={onLookChange} />
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
        <Section
          title={t("forecast.fertileWindow")}
          icon={<SparklesIcon className="h-3.5 w-3.5" />}
        >
          <DateSpan start={f.fertileStart} end={f.fertileEnd} />
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <OvumIcon className="h-3.5 w-3.5 shrink-0" />
            {t("forecast.ovulation", { date: formatDay(f.ovulation) })}
          </p>
        </Section>
      )}

      {upcoming.length > 1 && (
        <Section
          title={t("history.periods")}
          icon={<DropletIcon className="h-3.5 w-3.5" />}
        >
          <ul className="flex flex-col gap-2 text-sm">
            {upcoming.map((span) => (
              <li
                key={span.start}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <DateSpan
                  start={span.start}
                  end={span.end}
                  label={t("history.periodRow", {
                    start: formatDay(span.start),
                    end: formatDay(span.end),
                  })}
                />
                <span className="text-xs text-muted">
                  {t("forecast.inDays", {
                    count: String(daysBetween(today, span.start)),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="flex gap-1.5 px-1 text-xs leading-snug text-muted">
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
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
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
      {/* The confidence label is a pill rather than a line of small caps: it
          is a badge on the forecast — the qualifier the whole card is read
          through — and a shape that closes around it says that better than
          type size does. */}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-xs font-bold tracking-wide text-accent uppercase">
        <ForecastIcon className="h-3.5 w-3.5" />
        {t(`forecast.confidence.${f.confidence}` as const)}
      </span>
      <p className="mt-2.5 text-2xl font-bold text-fg-bright">
        {t("forecast.cycleDay", { day: String(cycleDay) })}
      </p>

      {/* The date and the countdown are the two things anyone opens this
          screen for, so they are lifted out of the sentence they used to sit
          in and set as pills — the eye finds them without reading the line.
          The label keeps its glyph so the row still says *what* the date is
          the date of. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-fg">
          <DropletIcon className="h-4 w-4 shrink-0 text-accent" />
          {t("forecast.nextPeriod")}
        </span>
        <Pill tone="solid">{formatDay(f.expectedDay)}</Pill>
        <Pill tone="muted">{whenLine}</Pill>
      </div>

      {/* The range is the honest half of the line above it. It is not behind
          the advanced toggle for exactly that reason. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-fg">
          <RangeIcon className="h-4 w-4 shrink-0 text-accent" />
          {t("forecast.likelyLabel")}
        </span>
        <DateSpan
          start={ci80.start}
          end={ci80.end}
          label={t("forecast.likelyBetween", {
            start: formatDay(ci80.start),
            end: formatDay(ci80.end),
          })}
        />
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
        {t("forecast.chanceWithinWeek", {
          percent: probabilityPercent(f.probabilityWithinWeek),
        })}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <ChartIcon className="h-3.5 w-3.5 shrink-0" />
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

/** The chart's appearance controls. Two rows, because there are two kinds of
 *  control here and conflating them is what made the old row confusing.
 *
 *  The first row is the two either/or choices — what the marks are, and what
 *  they measure. Each is a segmented control with *both* options on screen and
 *  the current one selected. They used to be single chips that showed the state
 *  the chart was in, so the chip read "Columns" while drawing columns and you
 *  had to guess that tapping it produced a curve — a chip that names where you
 *  are cannot also say where tapping takes you, and swapping its own label out
 *  from under the tap made the two readings impossible to tell apart. A
 *  segmented control has no such ambiguity: everything you can pick is visible,
 *  the highlight means "this is the one", and nothing renames itself.
 *
 *  The second row is the two genuine on/off overlays, which stay chips —
 *  pressed-or-not is exactly what a chip says well, and there is no second
 *  option to show. Keeping them off the first row is the point: a control that
 *  toggles and a control that chooses should not look alike. */
function ChartControls({
  look,
  onChange,
}: {
  look: ChartLook;
  onChange: (next: Partial<ChartLook>) => void;
}) {
  const t = useT();
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <SegmentedControl<ChartMark>
          value={look.mark}
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
          onChange={(mark) => onChange({ mark })}
          ariaLabel={t("forecast.chart.marksLabel")}
        />
        <SegmentedControl<ChartView>
          value={look.view}
          options={[
            {
              value: "daily",
              label: (
                <SegmentLabel icon={<PerDayIcon />}>
                  {t("forecast.chart.viewDaily")}
                </SegmentLabel>
              ),
            },
            {
              value: "cumulative",
              label: (
                <SegmentLabel icon={<CumulativeIcon />}>
                  {t("forecast.chart.viewCumulative")}
                </SegmentLabel>
              ),
            },
          ]}
          onChange={(view) => onChange({ view })}
          ariaLabel={t("forecast.chart.viewLabel")}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip
          active={look.showBands}
          icon={<BandsIcon />}
          onClick={() => onChange({ showBands: !look.showBands })}
        >
          {t("forecast.chart.bands")}
        </Chip>
        <Chip
          active={look.showPrior}
          icon={<CompareIcon />}
          onClick={() => onChange({ showPrior: !look.showPrior })}
        >
          {t("forecast.chart.compare")}
        </Chip>
      </div>
    </div>
  );
}

/** One segment's contents. The framework's `SegmentedControl` already lays the
 *  label out as a flex row, so this only has to hide the glyph from the
 *  accessible name and size it — the same job, and the same sizing, the chips'
 *  own glyph wrapper does. */
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

/** One overlay, on or off. `aria-pressed` rather than a segment's
 *  `aria-checked`: these are independent switches, not one choice out of a
 *  set. */
function Chip({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  /** The overlay's own mark. Decorative — the label beside it is the accessible
   *  name — so it is sized here rather than at each call site, and every chip's
   *  glyph lands on the same line. */
  icon: ReactNode;
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
      className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-muted/30 bg-surface text-muted hover:border-accent/40 hover:text-fg"
      }`}
    >
      <span aria-hidden="true" className="[&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </span>
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
    <Section
      title={t("forecast.model.title")}
      icon={<SlidersIcon className="h-3.5 w-3.5" />}
    >
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
      <ul className="flex flex-col gap-2 text-sm">
        {f.intervals.map((interval) => (
          <li
            key={interval.mass}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
          >
            <span className="flex flex-wrap items-center gap-2">
              <Pill tone="muted">
                {t("forecast.model.intervalRow", {
                  percent: String(interval.mass * 100),
                })}
              </Pill>
              <DateSpan
                start={interval.start}
                end={interval.end}
                label={t("forecast.model.intervalRange", {
                  start: formatDay(interval.start),
                  end: formatDay(interval.end),
                })}
              />
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
        {f.observations.map((o, i) => {
          // Read by the fit as (mostly) a nonstandard cycle, so it carries only
          // a sliver of its weight — the chip says so instead of showing a
          // full-weight cycle the model quietly ignored.
          const downweighted = !o.imputed && (o.standardShare ?? 1) < 0.5;
          return (
            <li
              key={i}
              title={
                o.imputed
                  ? t("forecast.observations.imputedHint")
                  : downweighted
                    ? t("forecast.observations.outlierHint")
                    : undefined
              }
              className={`rounded-full border px-2 py-0.5 text-xs tabular-nums ${
                o.imputed || downweighted
                  ? "border-dashed border-muted/60 text-muted"
                  : "border-line text-fg"
              }`}
            >
              {t("forecast.observations.row", {
                length: o.length.toFixed(o.imputed ? 1 : 0),
              })}
              <span className="ml-1 text-muted/80">
                {t("forecast.observations.weight", {
                  value: (o.weight * (o.standardShare ?? 1)).toFixed(2),
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** What the model learned from each channel of reports, and what this cycle's
 *  reports did to the date because of it. */
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
      {/* Each channel wears the same mark it wears on the Report screen's
          row of four, so a panel here and the button that fills it are
          recognisably the same question. */}
      <BinaryPanel
        profile={f.symptoms}
        icon={<WaveIcon className="h-3.5 w-3.5" />}
        title={t("forecast.moodProfile.title")}
        desc={t("forecast.moodProfile.chartDesc")}
      />
      <BinaryPanel
        profile={f.lust}
        icon={<HeartIcon className="h-3.5 w-3.5" />}
        title={t("forecast.lustProfile.title")}
        desc={t("forecast.lustProfile.chartDesc")}
      />
      <BinaryPanel
        profile={f.sex}
        icon={<RingsIcon className="h-3.5 w-3.5" />}
        title={t("forecast.sexProfile.title")}
        desc={t("forecast.sexProfile.chartDesc")}
        note={t("forecast.sexProfile.confounded")}
      />
      <FertilityTestPanel profile={f.fertilityTest} />

      <Section
        title={t("forecast.temperatureProfile.title")}
        icon={<ThermometerIcon className="h-3.5 w-3.5" />}
      >
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
        {/* The anchor is separate from the profile on purpose: the plateau
            needs a history, the step only needs this cycle's mornings — so it
            can have something to say while the chart above is still thin. */}
        {f.thermalShift &&
          (f.thermalShift.detectedDay ? (
            <p className="mt-2 text-sm text-fg">
              {t("forecast.thermalShift.detected", {
                date: formatDay(f.thermalShift.detectedDay),
                count: String(Math.round(f.thermalShift.leadDays)),
                onset: formatDay(
                  addDays(
                    f.thermalShift.detectedDay,
                    Math.round(f.thermalShift.leadDays),
                  ),
                ),
              })}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              {t("forecast.thermalShift.none")}
            </p>
          ))}
      </Section>

      {/* The one line that is about *all* of the panels above rather than any
          one of them, so it sits after the last of them rather than inside
          whichever happened to be drawn last. */}
      <p className="px-1 text-sm text-fg">
        {shiftLine(t, f.evidenceShiftDays)}
      </p>
    </>
  );
}

/** One learned yes/no channel: its chart when there is enough history behind
 *  it to be allowed to move anything, and the reason why not when there is not.
 *  A channel with no profile at all — nothing logged yet — is left off the
 *  screen entirely rather than shown as an empty box. */
function BinaryPanel({
  profile,
  icon,
  title,
  desc,
  note,
}: {
  profile: BinaryProfile | null;
  /** The channel's own mark, for the section heading. */
  icon: ReactNode;
  title: string;
  desc: string;
  /** An extra line under the chart, for a channel whose flatness means
   *  something the shared copy does not cover. */
  note?: string;
}) {
  const t = useT();
  if (!profile) return null;
  return (
    <Section title={title} icon={icon}>
      {profile.informative ? (
        <>
          <BinaryProfileChart profile={profile} title={title} desc={desc} />
          <p className="mt-1 text-xs text-muted">
            {t("forecast.binaryProfile.baseline", {
              percent: `${Math.round(profile.baseline * 100)}%`,
            })}
          </p>
          <p className="text-xs text-muted">
            {t("forecast.binaryProfile.sample", {
              window: String(profile.windowDays),
              baseline: String(profile.baselineDays),
            })}
          </p>
          {note && <p className="mt-1 text-xs text-muted">{note}</p>}
        </>
      ) : (
        <p className="text-sm text-muted">{t("forecast.binaryProfile.thin")}</p>
      )}
    </Section>
  );
}

/**
 * The ovulation-test channel.
 *
 * Its own panel rather than another {@link BinaryPanel} because the number
 * worth reading here is not the sample size — the profile is constructed, so
 * the sample never gates it — but the *lead*: how many days a positive strip
 * puts between itself and the next period. That is the claim the channel makes,
 * and the copy names where it came from, so a reader can tell a figure learned
 * from their own strips from one taken out of Settings.
 */
function FertilityTestPanel({
  profile,
}: {
  profile: FertilityTestProfile | null;
}) {
  const t = useT();
  if (!profile) {
    return (
      <Section
        title={t("forecast.fertilityTestProfile.title")}
        icon={<TestStripIcon className="h-3.5 w-3.5" />}
      >
        <p className="text-sm text-muted">
          {t("forecast.fertilityTestProfile.none")}
        </p>
      </Section>
    );
  }
  return (
    <Section
      title={t("forecast.fertilityTestProfile.title")}
      icon={<TestStripIcon className="h-3.5 w-3.5" />}
    >
      <BinaryProfileChart
        profile={profile}
        title={t("forecast.fertilityTestProfile.title")}
        desc={t("forecast.fertilityTestProfile.chartDesc")}
      />
      <p className="mt-1 text-sm text-fg">
        {profile.observedPositives > 0
          ? t("forecast.fertilityTestProfile.leadLearned", {
              count: String(Math.round(profile.leadDays)),
              positives: String(profile.observedPositives),
            })
          : t("forecast.fertilityTestProfile.lead", {
              count: String(Math.round(profile.leadDays)),
            })}
      </p>
      <p className="text-xs text-muted">
        {t("forecast.fertilityTestProfile.counts", {
          window: String(profile.windowDays),
          days: String(profile.window),
        })}
      </p>
    </Section>
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
    <Section
      title={t("forecast.accuracy.title")}
      icon={<TargetIcon className="h-3.5 w-3.5" />}
    >
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
    <div className="rounded-xl border border-line bg-surface-3 p-2.5">
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
    <div className="rounded-2xl border border-line bg-surface-3 p-6 text-center">
      <ForecastIcon className="mx-auto h-8 w-8 text-muted" />
      <p className="mt-3 text-sm text-muted">{message}</p>
    </div>
  );
}
