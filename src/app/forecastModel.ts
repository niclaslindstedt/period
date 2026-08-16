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
// Four refinements on top, each earning its complexity:
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
//   - **A mixture, not one bell.** Cycle length is a cluster of ordinary
//     cycles plus an occasional stretched one (Harlow & Zeger's standard /
//     nonstandard split). The fit gives each observation a responsibility for
//     the standard component and downweights the rest, so one 45-day cycle
//     stops inflating the spread every ordinary cycle is judged by — and the
//     predictive keeps a wide component at the fitted outlier share, so the
//     possibility of another stretched cycle is priced in rather than denied.
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
// The structure generalises. A further symptom is another profile and another
// factor in the product — nothing about the model is specific to mood swings.
//
// ## The ovulatory channels (lust, sex, ovulation tests)
//
// Mood swings and temperature both speak about the *fortnight before* an onset.
// That leaves the first half of the cycle silent, and the first half of the
// cycle is where the one genuinely datable event lives: ovulation. The luteal
// phase between ovulation and the next onset is the steadiest span in the whole
// cycle — far steadier than the follicular phase that precedes it — so anything
// that pins down ovulation pins down the onset better than anything measured
// afterwards can.
//
// Three reports do that, and they are read over a longer window
// ({@link OVULATORY_WINDOW}) precisely so the profile can reach back past the
// luteal phase to the days ovulation actually falls on:
//
//   - **Lust.** Sex drive rises toward ovulation. A learned per-lag rate, the
//     same machinery as mood swings, only with the peak in a different place.
//   - **Sex.** The same, and deliberately learned rather than assumed: whether
//     it tracks the cycle at all is a fact about a person's life, not about
//     their hormones. The shrinkage that keeps a thin mood profile flat is what
//     keeps a *confounded* channel flat here, so a report that predicts nothing
//     moves nothing.
//   - **An ovulation test.** Different in kind, and the only channel whose
//     profile is not learned from scratch. An LH strip is a calibrated
//     instrument for one event, so its profile is *constructed*: a bump of
//     positive-test probability centred on the lead from a surge to the next
//     onset, with the centre of that bump shrunk toward the configured luteal
//     phase and pulled by whatever positives the history holds. That is what
//     lets a strip help on the first cycle it is used, which is the whole
//     reason anyone buys them.
//
// The channels stay separate terms in the same clamped product. Lust and sex
// are correlated with each other and with the same underlying event, so they
// are tempered harder than mood is; the total is capped as before, so five
// channels that all agree still cannot overrule the cycle history.
//
// ## The thermal-shift anchor
//
// Nearly all of a cycle's variability is follicular; the luteal phase is the
// steady half. So the single most informative event a thermometer can catch is
// the day the temperature *steps up* — the classic three-over-six coverline
// rule, run on the centred readings. Once this cycle's step is detected, the
// onset is one luteal phase away regardless of what the follicular phase did,
// and a Gaussian on that lead (learned from the reader's own past shifts, like
// the ovulation test's) collapses most of the remaining spread. It is a sixth
// clamped term in the same product: the same mornings also feed the plateau
// profile, and the shared ceiling is what keeps the overlap honest.
//
// ## How long an episode lasts
//
// The distribution above is over the day the next period *starts*. A calendar
// paints the days a period *covers*, and the two are only the same question if
// you also know how long an episode runs — so a small companion distribution is
// fitted over episode lengths, from the completed episodes in the history.
//
// It answers both of the coverage questions the screens ask, which is the point
// of keeping it in one place: how far past its start day the next period is
// likely to reach, and — conditioned on what has already been observed — how
// much longer the period running *right now* is likely to last. The second one
// is what puts colour on the days after "cycle day 1", which the start-day
// distribution alone has nothing to say about: it is busy describing a period
// four weeks out.
//
// ## The cycles after the next one
//
// A calendar is paged, so it asks about months the "next period" is not in. The
// answer is the same distribution applied again: the second onset is the first
// plus another cycle length, which is a convolution of two things already
// fitted here. No second model, and no stamping the typical length forward from
// the predicted date — a projection has to carry the uncertainty it was built
// from, and each cycle out is correspondingly wider until the screens stop
// having anything to paint.
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
  inProgressPeriod,
  type Confidence,
  type CycleOptions,
  type PeriodSpan,
} from "./cycle.ts";
import {
  convolve,
  credibleInterval,
  median,
  normalize,
  pmfMean,
  pmfMode,
  pmfQuantile,
  pmfStdev,
  studentTCdf,
  studentTPdf,
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
  /** Exponent applied to each ovulatory binary channel's log-likelihood-ratio.
   *  Lower than the mood one because lust and sex are correlated with *each
   *  other* as well as within themselves, and two terms that double-count the
   *  same evening would otherwise say twice what one evening is worth. */
  ovulatoryTemper: number;
  /** Exponent applied to the ovulation-test log-likelihood-ratio. Higher than
   *  the others: a strip is a measurement of one event on one day rather than a
   *  mood that ran all week, so there is far less autocorrelation to discount —
   *  and there are only ever a handful of them to read. */
  fertilityTemper: number;
  /**
   * Spread, in days, of the lead from a positive ovulation test to the next
   * onset. Two days: the luteal phase is the least variable stretch of the
   * cycle, and the residual is mostly *when the strip was read* rather than
   * when the corpus luteum gave out.
   */
  fertilityLeadSd: number;
  /**
   * How much the configured luteal phase counts for, in positive tests, when
   * estimating that lead. Two, so a first strip is read against the textbook
   * span and a season of them is read against the reader's own.
   */
  fertilityLeadPriorStrength: number;
  /**
   * Ceiling on the *combined* log-likelihood ratio, after every channel has
   * been tempered and clamped on its own.
   *
   * The point of a separate ceiling is that channels which agree should be able
   * to say more than any one of them alone, but never so much more that the
   * cycle history stops mattering. e⁴·⁵ ≈ 90:1 against the prior is already
   * further than five noisy indicators deserve to move a date.
   */
  evidenceMaxLogLr: number;
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
  /**
   * How many onsets ahead the calendar is projected — the next period, then the
   * one after it, and so on (see {@link projectOnsets}).
   *
   * Twelve is about a year, and it is a ceiling rather than a target: the
   * projection stops on its own as soon as a cycle is too spread out to say
   * anything (see {@link projectionMassFloor}), which for most histories
   * happens long before the twelfth. It exists so a freakishly regular history
   * cannot ask for a decade of arithmetic.
   */
  projectedCycles: number;
  /**
   * How wide a projected onset's 80% interval may get, as a share of a typical
   * cycle, before the projection stops.
   *
   * This is where a projection stops being a date and becomes a shrug, and the
   * line is drawn by comparing the estimate to the thing it is estimating. Half
   * a cycle is the last point at which "the period is around here" says more
   * than "some time that month": at a whole cycle the intervals of consecutive
   * onsets touch, and a calendar drawing them would be shading a stripe of
   * uncertainty rather than marking a period.
   *
   * It is a rule about the *history*, not the horizon — a steady one is located
   * to within a few days for months, an erratic one loses the thread after the
   * next period, and each is projected exactly as far as it earns.
   */
  projectionMaxSpreadShare: number;
  /**
   * How much wider the *nonstandard* cycle component is than the standard one,
   * on the log scale. Cycle length is a mixture (Harlow & Zeger): a symmetric
   * cluster of ordinary cycles plus an occasional stretched one — an
   * anovulatory cycle, an illness, a stressful season. Four standard spreads is
   * wide enough that a 45-day cycle in a 28±2 history reads as a member of the
   * wide component rather than as reason to doubt every ordinary cycle.
   */
  outlierScale: number;
  /** Prior share of cycles that are nonstandard. About one in thirteen, which
   *  is the order reported for regularly cycling adults. */
  outlierPriorShare: number;
  /** How many cycles that prior share is worth. Twelve: the share should move
   *  slowly — one odd cycle is not a new regime. */
  outlierPriorStrength: number;
  /** Exponent applied to the thermal-shift log-likelihood ratio. High, like
   *  the ovulation test's, because a detected shift is one dated event rather
   *  than a fortnight of correlated mornings — but not 1, because the same
   *  mornings also feed the temperature profile and the overlap must not be
   *  counted twice at full strength. */
  thermalShiftTemper: number;
  /** Spread, in days, of the lead from a detected thermal shift to the next
   *  onset. A little wider than the ovulation test's: the luteal phase itself
   *  varies by a couple of days within a person, and the detected shift day
   *  adds a morning or two of reading noise on top. */
  thermalShiftLeadSd: number;
  /** How much the configured luteal phase counts for, in detected shifts, when
   *  estimating that lead. Two, on the ovulation test's reasoning: a first
   *  shift is read against the textbook span, a season of them against the
   *  reader's own. */
  thermalShiftLeadPriorStrength: number;
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
  ovulatoryTemper: 0.35,
  fertilityTemper: 0.8,
  fertilityLeadSd: 2,
  fertilityLeadPriorStrength: 2,
  evidenceMaxLogLr: 4.5,
  temperatureTemper: 0.35,
  temperatureCentreWindow: 45,
  temperatureMinSd: 0.06,
  temperatureMinDays: 12,
  maxLeadDays: 90,
  projectedCycles: 12,
  projectionMaxSpreadShare: 0.5,
  outlierScale: 4,
  outlierPriorShare: 0.075,
  outlierPriorStrength: 12,
  thermalShiftTemper: 0.8,
  thermalShiftLeadSd: 2.5,
  thermalShiftLeadPriorStrength: 2,
};

/**
 * How many days before an onset count as "premenstrual" for the symptom
 * profile. Fourteen days is the luteal phase: the clinical description of
 * premenstrual symptoms puts their onset one to two weeks before bleeding,
 * rising toward it. A window is needed because the profile is a *contrast* —
 * the rate inside it only means something against the rate outside.
 */
export const PREMENSTRUAL_WINDOW = 14;

/**
 * How many days before an onset the ovulatory channels are profiled over.
 *
 * It has to reach past the luteal phase, because that is where the event these
 * channels are about actually sits: ovulation is roughly fourteen days before
 * an onset, so a window of fourteen would put the peak exactly on its own edge
 * and see none of the days around it. Twenty-one covers ovulation and the
 * fertile days either side of it while still leaving the first week of a
 * typical cycle outside — and the contrast against that week, when lust is
 * lowest and nobody is testing, is the whole of what these profiles measure.
 */
export const OVULATORY_WINDOW = 21;

/** How far back a report can still be evidence about the next onset — the
 *  longest of the per-channel windows. Each channel then clips to its own,
 *  so widening this one cannot change what a narrower channel reads. */
export const EVIDENCE_WINDOW = Math.max(PREMENSTRUAL_WINDOW, OVULATORY_WINDOW);

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
  /**
   * How much of this observation the fit read as a *standard* cycle, 0–1. The
   * robust fit multiplies it into the weight, so a 45-day cycle in a 28-day
   * history informs the wide component's share instead of stretching the
   * spread every ordinary cycle is judged against. Absent when the fit was not
   * robust (the plain {@link fitPosterior}).
   */
  standardShare?: number;
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
  /**
   * Posterior share of cycles belonging to the wide, nonstandard component —
   * the mixture's answer to "how often does one of my cycles go long?". Zero
   * from the plain {@link fitPosterior}, in which case the predictive is the
   * single Student-t it always was.
   */
  outlierShare: number;
  /** Scale of the nonstandard component's predictive, on the `ln(days)`
   *  scale — the standard scale times {@link ModelOptions.outlierScale}. */
  wideScale: number;
};

/**
 * The estimated relationship between one yes/no report and an approaching
 * onset.
 *
 * One shape for every binary channel — mood swings, lust, sex, and the
 * constructed ovulation-test profile — because that is all a binary channel
 * ever is: a rate per lag, and the rate outside the window it is contrasted
 * against. Adding a channel is a `read` function and a window, and nothing
 * else in the model changes.
 */
export type BinaryProfile = {
  /** Lags covered: 0 (the onset day) up to `window − 1`. */
  window: number;
  /** `rate[lag]` — P(a yes | `lag` days before onset). */
  rate: number[];
  /** P(a yes | outside the window). */
  baseline: number;
  /** Observed days behind the in-window rates and the baseline. Days the
   *  question was not answered — an untaken test — count for neither. */
  windowDays: number;
  baselineDays: number;
  /** Whether there is enough of both to let the profile move the forecast. */
  informative: boolean;
};

/** The mood-swing channel's profile. The name the screens and the tests know
 *  it by; the shape is the generic one above. */
export type SymptomProfile = BinaryProfile;

/**
 * The ovulation-test channel, as the same profile plus the one number that
 * built it.
 *
 * `leadDays` is exposed rather than kept private because it is the claim the
 * channel makes — "a positive strip means a period in about this many days" —
 * and the advanced view quotes it. It is also the only number here a reader
 * could sanity-check against their own experience.
 */
export type FertilityTestProfile = BinaryProfile & {
  /** Days from a positive test to the next onset: the configured luteal phase
   *  plus a day for the surge, pulled toward whatever the history has seen. */
  leadDays: number;
  /** Positive tests with a known following onset — what `leadDays` was learned
   *  from, and zero while the prior is doing all the work. */
  observedPositives: number;
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
   * The same question asked of every cycle ahead, not only the next one: the
   * probability that *a* period starts on each day, oldest day first.
   *
   * Its first cycle's worth of days carries exactly the probabilities in
   * `days` — this is that distribution with the later onsets projected on
   * behind it (see {@link projectOnsets}), never a second estimate of it. The
   * Calendar screen paints from this, which is how it fills in the months after
   * next without the Status and Forecast screens' answers moving a day.
   */
  onsets: OnsetDay[];
  /**
   * The day each projected cycle is expected to start on, oldest first, and the
   * first of them is {@link expectedDay}.
   *
   * The distribution above says how likely each day is; this says which day
   * each period is *named* by, and the calendar needs both. Far enough ahead no
   * single day is more likely than not a period day — the spread has grown past
   * the width of a period — and a calendar painting only the days that clear a
   * half would answer "when is my period in September?" with an empty month,
   * which is a worse answer than the honest one. So the span each of these
   * starts is drawn, in the outline that means *predicted*, and the percentage
   * beside it on the Status screen stays the real one.
   */
  upcomingStarts: DayKey[];
  /** How long an episode lasts, and where the one running now has got to.
   *  Turns the start-day distribution above into a statement about the days a
   *  period *covers*, which is what the Status and Calendar screens paint. */
  periodLength: PeriodLengthModel;
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
  /** The two ovulatory yes/no channels, on the same terms as `symptoms`. */
  lust: BinaryProfile | null;
  sex: BinaryProfile | null;
  /** The ovulation-test channel, or null until a test has been logged. */
  fertilityTest: FertilityTestProfile | null;
  temperature: TemperatureProfile | null;
  /** The thermal-shift anchor, or null until a temperature has been logged.
   *  Present with `detectedDay: null` while this cycle's step has not been
   *  seen — which the screen says out loud, because "not yet" is itself
   *  information about where the cycle has got to. */
  thermalShift: ThermalShiftEstimate | null;
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
    outlierShare: 0,
    wideScale: scale * options.outlierScale,
  };
}

/** EM passes for the robust fit. The first finds the outliers against the
 *  contaminated fit and each later one re-reads them against a cleaner fit;
 *  an outlier four spreads out needs the full five to fall from "suspicious"
 *  to the sliver it deserves, and a sixth moves nothing a whole day cares
 *  about. Each pass is one closed-form update — there is no optimiser here. */
const ROBUST_ITERATIONS = 5;

/**
 * The mixture fit: standard cycles, plus a wide component for the occasional
 * stretched one.
 *
 * Cycle length is not one distribution. The literature since Harlow & Zeger
 * (1991) models it as a mixture — a symmetric cluster of ordinary ovulatory
 * cycles and a long-tailed remainder of delayed ones — and a single-component
 * fit pays for ignoring that in one specific way: one 45-day cycle inflates
 * the fitted spread, and every interval for the next year is wider than the
 * reader's actual pattern deserves.
 *
 * So the fit is a small EM: each observation gets a *responsibility* — the
 * posterior probability it belongs to the standard component, judged under the
 * current fit — and the conjugate update is re-run with each weight multiplied
 * by it. An ordinary cycle keeps its weight; a stretched one keeps only a
 * sliver, and what it mostly informs is the mixture share itself, which the
 * predictive keeps as a wide component. The odd cycle is not thrown away — it
 * is filed where it belongs.
 *
 * A genuinely erratic history downweights *nothing*: when every cycle
 * disagrees, the fitted spread is wide, no observation looks unusual against
 * it, and every responsibility stays near one. The robustness only engages
 * when there is a tight pattern for an outlier to stand out from — which is
 * exactly when protecting the pattern matters.
 */
export function fitRobustPosterior(
  observations: readonly CycleObservation[],
  options: ModelOptions,
): { params: PosteriorParams; observations: CycleObservation[] } {
  const a0 = options.outlierPriorShare * options.outlierPriorStrength;
  const b0 = (1 - options.outlierPriorShare) * options.outlierPriorStrength;

  let responsibilities = observations.map(() => 1);
  let params = fitPosterior(observations, options);
  let share = options.outlierPriorShare;

  for (let pass = 0; pass < ROBUST_ITERATIONS; pass++) {
    responsibilities = observations.map((o) => {
      const z = (Math.log(o.length) - params.mu) / params.scale;
      const standard = studentTPdf(z, params.df) / params.scale;
      const wide =
        studentTPdf((z * params.scale) / params.wideScale, params.df) /
        params.wideScale;
      return ((1 - share) * standard) / ((1 - share) * standard + share * wide);
    });
    const outlierWeight = observations.reduce(
      (sum, o, i) => sum + o.weight * (1 - responsibilities[i]!),
      0,
    );
    const total = observations.reduce((sum, o) => sum + o.weight, 0);
    share = (a0 + outlierWeight) / (a0 + b0 + total);
    params = fitPosterior(
      observations.map((o, i) => ({
        ...o,
        weight: o.weight * responsibilities[i]!,
      })),
      options,
    );
  }

  return {
    params: { ...params, outlierShare: share },
    observations: observations.map((o, i) => ({
      ...o,
      standardShare: responsibilities[i]!,
    })),
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
  // With a nonstandard share the predictive is a two-component mixture, and
  // the enumerated range has to reach the wide component's tails — 2.5 of its
  // scales holds about 99% of it, and renormalising absorbs the rest.
  const mixing = params.outlierShare > 0;
  const reach = mixing
    ? Math.max(4 * params.scale, 2.5 * params.wideScale)
    : 4 * params.scale;
  const lo = Math.max(1, Math.floor(Math.exp(params.mu - reach)) - 1);
  const hi = Math.min(
    maxDay,
    Math.max(lo + 1, Math.ceil(Math.exp(params.mu + reach)) + 1),
  );

  const probabilities: number[] = [];
  const cdfAt = (days: number) => {
    if (days <= 0) return 0;
    const x = Math.log(days) - params.mu;
    const standard = studentTCdf(x / params.scale, params.df);
    if (!mixing) return standard;
    const wide = studentTCdf(x / params.wideScale, params.df);
    return (1 - params.outlierShare) * standard + params.outlierShare * wide;
  };

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

// --- The binary channels --------------------------------------------------

/** How one day answers a binary channel: true, false, or *not answered* —
 *  which is a third thing, and the reason an ovulation test can share this
 *  machinery with a question that is answered every evening. */
export type BinaryRead = (entry: DayEntry) => boolean | null;

/**
 * Estimate P(a yes | days before onset) from the history.
 *
 * Every answered day is assigned the lag to the next observed period start.
 * Days inside `window` build the profile; days outside it build the baseline
 * the profile is contrasted against. Days after the last observed start have no
 * known lag and are used for neither — guessing one would put the most recent
 * (and most interesting) days into whichever bucket the guess favoured. Days
 * where `read` returns null were not answered at all and are used for neither
 * either.
 *
 * Each lag's rate is shrunk toward the overall rate by a pseudo-count and then
 * smoothed across neighbouring lags, because the underlying profile is a
 * gradual rise toward an event rather than a comb of independent spikes. With a
 * handful of cycles this leaves the profile nearly flat, and a nearly flat
 * profile is one that changes nothing — which is the behaviour a two-cycle
 * history deserves, and also the behaviour a channel that simply does not track
 * the cycle deserves however long it is logged.
 */
export function binaryProfile(
  data: AppData,
  periods: readonly PeriodSpan[],
  options: ModelOptions,
  read: BinaryRead,
  window: number,
  minDays: number = options.symptomMinDays,
): BinaryProfile | null {
  if (periods.length === 0) return null;

  const starts = periods.map((p) => p.start);
  const windowYes = new Array<number>(window).fill(0);
  const windowDaysAt = new Array<number>(window).fill(0);
  let baselineYes = 0;
  let baselineDays = 0;

  for (const entry of sortedEntries(data)) {
    const answer = read(entry);
    if (answer === null) continue;
    const lag = lagToNextStart(entry.date, starts);
    if (lag === null) continue;
    if (lag < window) {
      windowDaysAt[lag]! += 1;
      if (answer) windowYes[lag]! += 1;
    } else {
      baselineDays += 1;
      if (answer) baselineYes += 1;
    }
  }

  const windowDays = windowDaysAt.reduce((sum, d) => sum + d, 0);
  const totalDays = baselineDays + windowDays;
  if (totalDays === 0) return null;
  const overall =
    (baselineYes + windowYes.reduce((sum, s) => sum + s, 0)) / totalDays;

  const a = options.symptomShrinkage;
  const shrunk = windowDaysAt.map(
    (days, lag) => (windowYes[lag]! + a * overall) / (days + a),
  );

  return {
    window,
    // Wrapped rather than passed by reference: `map` supplies the index as a
    // second argument, which `clampRate` would read as a floor.
    rate: smoothProfile(shrunk).map((r) => clampRate(r)),
    baseline: clampRate((baselineYes + a * overall) / (baselineDays + a)),
    windowDays,
    baselineDays,
    informative: windowDays >= minDays && baselineDays >= minDays,
  };
}

/** The mood-swing profile: the premenstrual channel, over the premenstrual
 *  window. */
export function symptomProfile(
  data: AppData,
  periods: readonly PeriodSpan[],
  options: ModelOptions,
): SymptomProfile | null {
  return binaryProfile(
    data,
    periods,
    options,
    (e) => e.moodSwings,
    PREMENSTRUAL_WINDOW,
  );
}

/** The lust profile: an ovulatory channel, so it is read over the longer
 *  window that reaches back to ovulation itself. */
export function lustProfile(
  data: AppData,
  periods: readonly PeriodSpan[],
  options: ModelOptions,
): BinaryProfile | null {
  return binaryProfile(data, periods, options, (e) => e.lust, OVULATORY_WINDOW);
}

/** The sex profile. Identical machinery to lust, and separate from it because
 *  wanting to and doing are different days for most people — and because
 *  whether either tracks the cycle is a question the history answers rather
 *  than one the model assumes. */
export function sexProfile(
  data: AppData,
  periods: readonly PeriodSpan[],
  options: ModelOptions,
): BinaryProfile | null {
  return binaryProfile(data, periods, options, (e) => e.sex, OVULATORY_WINDOW);
}

// --- The ovulation-test channel -------------------------------------------

/**
 * The chance a surge is caught at all, by someone testing through the days it
 * could fall on. Not 1: a strip read at the wrong hour of a surge that lasts
 * about a day is the ordinary way to miss one.
 *
 * It is spread across the lags rather than placed on any of them, which is the
 * subtle half of this profile and the half that is easy to get wrong. `rate` is
 * a *marginal* — the chance a test taken at this lag reads positive — and a
 * surge happens once, so those chances have to add up to one detection across
 * the bump, not to one at every lag inside it. A bump that peaked at the
 * detection rate would be claiming three or four positive strips a cycle, and
 * would then read the (entirely expected) negatives on the days either side of
 * a real positive as evidence against it.
 */
const FERTILITY_TEST_DETECTION = 0.75;

/** How often a test reads positive at a lag the surge is nowhere near — LH
 *  pulses outside the surge, and strips read optimistically. Small, and
 *  non-zero so a mistimed positive is finite evidence rather than an
 *  impossibility. */
const FERTILITY_TEST_FLOOR = 0.01;

/** The rate a test is contrasted against: how often a test taken at a lag the
 *  profile says nothing about comes back positive. Above the floor, so a
 *  positive strip at the wrong distance from an onset counts *against* that
 *  onset instead of merely failing to count for it. */
const FERTILITY_TEST_BASELINE = 0.02;

/** The narrowest and widest lead from a positive test to an onset that is worth
 *  learning from. Outside it the "positive" was a mistimed strip or an onset
 *  that was never logged, and averaging it in would move the centre of the
 *  bump by more than the observation is worth. */
const FERTILITY_LEAD_RANGE = { min: 5, max: OVULATORY_WINDOW - 1 } as const;

/**
 * Build the ovulation-test profile.
 *
 * The one channel whose per-lag rates are *constructed* rather than learned,
 * and the reason is what a strip is: an assay for a single hormone with a known
 * relationship to a single event. The shape of `rate[lag]` is not a personal
 * idiosyncrasy waiting to be discovered — it is a bump on the days a surge
 * could be, and the only genuinely personal number in it is where that bump
 * sits, which is the lead from the surge to the next onset.
 *
 * So the lead is what gets learned. It starts at the configured luteal phase
 * plus a day (a strip turns positive roughly a day before ovulation) and is
 * pulled toward whatever the reader's own positives have actually been followed
 * by, at {@link ModelOptions.fertilityLeadPriorStrength} tests' worth of
 * inertia. That is what lets a strip help on the very first cycle it is used —
 * a learned profile would need a season of tests before it said anything, and a
 * season of tests is not why anyone buys them.
 *
 * Returns null until at least one test has been logged: a channel nobody uses
 * should be absent rather than flat, so the screen can say "no tests yet"
 * rather than draw a bump nothing produced.
 */
export function fertilityTestProfile(
  data: AppData,
  periods: readonly PeriodSpan[],
  options: ModelOptions,
  cycle: CycleOptions = DEFAULT_CYCLE_OPTIONS,
): FertilityTestProfile | null {
  if (periods.length === 0) return null;

  const starts = periods.map((p) => p.start);
  const leads: number[] = [];
  let windowDays = 0;
  let baselineDays = 0;
  let tests = 0;

  for (const entry of sortedEntries(data)) {
    if (entry.fertilityTest === null) continue;
    tests += 1;
    const lag = lagToNextStart(entry.date, starts);
    if (lag === null) continue;
    if (lag < OVULATORY_WINDOW) windowDays += 1;
    else baselineDays += 1;
    if (
      entry.fertilityTest === "positive" &&
      lag >= FERTILITY_LEAD_RANGE.min &&
      lag <= FERTILITY_LEAD_RANGE.max
    ) {
      leads.push(lag);
    }
  }
  if (tests === 0) return null;

  // The surge precedes ovulation by about a day, and ovulation precedes the
  // onset by the luteal phase — so a positive strip leads the onset by one more
  // day than the luteal setting alone.
  const priorLead = cycle.lutealPhaseLength + 1;
  const k = options.fertilityLeadPriorStrength;
  const leadDays =
    (leads.reduce((sum, l) => sum + l, 0) + k * priorLead) / (leads.length + k);

  // A Normal density over the lag the surge falls on, times the chance of
  // catching it — so summing `rate − floor` across the window recovers the
  // detection rate, and one positive strip a cycle is what the profile expects.
  const sd = Math.max(0.5, options.fertilityLeadSd);
  const density = (lag: number) =>
    Math.exp(-((lag - leadDays) ** 2) / (2 * sd ** 2)) /
    (sd * Math.sqrt(2 * Math.PI));
  const rate = Array.from({ length: OVULATORY_WINDOW }, (_, lag) =>
    clampRate(
      FERTILITY_TEST_FLOOR + FERTILITY_TEST_DETECTION * density(lag),
      FERTILITY_TEST_FLOOR,
    ),
  );

  return {
    window: OVULATORY_WINDOW,
    rate,
    baseline: FERTILITY_TEST_BASELINE,
    windowDays,
    baselineDays,
    // A constructed profile does not need a sample to be usable — it needs a
    // test to read. The one thing being counted here is whether the reader has
    // ever taken one.
    informative: true,
    leadDays: Math.round(leadDays * 10) / 10,
    observedPositives: leads.length,
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

/**
 * Keep a rate away from 0 and 1 so its likelihood ratio stays finite.
 *
 * The floor is a parameter because a *learned* rate and a *constructed* one
 * need different ones. Two percent is the right floor for a rate estimated
 * from a few dozen days — below that the estimate is noise. A constructed rate
 * can honestly be smaller than any sample could show, and clamping the
 * ovulation-test floor up to the learned one would push it onto the baseline it
 * is meant to be contrasted against, which silently costs a mistimed positive
 * all of its meaning.
 */
function clampRate(p: number, min = 0.02): number {
  return Math.min(0.98, Math.max(min, p));
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

// --- The thermal-shift anchor ---------------------------------------------
//
// The temperature *profile* above reads the luteal plateau: a run of warm
// mornings favours candidates that put those mornings in the fortnight before
// an onset. What it cannot do is date the one event the plateau begins with.
//
// This channel does. Nearly all of a cycle's variability lives in the
// follicular phase — in the Natural Cycles dataset of 600,000 cycles the
// follicular phase spans 10–30 days across its 95% interval while the luteal
// phase spans 7–17 — so the day the temperature *steps up* is the moment the
// variable half of the cycle ends and the steady half begins. Detect that
// step, and the onset is a luteal phase away, whatever the follicular phase
// did this time. That is the sharpest statement the body makes on a schedule,
// and it is available in the very first tracked cycle, before any profile has
// enough history to learn from.

/** Readings the rise is judged against — the classic "three over six" rule. */
const THERMAL_SHIFT_LOW_DAYS = 6;
const THERMAL_SHIFT_HIGH_DAYS = 3;

/**
 * How far above the warmest of the six low mornings the coolest of the three
 * high ones must sit, in °C. The textbook coverline rule asks 0.2 on raw
 * temperatures; these readings are already fever-filtered and centred, which
 * removes the drift the extra margin exists to absorb, and 0.15 still stands
 * three thermometer-noise deviations clear of a flat run.
 */
const THERMAL_SHIFT_MARGIN = 0.15;

/** The three high readings must fall within this many days of each other, so
 *  a patchy month cannot assemble a "sustained rise" out of three warm
 *  mornings weeks apart. */
const THERMAL_SHIFT_HIGH_SPAN = 4;

/** The narrowest and widest lead from a detected shift to an onset worth
 *  learning from. Outside it the "shift" was noise or the following onset was
 *  never logged, and averaging it in would corrupt the one number this channel
 *  turns on. */
const THERMAL_LEAD_RANGE = { min: 5, max: 20 } as const;

/** The lead the anchor scores against zero: candidates this many spreads from
 *  the learned lead are neither helped nor hurt, nearer ones are favoured,
 *  farther ones argued against. */
const THERMAL_SHIFT_REF_SDS = 2.5;

/**
 * The thermal-shift channel: the detected step, and the lead it implies.
 *
 * Constructed rather than learned, like the ovulation test, and for the same
 * reason: the relationship between the event and the onset is physiology, not
 * personal idiosyncrasy. The only genuinely personal number is the lead — the
 * reader's own luteal phase — and that is what gets learned.
 */
export type ThermalShiftEstimate = {
  /** First morning of a sustained rise in the current cycle, or null while
   *  none has been detected (or none has happened yet). */
  detectedDay: DayKey | null;
  /** Days from a detected shift to the next onset: the configured luteal
   *  phase less a day, pulled toward the reader's own detected shifts. */
  leadDays: number;
  /** Spread of that lead, in days. */
  leadSd: number;
  /** Past cycles in which a shift was detected and followed by a logged
   *  onset — what `leadDays` was learned from. */
  observedShifts: number;
  /** Whether the channel can move this forecast — true exactly when a shift
   *  has been detected in the current cycle. */
  informative: boolean;
};

/**
 * Find the first sustained rise in one cycle's centred readings.
 *
 * The classic charting rule, applied to deviations: the coolest of three
 * consecutive readings must clear the warmest of the six before them by
 * {@link THERMAL_SHIFT_MARGIN}. Three sustained mornings is what separates the
 * post-ovulatory step from one warm night, and six lows is what separates it
 * from a noisy baseline. Readings, not calendar days — a skipped morning
 * stretches the window rather than faking a reading — but the three highs must
 * still sit within {@link THERMAL_SHIFT_HIGH_SPAN} days of each other.
 *
 * Returns the date of the first high reading, or null when no run qualifies.
 */
export function detectThermalShift(
  readings: readonly CentredReading[],
): DayKey | null {
  const lastHigh = readings.length - THERMAL_SHIFT_HIGH_DAYS;
  for (let i = THERMAL_SHIFT_LOW_DAYS; i <= lastHigh; i++) {
    const highs = readings.slice(i, i + THERMAL_SHIFT_HIGH_DAYS);
    if (
      daysBetween(highs[0]!.date, highs[highs.length - 1]!.date) >
      THERMAL_SHIFT_HIGH_SPAN
    ) {
      continue;
    }
    const lows = readings.slice(i - THERMAL_SHIFT_LOW_DAYS, i);
    const warmestLow = Math.max(...lows.map((r) => r.deviation));
    const coolestHigh = Math.min(...highs.map((r) => r.deviation));
    if (coolestHigh >= warmestLow + THERMAL_SHIFT_MARGIN) {
      return highs[0]!.date;
    }
  }
  return null;
}

/**
 * Build the thermal-shift channel: learn the lead from past cycles, and look
 * for the step in the current one.
 *
 * The lead starts at the configured luteal phase less a day — the first high
 * morning follows ovulation by about one — and is pulled toward the gaps the
 * reader's own detected shifts have actually been followed by, at
 * {@link ModelOptions.thermalShiftLeadPriorStrength} shifts' worth of inertia.
 * Same construction as the ovulation test's lead, and for the same reason: it
 * lets the anchor work on the first cycle it is possible to detect a shift in.
 *
 * Returns null when no temperature has ever been logged — a channel nobody
 * feeds should be absent, not flat.
 */
export function thermalShiftEstimate(
  data: AppData,
  periods: readonly PeriodSpan[],
  today: DayKey,
  options: ModelOptions,
  cycle: CycleOptions = DEFAULT_CYCLE_OPTIONS,
): ThermalShiftEstimate | null {
  if (periods.length === 0) return null;
  const readings = centredTemperatures(data, options);
  if (readings.length === 0) return null;

  const leads: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const from = periods[i - 1]!.start;
    const to = periods[i]!.start;
    const within = readings.filter((r) => r.date >= from && r.date < to);
    const shift = detectThermalShift(within);
    if (shift === null) continue;
    const lead = daysBetween(shift, to);
    if (lead >= THERMAL_LEAD_RANGE.min && lead <= THERMAL_LEAD_RANGE.max) {
      leads.push(lead);
    }
  }

  const last = periods[periods.length - 1]!;
  const current = readings.filter(
    (r) => r.date >= last.start && r.date <= today,
  );
  const detectedDay = detectThermalShift(current);

  const priorLead = cycle.lutealPhaseLength - 1;
  const k = options.thermalShiftLeadPriorStrength;
  const leadDays =
    (leads.reduce((sum, l) => sum + l, 0) + k * priorLead) / (leads.length + k);

  return {
    detectedDay,
    leadDays: Math.round(leadDays * 10) / 10,
    leadSd: Math.max(0.5, options.thermalShiftLeadSd),
    observedShifts: leads.length,
    informative: detectedDay !== null,
  };
}

/**
 * The tempered log-likelihood ratio for "the period starts on `candidate`",
 * given a detected thermal shift.
 *
 * A Gaussian in the gap from the shift to the candidate, centred on the
 * learned lead, scored against the density {@link THERMAL_SHIFT_REF_SDS}
 * spreads out — so the ratio collapses to `(ref² − z²)/2`: positive within the
 * band a luteal phase plausibly spans, negative beyond it. A candidate on or
 * before the shift day itself lands far outside the band, which is the model
 * saying what the physiology says: bleeding does not precede the plateau that
 * ends in it.
 */
export function thermalShiftLogLikelihoodRatio(
  candidate: DayKey,
  shift: ThermalShiftEstimate,
  options: ModelOptions,
): number {
  if (shift.detectedDay === null) return 0;
  const gap = daysBetween(shift.detectedDay, candidate);
  const z = (gap - shift.leadDays) / shift.leadSd;
  const tempered =
    ((THERMAL_SHIFT_REF_SDS ** 2 - z ** 2) / 2) * options.thermalShiftTemper;
  return Math.min(
    options.symptomMaxLogLr,
    Math.max(-options.symptomMaxLogLr, tempered),
  );
}

/**
 * The tempered log-likelihood ratio for "the period starts on `candidate`",
 * given the recent reports on one binary channel.
 *
 * Each answered report at lag ℓ before the candidate contributes
 * `ln(rate[ℓ]/baseline)` for a yes and `ln((1−rate[ℓ])/(1−baseline))` for a no
 * — so a quiet run is evidence *against* a candidate just as a busy one is
 * evidence for it. Reports at or after the candidate day say nothing about it
 * and are skipped, as are days the question was not answered on.
 *
 * The tempering exponent is per channel because the over-counting it corrects
 * for is per channel: a fortnight of mood is one episode reported fourteen
 * times, while three ovulation tests are three measurements.
 */
export function binaryLogLikelihoodRatio(
  candidate: DayKey,
  recent: readonly DayEntry[],
  profile: BinaryProfile,
  options: ModelOptions,
  read: BinaryRead,
  temper: number,
): number {
  let total = 0;
  for (const entry of recent) {
    const answer = read(entry);
    if (answer === null) continue;
    const lag = daysBetween(entry.date, candidate);
    if (lag < 0 || lag >= profile.window) continue;
    const p = profile.rate[lag]!;
    const b = profile.baseline;
    total += answer ? Math.log(p / b) : Math.log((1 - p) / (1 - b));
  }
  const tempered = total * temper;
  return Math.min(
    options.symptomMaxLogLr,
    Math.max(-options.symptomMaxLogLr, tempered),
  );
}

/** The mood-swing channel's contribution, at the mood tempering. */
export function symptomLogLikelihoodRatio(
  candidate: DayKey,
  recent: readonly DayEntry[],
  profile: SymptomProfile,
  options: ModelOptions,
): number {
  return binaryLogLikelihoodRatio(
    candidate,
    recent,
    profile,
    options,
    (e) => e.moodSwings,
    options.symptomTemper,
  );
}

/** How one day answers the ovulation-test channel: a positive is a yes, a
 *  negative is a no, and a morning nobody tested is not an answer. */
export const readFertilityTest: BinaryRead = (entry) =>
  entry.fertilityTest === null ? null : entry.fertilityTest === "positive";

// --- How long an episode lasts --------------------------------------------

/**
 * Longest episode the length model represents.
 *
 * A fortnight is well past what this app should be modelling as an ordinary
 * period, and the support has to end somewhere for the survival tail to be
 * finite. Mass that would fall beyond the cap folds back into it rather than
 * being dropped, so the distribution still sums to one.
 */
export const MAX_PERIOD_LENGTH = 14;

/**
 * How much the configured default counts for, in episodes.
 *
 * One, on the same reasoning as the cycle-length prior: it should lose the
 * argument as soon as there are real episodes to learn from, but a first-ever
 * period — where the only observation is censored and worth nothing — still
 * needs something to be a distribution over.
 */
const PERIOD_LENGTH_PRIOR_STRENGTH = 1;

/**
 * The kernel each observed length is spread over.
 *
 * Periods vary by a day either way, and an empirical distribution over four or
 * five episodes would otherwise put a hard zero on any length it happened not
 * to have seen — so three episodes of five days would say a sixth day is
 * *impossible*, and the calendar would stop painting mid-period on the first
 * cycle that ran long. Smoothing is what turns "never observed" into
 * "unlikely", which is the honest reading of a handful of episodes.
 */
const PERIOD_LENGTH_KERNEL = [
  [-1, 0.25],
  [0, 0.5],
  [1, 0.25],
] as const;

/**
 * Share of the distribution spread flat across every length in the support.
 *
 * Smoothing widens what the history has seen by a day either way; this is what
 * keeps the rest of the support from being *zero*. It matters at exactly one
 * moment, and it is a moment that happens: an episode that runs longer than any
 * on record. Without a floor the conditional survival divides by zero there, and
 * the app would answer "how much longer will this last?" with "it already
 * ended" on the one morning the question is least academic.
 *
 * Two percent is deliberately small — inside the observed range it moves
 * nothing — and flat rather than shaped, because past what the history has shown
 * there is nothing left to shape it with. The practical effect is that a period
 * running unusually long keeps its colour for a few more days and then fades,
 * rather than stopping dead.
 */
const PERIOD_LENGTH_FLOOR = 0.02;

/** A bleeding episode that has started and not yet finished. */
export type InProgressPeriod = {
  start: DayKey;
  /** The last day of it reported as bleeding. */
  lastBleedingDay: DayKey;
  /** Days from `start` through `lastBleedingDay` inclusive — the length the
   *  episode is already known to have reached. */
  observedDays: number;
};

/**
 * How long a bleeding episode lasts, as a distribution — and where the current
 * one has got to.
 *
 * `cycleStats().averagePeriodLength` answers the same question with one rounded
 * number, which is the right thing for the History screen to display and the
 * wrong thing to paint a calendar with: a single number has a hard edge, and a
 * hard edge means the day after the average is either certainly a period day or
 * certainly not. It also counts the episode in progress, whose length is
 * *censored* — on the first morning of a period it is "one day", which would
 * drag the average toward one and shrink the very window the screen is being
 * asked about.
 *
 * So this fits on completed episodes only, and keeps the whole distribution.
 * Two questions come out of it, and both are asked in `dayStatus.ts`:
 *
 *   - how much longer the period running right now is likely to last —
 *     `P(length ≥ n | length ≥ what has already been observed)`, which is why
 *     the days after "day 1" are painted at all;
 *   - how far past its start day the *next* period is likely to reach, which
 *     is the same survival curve smeared over the start-day posterior.
 */
export type PeriodLengthModel = {
  /** P(an episode lasts exactly n days), over n = 1 … {@link
   *  MAX_PERIOD_LENGTH}. */
  pmf: Pmf;
  /** `survival[n]` = P(length ≥ n), for n = 0 … `MAX_PERIOD_LENGTH + 1`.
   *  Derived from `pmf` once because every consumer wants the tail, never
   *  fitted separately. */
  survival: number[];
  /** Mean of `pmf`, rounded — "a period usually runs about N days". */
  typicalLength: number;
  /** Completed episodes behind the fit. Zero during a first-ever period, when
   *  the distribution is the prior alone. */
  observedEpisodes: number;
  /** The episode still running as of `today`, or null when the last one has
   *  finished. */
  inProgress: InProgressPeriod | null;
};

/**
 * Fit {@link PeriodLengthModel} from the observed episodes.
 *
 * The episode in progress is excluded from the fit and reported separately: it
 * is the thing being asked about, and letting it vote on its own expected
 * length is how a period on its first day ends up predicting it will last one
 * day.
 */
export function periodLengthModel(
  periods: readonly PeriodSpan[],
  today: DayKey,
  cycle: CycleOptions = DEFAULT_CYCLE_OPTIONS,
): PeriodLengthModel {
  const running = inProgressPeriod(periods, today);
  const completed = periods.filter((p) => p !== running);

  const weights = new Array<number>(MAX_PERIOD_LENGTH + 1).fill(0);
  const place = (length: number, weight: number) => {
    for (const [offset, share] of PERIOD_LENGTH_KERNEL) {
      // Clamping folds the kernel's overhang back into the end bin instead of
      // letting it fall off, so the weights still total what was placed.
      const bin = Math.min(
        MAX_PERIOD_LENGTH,
        Math.max(1, Math.round(length) + offset),
      );
      weights[bin]! += weight * share;
    }
  };

  place(cycle.defaultPeriodLength, PERIOD_LENGTH_PRIOR_STRENGTH);
  for (const period of completed) place(period.length, 1);

  // The prior always places weight, so the normalisation can only fail if it
  // has been configured away; a flat distribution is the right thing to fall
  // back to when nothing has an opinion.
  const uniform = 1 / MAX_PERIOD_LENGTH;
  const fitted = normalize({ offset: 1, probabilities: weights.slice(1) });
  const pmf: Pmf = {
    offset: 1,
    probabilities: Array.from({ length: MAX_PERIOD_LENGTH }, (_, i) =>
      fitted
        ? (1 - PERIOD_LENGTH_FLOOR) * (fitted.probabilities[i] ?? 0) +
          PERIOD_LENGTH_FLOOR * uniform
        : uniform,
    ),
  };

  // survival[n] = P(length ≥ n): 1 at and below the shortest possible episode,
  // 0 once past the cap.
  const survival = new Array<number>(MAX_PERIOD_LENGTH + 2).fill(0);
  let tail = 0;
  for (let n = MAX_PERIOD_LENGTH; n >= 0; n--) {
    tail += pmf.probabilities[n - pmf.offset] ?? 0;
    survival[n] = Math.min(1, tail);
  }

  return {
    pmf,
    survival,
    typicalLength: Math.max(1, Math.round(pmfMean(pmf))),
    observedEpisodes: completed.length,
    inProgress: running
      ? {
          start: running.start,
          lastBleedingDay: running.end,
          observedDays: running.length,
        }
      : null,
  };
}

/** P(an episode lasts at least `days` days), read off the fitted survival
 *  curve. Days outside the modelled support answer 1 below it and 0 above. */
export function periodLengthSurvival(
  model: PeriodLengthModel,
  days: number,
): number {
  const n = Math.round(days);
  if (n <= 0) return 1;
  return model.survival[n] ?? 0;
}

// --- Cycles further ahead -------------------------------------------------
//
// Everything above describes *the next* onset. A calendar is paged, and a
// calendar paged three months forward that paints nothing is not saying "your
// cycle stops in June" — it is saying the model was only ever asked one
// question. So the same model is asked it again.
//
// The second onset is the first one plus another cycle length; the third is the
// second plus another; and so on. Both terms are distributions this module has
// already fitted — the conditioned posterior over the next start, and the
// predictive over cycle length — so each further onset is their convolution and
// nothing new is estimated. That is the point of doing it this way rather than
// stamping the typical length forward from the predicted date: a projection has
// to inherit the uncertainty it is built from, and adding two uncertain
// quantities is what widens it.
//
// The widening is the honest half of the feature. Each cycle out is spread by
// one more cycle's worth of variation, so a steady history paints three or four
// periods ahead and an erratic one paints one — and past that the days fall
// below the threshold the screens paint at, and the calendar simply says
// nothing rather than drawing a confident guess about November.

/** One candidate onset day. The next period and every one after it are
 *  described in these terms, because a calendar asks the same question of every
 *  day it paints: how likely is it that *a* period starts here. */
export type OnsetDay = {
  day: DayKey;
  /** Posterior probability that a period — the next one, or a later one —
   *  starts on this day. Two different onsets can never fall on the same day,
   *  so overlapping projections add rather than double-count. */
  probability: number;
};

/** The projection, in the two forms the screens ask for it in. */
export type OnsetProjection = {
  /**
   * Every projected onset day, oldest first, with the cycles' masses merged.
   *
   * Days shared by two cycles' distributions have their masses summed, which is
   * exactly right: the events are disjoint, so the chance *a* period starts on
   * a day is the chance the second one does plus the chance the third one does.
   *
   * Sorted, and callers rely on it: `dayStatus.ts` walks the list and stops as
   * soon as it is past the day it is asking about.
   */
  days: OnsetDay[];
  /**
   * The median start day of each projected cycle, oldest first — the date each
   * one is *named* by, as opposed to the mass around it.
   *
   * The first entry is the day the Forecast screen's headline quotes, from the
   * identical statistic (`pmfQuantile(posterior, 0.5)`), so the first stroke the
   * calendar draws cannot begin on a different day from the one the app says
   * out loud.
   */
  starts: DayKey[];
};

/**
 * Project the onsets ahead: the fitted posterior over the next start, then that
 * convolved with one more cycle length, and again, for as long as the result is
 * still a date rather than a shrug (see
 * {@link ModelOptions.projectionMaxSpreadShare}) and at most
 * {@link ModelOptions.projectedCycles} times.
 *
 * `posterior` and `gap` are both measured in days from the anchor start —
 * `posterior` because that is how the forecast is built, `gap` because a cycle
 * length is a number of days either way.
 */
export function projectOnsets(
  posterior: Pmf,
  gap: Pmf,
  anchorStart: DayKey,
  typicalLength: number,
  options: ModelOptions,
): OnsetProjection {
  const mass = new Map<number, number>();
  const starts: DayKey[] = [];
  const maxWidth = Math.max(
    1,
    typicalLength * options.projectionMaxSpreadShare,
  );
  let cycle = posterior;

  for (let n = 0; n < Math.max(1, options.projectedCycles); n++) {
    // The next onset is carried however wide it is: it is the forecast the rest
    // of the app is built on, and a history too erratic to project still has a
    // period coming. Every cycle after it has to earn its place, and since each
    // is wider than the last, the first one that fails ends the projection.
    if (n > 0) {
      const { lower, upper } = credibleInterval(cycle, 0.8);
      if (upper - lower + 1 > maxWidth) break;
    }
    for (let i = 0; i < cycle.probabilities.length; i++) {
      const p = cycle.probabilities[i]!;
      if (p <= 0) continue;
      const offset = cycle.offset + i;
      mass.set(offset, (mass.get(offset) ?? 0) + p);
    }
    starts.push(addDays(anchorStart, pmfQuantile(cycle, 0.5)));
    cycle = convolve(cycle, gap);
  }

  return {
    days: [...mass.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([offset, probability]) => ({
        day: addDays(anchorStart, offset),
        probability,
      })),
    starts,
  };
}

// --- Putting it together --------------------------------------------------

/** What the within-cycle channels have to work with at prediction time. */
type Evidence = {
  moods: SymptomProfile | null;
  lust: BinaryProfile | null;
  sex: BinaryProfile | null;
  fertilityTests: FertilityTestProfile | null;
  temperatures: TemperatureProfile | null;
  thermalShift: ThermalShiftEstimate | null;
  recent: readonly DayEntry[];
  recentTemperatures: readonly CentredReading[];
};

/**
 * Combine the evidence channels into one log-likelihood ratio for a candidate
 * onset day.
 *
 * Each channel is tempered and clamped *before* the sum, so no single one can
 * run away, and the total is clamped again at
 * {@link ModelOptions.evidenceMaxLogLr}. That ceiling is the point: channels
 * that agree should be able to say more than any of them alone, but never so
 * much more that the cycle history stops mattering. Adding a channel means one
 * more clamped term here and one more profile above — nothing else in the model
 * changes.
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
  if (evidence.lust) {
    total += binaryLogLikelihoodRatio(
      candidate,
      evidence.recent,
      evidence.lust,
      options,
      (e) => e.lust,
      options.ovulatoryTemper,
    );
  }
  if (evidence.sex) {
    total += binaryLogLikelihoodRatio(
      candidate,
      evidence.recent,
      evidence.sex,
      options,
      (e) => e.sex,
      options.ovulatoryTemper,
    );
  }
  if (evidence.fertilityTests) {
    total += binaryLogLikelihoodRatio(
      candidate,
      evidence.recent,
      evidence.fertilityTests,
      options,
      readFertilityTest,
      options.fertilityTemper,
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
  if (evidence.thermalShift) {
    total += thermalShiftLogLikelihoodRatio(
      candidate,
      evidence.thermalShift,
      options,
    );
  }
  const ceiling = options.evidenceMaxLogLr;
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

  const robust = fitRobustPosterior(
    observationsFrom(periods, modelOptions),
    modelOptions,
  );
  const params = robust.params;
  const observations = robust.observations;

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

  // Every profile is estimated from lags to *observed* onsets, so none of them
  // ever sees the day it is about to be asked to explain.
  const multivariate = model === "multivariate";
  const moods = multivariate
    ? symptomProfile(data, periods, modelOptions)
    : null;
  const lust = multivariate ? lustProfile(data, periods, modelOptions) : null;
  const sex = multivariate ? sexProfile(data, periods, modelOptions) : null;
  const fertilityTest = multivariate
    ? fertilityTestProfile(data, periods, modelOptions, cycle)
    : null;
  const temperatures = multivariate
    ? temperatureProfile(data, periods, modelOptions)
    : null;
  const thermalShift = multivariate
    ? thermalShiftEstimate(data, periods, today, modelOptions, cycle)
    : null;
  const usable = <T extends { informative: boolean }>(profile: T | null) =>
    profile?.informative ? profile : null;
  const usableMoods = usable(moods);
  const usableLust = usable(lust);
  const usableSex = usable(sex);
  const usableFertilityTests = usable(fertilityTest);
  const usableTemperatures = usable(temperatures);
  const usableThermalShift = usable(thermalShift);
  const hasEvidence =
    usableMoods !== null ||
    usableLust !== null ||
    usableSex !== null ||
    usableFertilityTests !== null ||
    usableTemperatures !== null ||
    usableThermalShift !== null;

  // One recent window, the widest any channel asks for; each channel then clips
  // to its own inside its likelihood ratio. A single filter here is what keeps
  // the premenstrual channels reading exactly the days they always did while
  // the ovulatory ones reach back to ovulation.
  const recent = sortedEntries(data).filter(
    (e) => e.date <= today && daysBetween(e.date, today) < EVIDENCE_WINDOW,
  );
  const recentTemperatures = usableTemperatures
    ? centredTemperatures(data, modelOptions).filter(
        (r) => r.date <= today && daysBetween(r.date, today) < EVIDENCE_WINDOW,
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
          lust: usableLust,
          sex: usableSex,
          fertilityTests: usableFertilityTests,
          temperatures: usableTemperatures,
          thermalShift: usableThermalShift,
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

  // The cycle-length predictive is the gap between one onset and the next, so
  // the same `prior` the next onset was built from is what carries the
  // projection forward. Nothing here is fitted twice.
  const projection = projectOnsets(
    posterior,
    prior,
    anchorStart,
    params.typicalLength,
    modelOptions,
  );

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
    onsets: projection.days,
    upcomingStarts: projection.starts,
    periodLength: periodLengthModel(periods, today, cycle),
    expectedDay,
    peakDay: addDays(anchorStart, pmfMode(posterior)),
    daysUntilExpected: daysBetween(today, expectedDay),
    intervals,
    spreadDays: Math.round(pmfStdev(posterior) * 10) / 10,
    probabilityWithinWeek: probabilityWithin(days, today, 7),
    params,
    observations,
    symptoms: moods,
    lust,
    sex,
    fertilityTest,
    temperature: temperatures,
    thermalShift,
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
