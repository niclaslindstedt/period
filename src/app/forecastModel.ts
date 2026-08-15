// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The probabilistic forecast — the model behind both the simple and the
// advanced view of the Forecast screen.
//
// `cycle.ts` answers "when is the next period?" with a single date: the last
// start plus the typical gap. That is the right answer to give someone in the
// two seconds they spend on the screen, but it is a point where the truth is a
// distribution, and it cannot say how sure it is beyond a four-level label.
//
// This module produces the distribution. The *same* distribution feeds both
// views: the simple view reads its mode and its 80% interval and says "the 3rd,
// most likely between the 1st and the 5th"; the advanced view draws the whole
// thing with its credible bands and its diagnostics. Neither is a rounded-off
// version of the other — the simple view is a *summary* of the identical
// posterior, which is the only way both can honestly be called equally
// accurate.
//
// ## The univariate model (cycle lengths only)
//
// Observed cycle lengths are modelled as log-normal. Cycle-length
// distributions are right-skewed — a 40-day cycle is far more common than a
// 16-day one — so a symmetric model on the day scale puts mass on impossible
// dates and understates the long tail. Working in `ln(days)` fixes both.
//
// The parameters get a conjugate Normal-Inverse-Gamma prior, so the posterior
// is closed-form and the posterior *predictive* is a Student-t. That matters
// more than it sounds: the t's degrees of freedom grow with the data, so with
// two cycles logged the predictive tails are genuinely fat and the interval is
// genuinely wide, without anyone having to hand-tune a fudge factor. The
// widening is the model being honest, not a penalty bolted on afterwards.
//
// Three refinements on top, each earning its complexity:
//
//   - **Recency weighting.** Cycles drift with age, stress, and life. Older
//     observations get an exponentially decaying weight (a half-life in
//     cycles), so last year's pattern fades instead of anchoring forever.
//   - **Skipped-cycle repair.** A 58-day gap is much more likely to be two
//     unlogged 29-day cycles than one 58-day cycle. Gaps that sit close to an
//     integer multiple of the typical length are split, at reduced weight
//     because the split is an inference rather than an observation.
//   - **Survival conditioning.** A day already reported with no bleeding
//     cannot be the day the period started. Ruling those out and renormalising
//     is why the forecast sharpens as the cycle runs on. Days with *no* report
//     stay possible — an unlogged day is not evidence of anything.
//
// ## The multivariate model (cycle lengths + mood swings)
//
// Mood swings cluster in the luteal phase and peak in the days right before
// bleeding starts, which makes them a leading indicator rather than a
// coincidence. The multivariate model turns that into evidence.
//
// From the history it estimates a *symptom profile*: the probability of
// reporting mood swings at each lag before an onset, against the baseline rate
// outside that window. Each candidate onset day then implies a lag for every
// recent report, and the reports' likelihood ratio under that hypothesis
// reweights the day. Three days of swings on cycle day 24 pull the
// distribution earlier; a placid week pushes it later.
//
// The likelihood treats days as conditionally independent, which they are not
// — a bad stretch is one episode, not five. Rather than pretend otherwise, the
// combined log-likelihood-ratio is tempered by a fixed exponent and clamped, so
// symptoms can shift the forecast by a few days but never overrule the cycle
// history. Under-claiming here is the right failure: this is the only
// respectable way to use five correlated binary observations.
//
// The structure generalises. A third symptom is another profile and another
// factor in the product — nothing about the model is specific to mood swings.
//
// Everything here is pure and clock-free, like `cycle.ts`: `today` is always a
// parameter, so `tests/forecastModel_test.ts` pins real dates without touching
// the clock.

import { addDays, daysBetween } from "@niclaslindstedt/oss-framework/calendar";
import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

import {
  cycleStats,
  DEFAULT_CYCLE_OPTIONS,
  derivePeriods,
  type Confidence,
  type CycleOptions,
  type PeriodSpan,
} from "./cycle.ts";
import {
  credibleInterval,
  median,
  normalize,
  pmfMode,
  pmfQuantile,
  pmfStdev,
  studentTCdf,
  totalWeight,
  weightedMean,
  weightedSumSquares,
  type Pmf,
  type Weighted,
} from "./stats.ts";
import { isFever } from "./temperature.ts";
import { sortedEntries, type AppData, type DayEntry } from "./types.ts";

/** Which evidence the forecast is allowed to use. Both run the same cycle-length
 *  model; `multivariate` additionally reweights it with the symptom profile. */
export type ForecastModelKind = "univariate" | "multivariate";

/** The credible-interval widths the screen draws, widest first. Three bands is
 *  the most a phone-width chart can show without the shading turning to mud. */
export const INTERVAL_MASSES = [0.95, 0.8, 0.5] as const;

/** Tunables for the probabilistic model. Every default is a considered choice,
 *  not a placeholder — see the comment on each. */
export type ModelOptions = {
  /** Prior mean cycle length in days, before any history. Doubles as the
   *  fallback the whole forecast rests on for a brand-new user. */
  priorCycleLength: number;
  /** κ₀ — how many observations the prior mean is worth. One: the prior should
   *  lose the argument as soon as there is real data, but not before. */
  priorStrength: number;
  /** α₀ — the prior's shape for the variance. 2.5 gives the predictive 5
   *  degrees of freedom with no data at all: fat-tailed enough that the first
   *  interval a user sees is properly humble. */
  priorShape: number;
  /** Prior standard deviation of `ln(cycle length)`. 0.11 is about ±3 days at
   *  a 28-day cycle, which is the between-cycle spread reported for regularly
   *  cycling adults. */
  priorLogSd: number;
  /** Half-life of the recency weighting, in cycles. Six is roughly half a
   *  year: long enough to average out a noisy month, short enough that a real
   *  change in cycle length shows up within a season. */
  halfLifeCycles: number;
  /** Weight given to each observation recovered from a skipped-cycle split.
   *  Half, because the split is an inference: if it is right the two cycles are
   *  real, and if it is wrong they should not count as two firm data points. */
  imputedWeight: number;
  /** Exponent applied to the symptom log-likelihood-ratio. Days of symptoms
   *  are strongly autocorrelated, so the naive product over-counts; 0.5 is a
   *  deliberately conservative discount. */
  symptomTemper: number;
  /** Hard cap on the tempered log-likelihood-ratio, so symptoms shift the
   *  forecast rather than dictate it. e³ ≈ 20:1 either way. */
  symptomMaxLogLr: number;
  /** Pseudo-count pulling each lag's symptom rate toward the overall rate. A
   *  lag seen twice ends up saying almost nothing, which is correct. */
  symptomShrinkage: number;
  /** Reported days needed in *both* the premenstrual window and the baseline
   *  before the symptom profile is used at all. Below this the multivariate
   *  model deliberately reduces to the univariate one. */
  symptomMinDays: number;
  /** Exponent applied to the temperature log-likelihood-ratio. Lower than the
   *  mood one: a luteal plateau is a single physiological state producing a
   *  fortnight of near-identical readings, so treating them as independent
   *  over-counts harder than it does for a binary symptom. */
  temperatureTemper: number;
  /** Days either side of a reading whose median defines its personal baseline.
   *  Forty-five covers roughly three cycles, so the centre sees both phases and
   *  a new thermometer (or a warmer bedroom) is absorbed within a season. */
  temperatureCentreWindow: number;
  /** Floor on the pooled standard deviation of the centred readings, in °C.
   *  Below a thermometer's own resolution the likelihood ratio would explode on
   *  measurement noise. */
  temperatureMinSd: number;
  /** Readings needed in both the premenstrual window and the baseline before
   *  the temperature profile is used. Lower than the mood threshold because
   *  nobody takes their temperature every day, and waiting for symptom-level
   *  coverage would mean never using the strongest signal in the model. */
  temperatureMinDays: number;
  /** Longest lead the distribution is evaluated over, in days from the anchor.
   *  Caps the work and keeps a pathological history from producing a chart a
   *  year wide. */
  maxLeadDays: number;
};

export const DEFAULT_MODEL_OPTIONS: ModelOptions = {
  priorCycleLength: DEFAULT_CYCLE_OPTIONS.defaultCycleLength,
  priorStrength: 1,
  priorShape: 2.5,
  priorLogSd: 0.11,
  halfLifeCycles: 6,
  imputedWeight: 0.5,
  symptomTemper: 0.5,
  symptomMaxLogLr: 3,
  symptomShrinkage: 4,
  symptomMinDays: 20,
  temperatureTemper: 0.35,
  temperatureCentreWindow: 45,
  temperatureMinSd: 0.06,
  temperatureMinDays: 12,
  maxLeadDays: 90,
};

/**
 * How many days before an onset count as "premenstrual" for the symptom
 * profile. Fourteen days is the luteal phase: the clinical description of
 * premenstrual symptoms puts their onset one to two weeks before bleeding,
 * rising toward it. A window is needed because the profile is a *contrast* —
 * the rate inside it only means something against the rate outside.
 */
export const PREMENSTRUAL_WINDOW = 14;

/** Cycles the backtest needs before it will report anything. Two folds from
 *  three cycles is not an accuracy estimate; it is an anecdote. */
const MIN_BACKTEST_PERIODS = 5;

/** A gap only splits into `k` cycles when it is at least this many typical
 *  lengths long — below it, "one unusually long cycle" is the better reading. */
const MIN_SKIP_RATIO = 1.75;

/** …and when the implied per-cycle length lands this close (as a fraction of
 *  the typical length) to the typical one. A gap that splits into something
 *  odd was probably not a skip. */
const MAX_SKIP_RESIDUAL = 0.15;

/** One cycle length the model was fitted on. */
export type CycleObservation = {
  /** Days between starts. Fractional when recovered from a skip split. */
  length: number;
  /** Recency × imputation weight. */
  weight: number;
  /** True when this came from splitting a long gap rather than from two
   *  logged period starts. */
  imputed: boolean;
};

/** The fitted posterior, in the terms a statistician would want to check. */
export type PosteriorParams = {
  /** Posterior mean of μ, on the `ln(days)` scale. */
  mu: number;
  kappa: number;
  alpha: number;
  beta: number;
  /** Degrees of freedom of the posterior predictive (2α). */
  df: number;
  /** Scale of the posterior predictive, on the `ln(days)` scale. */
  scale: number;
  /** Σ of the observation weights — the model's effective sample size. */
  effectiveSample: number;
  /** `exp(μ)`: the typical cycle length in days, the posterior's median. */
  typicalLength: number;
  /** Posterior mean of σ on the log scale, expressed as ± days at the typical
   *  length. What "my cycle varies by about N days" actually means here. */
  spreadDays: number;
};

/** The estimated relationship between mood swings and an approaching onset. */
export type SymptomProfile = {
  /** Lags covered: 0 (the onset day) up to `window − 1`. */
  window: number;
  /** `rate[lag]` — P(mood swings reported | `lag` days before onset). */
  rate: number[];
  /** P(mood swings reported | outside the window). */
  baseline: number;
  /** Reported days behind the in-window rates and the baseline. */
  windowDays: number;
  baselineDays: number;
  /** Whether there is enough of both to let the profile move the forecast. */
  informative: boolean;
};

/**
 * The estimated shape of waking temperature as an onset approaches.
 *
 * Everything is expressed as a *deviation* from the reader's own rolling
 * median, never as an absolute temperature. Absolute readings differ by
 * person, by thermometer, and by how warm the bedroom was in February; the
 * biphasic shift the model is looking for is a within-person contrast of about
 * a third of a degree, and centring is what leaves that contrast behind after
 * everything else has been subtracted out.
 */
export type TemperatureProfile = {
  /** Lags covered: 0 (the onset day) up to `window − 1`. */
  window: number;
  /** `mean[lag]` — average deviation from the rolling median, in °C, at `lag`
   *  days before onset. Positive through the luteal plateau, falling toward
   *  onset as progesterone withdraws. */
  mean: number[];
  /** Average deviation outside the window — the follicular baseline. */
  baselineMean: number;
  /** Pooled standard deviation of the deviations, floored. */
  sd: number;
  /** Readings behind the in-window means and the baseline. */
  windowDays: number;
  baselineDays: number;
  /** The full swing the profile describes: the highest lag mean minus the
   *  baseline. A readout, and the thing that makes the panel worth looking at
   *  — it should land near a third of a degree for an ovulatory cycle. */
  shiftCelsius: number;
  informative: boolean;
};

/** One day of the forecast, ready to draw. */
export type ForecastDay = {
  day: DayKey;
  /** Days from the anchor start. */
  offset: number;
  /** Posterior probability this is the day the next period starts. */
  probability: number;
  /** The same before the symptom update and the survival conditioning — the
   *  "cycle history alone" curve the advanced view overlays. */
  priorProbability: number;
  /** Posterior mass at or before this day. */
  cumulative: number;
  /** Ruled out by a report of no bleeding on a day already past. */
  excluded: boolean;
};

/** A credible interval, as dates. */
export type ForecastInterval = {
  /** 0.95, 0.8, 0.5. */
  mass: number;
  start: DayKey;
  end: DayKey;
  /** Whole days from `start` to `end` inclusive. */
  widthDays: number;
};

/** Everything the Forecast screen draws, from either model. */
export type ProbabilisticForecast = {
  model: ForecastModelKind;
  /** The start the distribution is measured from — the last observed period
   *  start, rolled forward over any cycles that were never logged. */
  anchorStart: DayKey;
  /** The last period start actually observed in the reports. */
  lastObservedStart: DayKey;
  /** The per-day distribution, oldest day first. */
  days: ForecastDay[];
  /**
   * The date the screen names: the posterior **median**, the day with even
   * odds of the period arriving before or after it.
   *
   * The median rather than the mode, for two reasons. The distribution is
   * right-skewed, so its peak sits a day below its middle — naming the peak
   * would put the headline date one day earlier than the "typical cycle
   * length" quoted right beside it, which reads as a bug. And the median is
   * the point estimate that minimises absolute error, which is the error the
   * backtest reports and the error a person actually experiences.
   */
  expectedDay: DayKey;
  /** The single most probable day — the peak of the drawn curve. Kept
   *  separate because it is what the chart marks, not what the copy says. */
  peakDay: DayKey;
  /** Whole days from `today` to `expectedDay`; negative once overdue. */
  daysUntilExpected: number;
  intervals: ForecastInterval[];
  /** Posterior standard deviation, in days. */
  spreadDays: number;
  /** Probability the period starts within the next seven days. */
  probabilityWithinWeek: number;
  params: PosteriorParams;
  observations: CycleObservation[];
  /** Null under the univariate model, or when nothing has been logged yet.
   *  Present but `informative: false` when there is a profile that is too thin
   *  to be allowed to move anything — which the screen says out loud. */
  symptoms: SymptomProfile | null;
  temperature: TemperatureProfile | null;
  /** Days the within-cycle evidence moved the expected date, negative for
   *  earlier. Zero under the univariate model, or when no channel had enough
   *  history to say anything. */
  evidenceShiftDays: number;
  confidence: Confidence;
};

// --- Fitting --------------------------------------------------------------

/**
 * Split gaps that look like several unlogged cycles.
 *
 * The test is deliberately strict: a gap must be at least {@link
 * MIN_SKIP_RATIO} typical lengths long *and* divide into something within
 * {@link MAX_SKIP_RESIDUAL} of the typical length. A 58-day gap against a
 * 28-day norm splits into two 29s; a 45-day gap does not, because one long
 * cycle explains it at least as well and inventing a 22-day cycle out of it
 * would corrupt both the centre and the spread.
 */
export function repairSkippedCycles(
  gaps: readonly number[],
  typicalLength: number,
): { length: number; imputed: boolean }[] {
  const out: { length: number; imputed: boolean }[] = [];
  for (const gap of gaps) {
    const k = Math.round(gap / typicalLength);
    const split = gap / k;
    if (
      k >= 2 &&
      gap >= typicalLength * MIN_SKIP_RATIO &&
      Math.abs(split - typicalLength) <= typicalLength * MAX_SKIP_RESIDUAL
    ) {
      for (let i = 0; i < k; i++) out.push({ length: split, imputed: true });
    } else {
      out.push({ length: gap, imputed: false });
    }
  }
  return out;
}

/** Turn observed period starts into the weighted observations the posterior is
 *  fitted on: skip-repaired, then discounted by age. */
export function observationsFrom(
  periods: readonly PeriodSpan[],
  options: ModelOptions,
): CycleObservation[] {
  const gaps: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    gaps.push(daysBetween(periods[i - 1]!.start, periods[i]!.start));
  }
  if (gaps.length === 0) return [];

  const typical = median(gaps) ?? options.priorCycleLength;
  const repaired = repairSkippedCycles(gaps, typical);

  const newest = repaired.length - 1;
  return repaired.map((r, i) => ({
    length: r.length,
    imputed: r.imputed,
    weight:
      0.5 ** ((newest - i) / options.halfLifeCycles) *
      (r.imputed ? options.imputedWeight : 1),
  }));
}

/**
 * The conjugate Normal-Inverse-Gamma update, on the log scale.
 *
 * With no observations this returns the prior, whose predictive is a t on 5
 * degrees of freedom centred at the configured default — a wide, honest
 * "probably around four weeks, but I have never met you".
 */
export function fitPosterior(
  observations: readonly CycleObservation[],
  options: ModelOptions,
): PosteriorParams {
  const items: Weighted[] = observations.map((o) => ({
    value: Math.log(o.length),
    weight: o.weight,
  }));

  const mu0 = Math.log(options.priorCycleLength);
  const kappa0 = options.priorStrength;
  const alpha0 = options.priorShape;
  const beta0 = alpha0 * options.priorLogSd ** 2;

  const w = totalWeight(items);
  const xbar = w > 0 ? weightedMean(items) : mu0;

  const kappa = kappa0 + w;
  const mu = (kappa0 * mu0 + w * xbar) / kappa;
  const alpha = alpha0 + w / 2;
  const beta =
    beta0 +
    0.5 * weightedSumSquares(items) +
    (kappa0 * w * (xbar - mu0) ** 2) / (2 * kappa);

  // Posterior predictive: t_{2α}(μ, β(κ+1)/(ακ)). The (κ+1)/κ factor is what
  // carries the uncertainty *about* μ into the prediction — dropping it is the
  // classic way to produce intervals that are too narrow when data is thin.
  const df = 2 * alpha;
  const scale = Math.sqrt((beta * (kappa + 1)) / (alpha * kappa));
  const typicalLength = Math.exp(mu);
  // E[σ²] = β/(α−1) for an inverse-gamma; α > 1 always holds here since
  // α₀ = 2.5. Expressed as days so the readout means something to a reader.
  const sigma = Math.sqrt(beta / (alpha - 1));

  return {
    mu,
    kappa,
    alpha,
    beta,
    df,
    scale,
    effectiveSample: w,
    typicalLength,
    spreadDays: typicalLength * sigma,
  };
}

/**
 * Discretise the log-normal predictive into a probability per whole day.
 *
 * Each day `d` takes the predictive mass between `d − ½` and `d + ½` days,
 * mapped through the log. Integrating the bin rather than sampling the density
 * at its centre is what keeps the total honest in the skewed tail, where the
 * two differ noticeably.
 */
export function predictivePmf(params: PosteriorParams, maxDay: number): Pmf {
  const lo = Math.max(
    1,
    Math.floor(Math.exp(params.mu - 4 * params.scale)) - 1,
  );
  const hi = Math.min(
    maxDay,
    Math.max(lo + 1, Math.ceil(Math.exp(params.mu + 4 * params.scale)) + 1),
  );

  const probabilities: number[] = [];
  const cdfAt = (days: number) =>
    days <= 0
      ? 0
      : studentTCdf((Math.log(days) - params.mu) / params.scale, params.df);

  for (let d = lo; d <= hi; d++) {
    probabilities.push(cdfAt(d + 0.5) - cdfAt(d - 0.5));
  }
  // Renormalising absorbs the truncated tails, so the drawn distribution sums
  // to exactly 1 over the days actually shown.
  return (
    normalize({ offset: lo, probabilities }) ?? {
      offset: lo,
      probabilities: [1],
    }
  );
}

// --- The symptom profile --------------------------------------------------

/**
 * Estimate P(mood swings | days before onset) from the history.
 *
 * Every reported day is assigned the lag to the next observed period start.
 * Days inside {@link PREMENSTRUAL_WINDOW} build the profile; days outside it
 * build the baseline the profile is contrasted against. Days after the last
 * observed start have no known lag and are used for neither — guessing one
 * would put the most recent (and most interesting) days into whichever bucket
 * the guess favoured.
 *
 * Each lag's rate is shrunk toward the overall rate by a pseudo-count and then
 * smoothed across neighbouring lags, because the underlying profile is a
 * gradual rise toward onset rather than a comb of independent spikes. With a
 * handful of cycles this leaves the profile nearly flat, and a nearly flat
 * profile is one that changes nothing — which is the behaviour a two-cycle
 * history deserves.
 */
export function symptomProfile(
  data: AppData,
  periods: readonly PeriodSpan[],
  options: ModelOptions,
): SymptomProfile | null {
  if (periods.length === 0) return null;

  const starts = periods.map((p) => p.start);
  const windowSwings = new Array<number>(PREMENSTRUAL_WINDOW).fill(0);
  const windowDaysAt = new Array<number>(PREMENSTRUAL_WINDOW).fill(0);
  let baselineSwings = 0;
  let baselineDays = 0;

  for (const entry of sortedEntries(data)) {
    const lag = lagToNextStart(entry.date, starts);
    if (lag === null) continue;
    if (lag < PREMENSTRUAL_WINDOW) {
      windowDaysAt[lag]! += 1;
      if (entry.moodSwings) windowSwings[lag]! += 1;
    } else {
      baselineDays += 1;
      if (entry.moodSwings) baselineSwings += 1;
    }
  }

  const totalDays = baselineDays + windowDaysAt.reduce((sum, d) => sum + d, 0);
  if (totalDays === 0) return null;
  const overall =
    (baselineSwings + windowSwings.reduce((sum, s) => sum + s, 0)) / totalDays;

  const a = options.symptomShrinkage;
  const shrunk = windowDaysAt.map(
    (days, lag) => (windowSwings[lag]! + a * overall) / (days + a),
  );
  const windowDays = windowDaysAt.reduce((sum, d) => sum + d, 0);

  return {
    window: PREMENSTRUAL_WINDOW,
    rate: smoothProfile(shrunk).map(clampRate),
    baseline: clampRate((baselineSwings + a * overall) / (baselineDays + a)),
    windowDays,
    baselineDays,
    informative:
      windowDays >= options.symptomMinDays &&
      baselineDays >= options.symptomMinDays,
  };
}

/** Days from `day` to the next period start at or after it, or null when
 *  there is none (the day sits in the still-unfinished current cycle). */
function lagToNextStart(day: DayKey, starts: readonly DayKey[]): number | null {
  for (const start of starts) {
    const lag = daysBetween(day, start);
    if (lag >= 0) return lag;
  }
  return null;
}

/** Triangular smoothing across adjacent lags, with the kernel renormalised at
 *  the ends so the boundary lags are not dragged toward zero. */
function smoothProfile(rates: readonly number[]): number[] {
  return rates.map((_, i) => {
    let sum = 0;
    let weight = 0;
    for (const [offset, w] of [
      [-1, 0.25],
      [0, 0.5],
      [1, 0.25],
    ] as const) {
      const value = rates[i + offset];
      if (value === undefined) continue;
      sum += w * value;
      weight += w;
    }
    return sum / weight;
  });
}

/** Keep a rate away from 0 and 1 so its likelihood ratio stays finite. */
function clampRate(p: number): number {
  return Math.min(0.98, Math.max(0.02, p));
}

// --- The temperature profile ----------------------------------------------

/** A reading, expressed as a deviation from its own neighbourhood's median. */
export type CentredReading = { date: DayKey; deviation: number };

/**
 * Centre every temperature reading on the median of the readings around it.
 *
 * The window is a real calendar window rather than "the last N readings", so a
 * fortnight of skipped mornings widens the neighbourhood in time instead of
 * quietly reaching back a season for its comparison points.
 */
export function centredTemperatures(
  data: AppData,
  options: ModelOptions,
): CentredReading[] {
  // Fevers are dropped rather than centred. A febrile morning is several
  // times the size of the post-ovulatory step this channel exists to read, so
  // one of them left in would both fake a shift on its own day and drag the
  // neighbourhood median that every reading around it is measured against.
  // Dropping it is not the same as ignoring the day: the reading is still in
  // the document and still on the Report screen — it just is not evidence
  // about a cycle. See `isFever` in `temperature.ts`.
  const readings = sortedEntries(data).filter(
    (e): e is DayEntry & { temperature: number } =>
      e.temperature !== null && !isFever(e.temperature),
  );

  // Readings are in date order, so the neighbourhood is a sliding window: both
  // ends only ever move forward. Rescanning the whole history for every
  // reading would be quadratic, and the backtest refits this once per held-out
  // cycle — the difference is felt on a phone.
  const out: CentredReading[] = [];
  let lo = 0;
  let hi = 0;
  for (const entry of readings) {
    while (
      daysBetween(readings[lo]!.date, entry.date) >
      options.temperatureCentreWindow
    ) {
      lo += 1;
    }
    while (
      hi < readings.length &&
      daysBetween(entry.date, readings[hi]!.date) <=
        options.temperatureCentreWindow
    ) {
      hi += 1;
    }
    const nearby = readings.slice(lo, hi).map((r) => r.temperature);
    const centre = median(nearby) ?? entry.temperature;
    out.push({ date: entry.date, deviation: entry.temperature - centre });
  }
  return out;
}

/**
 * Estimate the temperature deviation at each lag before an onset.
 *
 * Same shape as {@link symptomProfile}, and deliberately so: a channel of
 * evidence is a per-lag distribution plus the baseline it is contrasted
 * against, and adding a fourth thing to track would mean writing one more of
 * these and nothing else. The difference is only that a temperature is
 * continuous, so each lag carries a mean and the channel carries one pooled
 * spread, where mood carries a rate.
 */
export function temperatureProfile(
  data: AppData,
  periods: readonly PeriodSpan[],
  options: ModelOptions,
): TemperatureProfile | null {
  if (periods.length === 0) return null;
  const readings = centredTemperatures(data, options);
  if (readings.length === 0) return null;

  const starts = periods.map((p) => p.start);
  const windowSums = new Array<number>(PREMENSTRUAL_WINDOW).fill(0);
  const windowCounts = new Array<number>(PREMENSTRUAL_WINDOW).fill(0);
  const all: number[] = [];
  let baselineSum = 0;
  let baselineDays = 0;

  for (const reading of readings) {
    const lag = lagToNextStart(reading.date, starts);
    if (lag === null) continue;
    all.push(reading.deviation);
    if (lag < PREMENSTRUAL_WINDOW) {
      windowSums[lag]! += reading.deviation;
      windowCounts[lag]! += 1;
    } else {
      baselineSum += reading.deviation;
      baselineDays += 1;
    }
  }
  if (all.length === 0) return null;

  const overall = all.reduce((sum, d) => sum + d, 0) / all.length;
  const a = options.symptomShrinkage;
  // Same shrinkage as the mood profile: a lag seen twice is pulled almost all
  // the way back to the overall mean, so a thin history produces a flat profile
  // and a flat profile changes nothing.
  const shrunk = windowCounts.map(
    (count, lag) => (windowSums[lag]! + a * overall) / (count + a),
  );
  const windowDays = windowCounts.reduce((sum, c) => sum + c, 0);

  const variance =
    all.reduce((sum, d) => sum + (d - overall) ** 2, 0) / all.length;
  const sd = Math.max(options.temperatureMinSd, Math.sqrt(variance));
  const mean = smoothProfile(shrunk);
  const baselineMean =
    baselineDays > 0
      ? (baselineSum + a * overall) / (baselineDays + a)
      : overall;

  return {
    window: PREMENSTRUAL_WINDOW,
    mean,
    baselineMean,
    sd,
    windowDays,
    baselineDays,
    shiftCelsius: Math.round((Math.max(...mean) - baselineMean) * 1000) / 1000,
    informative:
      windowDays >= options.temperatureMinDays &&
      baselineDays >= options.temperatureMinDays,
  };
}

/**
 * The tempered log-likelihood ratio for "the period starts on `candidate`",
 * given the recent temperature readings.
 *
 * Each reading is scored under a Normal centred on the profile's mean for the
 * lag that candidate implies, against a Normal centred on the baseline. The
 * two densities share a spread, so their log ratio collapses to a difference of
 * squares and no constants survive:
 *
 *     ln L = [ (dev − baseline)² − (dev − mean[lag])² ] / 2σ²
 *
 * Which is why a run of elevated mornings favours the candidates that put those
 * mornings in the luteal plateau, and a run of low ones pushes the period
 * further out.
 */
export function temperatureLogLikelihoodRatio(
  candidate: DayKey,
  recent: readonly CentredReading[],
  profile: TemperatureProfile,
  options: ModelOptions,
): number {
  let total = 0;
  const twoVariance = 2 * profile.sd ** 2;
  for (const reading of recent) {
    const lag = daysBetween(reading.date, candidate);
    if (lag < 0 || lag >= profile.window) continue;
    const underLag = (reading.deviation - profile.mean[lag]!) ** 2;
    const underBaseline = (reading.deviation - profile.baselineMean) ** 2;
    total += (underBaseline - underLag) / twoVariance;
  }
  const tempered = total * options.temperatureTemper;
  return Math.min(
    options.symptomMaxLogLr,
    Math.max(-options.symptomMaxLogLr, tempered),
  );
}

/**
 * The tempered log-likelihood ratio for "the period starts on `candidate`",
 * given the recent reports.
 *
 * Each report at lag ℓ before the candidate contributes `ln(rate[ℓ]/baseline)`
 * when swings were reported and `ln((1−rate[ℓ])/(1−baseline))` when they were
 * not — so a quiet run is evidence *against* an imminent onset just as a rough
 * one is evidence for it. Reports at or after the candidate day say nothing
 * about it and are skipped.
 */
export function symptomLogLikelihoodRatio(
  candidate: DayKey,
  recent: readonly DayEntry[],
  profile: SymptomProfile,
  options: ModelOptions,
): number {
  let total = 0;
  for (const entry of recent) {
    const lag = daysBetween(entry.date, candidate);
    if (lag < 0 || lag >= profile.window) continue;
    const p = profile.rate[lag]!;
    const b = profile.baseline;
    total += entry.moodSwings ? Math.log(p / b) : Math.log((1 - p) / (1 - b));
  }
  const tempered = total * options.symptomTemper;
  return Math.min(
    options.symptomMaxLogLr,
    Math.max(-options.symptomMaxLogLr, tempered),
  );
}

// --- Putting it together --------------------------------------------------

/** What the within-cycle channels have to work with at prediction time. */
type Evidence = {
  moods: SymptomProfile | null;
  temperatures: TemperatureProfile | null;
  recent: readonly DayEntry[];
  recentTemperatures: readonly CentredReading[];
};

/**
 * Combine the evidence channels into one log-likelihood ratio for a candidate
 * onset day.
 *
 * Each channel is tempered and clamped *before* the sum, so no single one can
 * run away, and the total is clamped again at one and a half times the
 * per-channel cap. That ceiling is the point: two channels that agree should be
 * able to say more than either alone, but never so much more that the cycle
 * history stops mattering. Adding a third channel means one more clamped term
 * here and one more profile above — nothing else in the model changes.
 */
function evidenceLogLikelihoodRatio(
  candidate: DayKey,
  options: ModelOptions,
  evidence: Evidence,
): number {
  let total = 0;
  if (evidence.moods) {
    total += symptomLogLikelihoodRatio(
      candidate,
      evidence.recent,
      evidence.moods,
      options,
    );
  }
  if (evidence.temperatures) {
    total += temperatureLogLikelihoodRatio(
      candidate,
      evidence.recentTemperatures,
      evidence.temperatures,
      options,
    );
  }
  const ceiling = options.symptomMaxLogLr * 1.5;
  return Math.min(ceiling, Math.max(-ceiling, total));
}

/**
 * The full posterior over the next period's start date.
 *
 * Returns null when nothing has been logged yet — there is no anchor to
 * measure from, and a distribution centred on a default with no start date is
 * a chart of the app's settings, not of the user.
 */
export function probabilisticForecast(
  data: AppData,
  today: DayKey,
  model: ForecastModelKind = "multivariate",
  cycle: CycleOptions = DEFAULT_CYCLE_OPTIONS,
  options: ModelOptions = DEFAULT_MODEL_OPTIONS,
): ProbabilisticForecast | null {
  const modelOptions: ModelOptions = {
    ...options,
    priorCycleLength: cycle.defaultCycleLength,
  };

  const periods = derivePeriods(data);
  const last = periods[periods.length - 1];
  if (!last) return null;

  const observations = observationsFrom(periods, modelOptions);
  const params = fitPosterior(observations, modelOptions);

  // Roll the anchor forward over cycles that were never logged, on the same
  // rule `cycle.ts` uses: stop at the first projected start less than a whole
  // cycle in the past, so a period that is merely late reads as late rather
  // than silently jumping a month. Keeping the two in step matters — the
  // headline date and the chart must agree.
  const typical = Math.max(1, Math.round(params.typicalLength));
  let anchorStart = last.start;
  while (daysBetween(addDays(anchorStart, typical), today) >= typical) {
    anchorStart = addDays(anchorStart, typical);
  }

  const prior = predictivePmf(params, modelOptions.maxLeadDays);

  // Both profiles are estimated from lags to *observed* onsets, so neither
  // ever sees the day it is about to be asked to explain.
  const multivariate = model === "multivariate";
  const moods = multivariate
    ? symptomProfile(data, periods, modelOptions)
    : null;
  const temperatures = multivariate
    ? temperatureProfile(data, periods, modelOptions)
    : null;
  const usableMoods = moods?.informative ? moods : null;
  const usableTemperatures = temperatures?.informative ? temperatures : null;
  const hasEvidence = usableMoods !== null || usableTemperatures !== null;

  const recent = sortedEntries(data).filter(
    (e) => e.date <= today && daysBetween(e.date, today) < PREMENSTRUAL_WINDOW,
  );
  const recentTemperatures = usableTemperatures
    ? centredTemperatures(data, modelOptions).filter(
        (r) =>
          r.date <= today && daysBetween(r.date, today) < PREMENSTRUAL_WINDOW,
      )
    : [];

  const posteriorProbabilities = prior.probabilities.map((p, i) => {
    const day = addDays(anchorStart, prior.offset + i);
    if (isRuledOut(data, day, today)) return 0;
    if (!hasEvidence) return p;
    return (
      p *
      Math.exp(
        evidenceLogLikelihoodRatio(day, modelOptions, {
          moods: usableMoods,
          temperatures: usableTemperatures,
          recent,
          recentTemperatures,
        }),
      )
    );
  });

  // If every candidate was ruled out — a period that is late past the end of
  // the modelled window, with every day since dutifully logged — fall back to
  // the unconditioned prior rather than showing nothing. The forecast is then
  // simply out of date, which the overdue wording already says.
  const posterior =
    normalize({
      offset: prior.offset,
      probabilities: posteriorProbabilities,
    }) ?? prior;

  const medianOffset = pmfQuantile(posterior, 0.5);
  const expectedDay = addDays(anchorStart, medianOffset);

  const intervals: ForecastInterval[] = INTERVAL_MASSES.map((mass) => {
    const { lower, upper } = credibleInterval(posterior, mass);
    return {
      mass,
      start: addDays(anchorStart, lower),
      end: addDays(anchorStart, upper),
      widthDays: upper - lower + 1,
    };
  });

  let cumulative = 0;
  const days: ForecastDay[] = posterior.probabilities.map((p, i) => {
    cumulative += p;
    const offset = posterior.offset + i;
    const day = addDays(anchorStart, offset);
    return {
      day,
      offset,
      probability: p,
      priorProbability: prior.probabilities[i] ?? 0,
      cumulative,
      excluded: isRuledOut(data, day, today),
    };
  });

  const width80 =
    intervals.find((i) => i.mass === 0.8)?.widthDays ??
    Number.POSITIVE_INFINITY;

  return {
    model,
    anchorStart,
    lastObservedStart: last.start,
    days,
    expectedDay,
    peakDay: addDays(anchorStart, pmfMode(posterior)),
    daysUntilExpected: daysBetween(today, expectedDay),
    intervals,
    spreadDays: Math.round(pmfStdev(posterior) * 10) / 10,
    probabilityWithinWeek: probabilityWithin(days, today, 7),
    params,
    observations,
    symptoms: moods,
    temperature: temperatures,
    // Measured on the median, the same statistic the headline moves by — so
    // "this cycle's reports moved it two days earlier" is a claim about the
    // number the reader is looking at.
    evidenceShiftDays: hasEvidence ? medianOffset - pmfQuantile(prior, 0.5) : 0,
    confidence: confidenceFrom(width80, params.effectiveSample),
  };
}

/** Whether a candidate start day is impossible: already past, and reported
 *  with no bleeding. A day with no report at all stays possible — not logging
 *  is not the same claim as logging a no. */
function isRuledOut(data: AppData, day: DayKey, today: DayKey): boolean {
  if (day > today) return false;
  const entry = data.entries[day];
  return entry !== undefined && !entry.bleeding;
}

/** Posterior mass falling in the next `window` days from `today`, inclusive. */
function probabilityWithin(
  days: readonly ForecastDay[],
  today: DayKey,
  window: number,
): number {
  return days.reduce((sum, d) => {
    const lead = daysBetween(today, d.day);
    return lead >= 0 && lead <= window ? sum + d.probability : sum;
  }, 0);
}

/**
 * The confidence label, from the thing it should always have been derived
 * from: how wide the interval actually is.
 *
 * `cycleStats().confidence` counts cycles and eyeballs their spread. This
 * reads the answer straight off the posterior, so it cannot disagree with the
 * band drawn next to it — a "steady pattern" label above a nine-day-wide
 * interval is the kind of contradiction that teaches people to ignore labels.
 *
 * The thresholds are set against what this model can actually achieve rather
 * than against a round number: a week-wide 80% band (about ±3 days) on five or
 * more cycles is a genuinely steady pattern, and demanding better would leave
 * "high" permanently out of reach, which is worse than not having the label.
 */
export function confidenceFrom(
  width80Days: number,
  effectiveSample: number,
): Confidence {
  if (effectiveSample <= 0) return "none";
  if (width80Days <= 7 && effectiveSample >= 5) return "high";
  if (width80Days <= 11 && effectiveSample >= 2.5) return "medium";
  return "low";
}

// --- Backtesting ----------------------------------------------------------

/** One held-out cycle, predicted from everything before it. */
export type BacktestFold = {
  /** The onset that was actually observed. */
  actual: DayKey;
  /** What the model said, from data available at `evaluatedOn`. */
  predicted: DayKey;
  /** The day the prediction was made — always before `actual`. */
  evaluatedOn: DayKey;
  /** Signed error in days; positive means the model predicted too late. */
  errorDays: number;
  /** The same for the plain "last start + median gap" rule. */
  baselineErrorDays: number;
  /** Whether the actual onset fell inside each credible interval. */
  within80: boolean;
  within95: boolean;
};

/** What the advanced view reports about the model's own track record. */
export type BacktestResult = {
  folds: BacktestFold[];
  /** Mean and median |error| in days, or null with too few folds. */
  meanAbsoluteError: number | null;
  medianAbsoluteError: number | null;
  /** The same for the baseline rule, for comparison. */
  baselineMeanAbsoluteError: number | null;
  /** Share of folds the interval actually covered — the number that says
   *  whether the bands can be believed. */
  coverage80: number | null;
  coverage95: number | null;
};

const EMPTY_BACKTEST: BacktestResult = {
  folds: [],
  meanAbsoluteError: null,
  medianAbsoluteError: null,
  baselineMeanAbsoluteError: null,
  coverage80: null,
  coverage95: null,
};

/**
 * Rolling-origin backtest: for each cycle from the sixth on, refit on
 * everything strictly before it and predict it.
 *
 * The evaluation date is chosen from *past* data only — the previous start
 * plus the then-known median gap, less `leadDays` — so no fold can see the
 * onset it is being scored against. The realised lead therefore varies from
 * fold to fold, which is the price of not peeking, and the honest version of
 * the question "how good is this a few days out?".
 *
 * Coverage is the number worth reading. A model whose 80% band contains the
 * answer 80% of the time is calibrated; one that manages 40% is drawing
 * confident nonsense, and this is the only place that would show up.
 */
export function backtest(
  data: AppData,
  model: ForecastModelKind = "multivariate",
  cycle: CycleOptions = DEFAULT_CYCLE_OPTIONS,
  options: ModelOptions = DEFAULT_MODEL_OPTIONS,
  leadDays = 5,
): BacktestResult {
  const periods = derivePeriods(data);
  if (periods.length < MIN_BACKTEST_PERIODS) return EMPTY_BACKTEST;

  const entries = sortedEntries(data);
  const folds: BacktestFold[] = [];

  for (let t = MIN_BACKTEST_PERIODS - 1; t < periods.length; t++) {
    const actual = periods[t]!.start;
    const previous = periods[t - 1]!.start;

    const priorGaps: number[] = [];
    for (let i = 1; i < t; i++) {
      priorGaps.push(daysBetween(periods[i - 1]!.start, periods[i]!.start));
    }
    const priorMedian = median(priorGaps) ?? cycle.defaultCycleLength;
    const evaluatedOn = addDays(previous, Math.round(priorMedian) - leadDays);

    // A fold whose evaluation date has already reached the onset would be
    // scoring the model on data that contains the answer. Drop it.
    if (daysBetween(evaluatedOn, actual) <= 0) continue;

    const truncated: AppData = {
      version: data.version,
      entries: Object.fromEntries(
        entries.filter((e) => e.date <= evaluatedOn).map((e) => [e.date, e]),
      ),
    };

    const prediction = probabilisticForecast(
      truncated,
      evaluatedOn,
      model,
      cycle,
      options,
    );
    if (!prediction) continue;

    const baseline = addDays(previous, Math.round(priorMedian));
    const within = (mass: number) => {
      const interval = prediction.intervals.find((i) => i.mass === mass);
      return interval !== undefined
        ? actual >= interval.start && actual <= interval.end
        : false;
    };

    folds.push({
      actual,
      predicted: prediction.expectedDay,
      evaluatedOn,
      errorDays: daysBetween(actual, prediction.expectedDay),
      baselineErrorDays: daysBetween(actual, baseline),
      within80: within(0.8),
      within95: within(0.95),
    });
  }

  if (folds.length === 0) return EMPTY_BACKTEST;

  const absolute = folds.map((f) => Math.abs(f.errorDays));
  const baselineAbsolute = folds.map((f) => Math.abs(f.baselineErrorDays));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const average = (values: number[]) =>
    values.reduce((sum, v) => sum + v, 0) / values.length;

  return {
    folds,
    meanAbsoluteError: round1(average(absolute)),
    medianAbsoluteError: median(absolute),
    baselineMeanAbsoluteError: round1(average(baselineAbsolute)),
    coverage80: round1(
      (folds.filter((f) => f.within80).length / folds.length) * 100,
    ),
    coverage95: round1(
      (folds.filter((f) => f.within95).length / folds.length) * 100,
    ),
  };
}

/** How many complete cycles the model was fitted on — the sample size the
 *  confidence wording quotes. */
export function trackedCycles(data: AppData): number {
  return cycleStats(data).cycleLengths.length;
}
