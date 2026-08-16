// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a single day *is* — reported bleeding, a day the next period is likely
// to cover, a fertile day, or none of those — and how sure that call is.
//
// This is the Status screen's headline and the Calendar screen's colouring,
// and both read it from the same place for the same reason the Forecast
// screen's simple and advanced views do: a calendar that paints a day fertile
// while the sentence above it says otherwise is a screen arguing with itself.
//
// Every probability here is mass taken out of the posterior `forecastModel.ts`
// already fitted. Nothing is re-estimated, so a status can never disagree with
// the forecast it came from:
//
//   - a day D is inside a period  ⟺  a period starts on some day S ≤ D and runs
//     for at least D − S + 1 days
//   - a day D is fertile          ⟺  a period starts on some day in
//     [D + luteal − after, D + luteal + before]
//
// (the fertile window is defined *backwards* from the following start —
// ovulation is `luteal` days before it — which is exactly why the posterior
// over start days answers both questions.)
//
// "A period" rather than "the next period" throughout, and that is the whole of
// what puts more than one cycle on the calendar. `forecastModel.ts` projects the
// onset after the next, and the one after that, by convolving its posterior with
// another cycle length; every one of them is a set of candidate start days on
// the same terms as the first, so both rules above answer for a day in
// September without either of them learning that September exists. The
// projection widens as it goes, so the strokes fade out on their own where the
// history stops supporting them.
//
// There is a third case, and it is the one a start-day distribution on its own
// gets wrong. On the morning you log the first bleeding day of a period, the
// posterior has already moved on to the *next* onset four weeks out — so it has
// no mass anywhere near tomorrow, and the rest of the period you are currently
// having would be painted as empty calendar. That is the days-ahead half of the
// week row going blank on exactly the day it matters most.
//
// The missing piece is not another estimator of the same thing. It is the
// episode-length distribution `forecastModel.ts` fits alongside the start days:
// given a period that started on a known day and has been bleeding for `k` days
// already, the chance it still covers day D is
//
//     P(length ≥ index of D | length ≥ k)
//
// — a conditional survival, which decays from near-certainty on the day after
// day 1 to nearly nothing a fortnight in. The current episode and the next one
// are disjoint, so the chance a day is a period day is simply their sum.
//
// Pure and clock-free like the rest of the derivation: `today` is a parameter,
// and every input is passed in.

import {
  addDays,
  daysBetween,
  type DayKey,
} from "@niclaslindstedt/oss-framework/calendar";

import type { CycleOptions } from "./cycle.ts";
import {
  periodLengthSurvival,
  type ProbabilisticForecast,
} from "./forecastModel.ts";
import type { AppData } from "./types.ts";

/** The things a day can be, in the order they outrank each other. */
export type DayStatusKind =
  /** Bleeding was reported. Not a prediction — a fact. */
  | "period"
  /** A period is more likely than not to cover this day — the one already
   *  running, the next one, or one further ahead. */
  | "predictedPeriod"
  /** More likely than not inside the fertile window. */
  | "fertile"
  /** More likely than not outside it. */
  | "notFertile"
  /** The same quiet day, for someone who turned the fertile window off. It
   *  says what is *not* happening without naming a fertility estimate they
   *  opted out of seeing. */
  | "noPeriod"
  /** No period has been logged yet, so there is no posterior to ask. A report
   *  on the day is still a report — this says nothing about the *cycle*, not
   *  that the day is empty. */
  | "unknown";

export type DayStatus = {
  day: DayKey;
  kind: DayStatusKind;
  /** Posterior probability that `kind` is the right call for this day — the
   *  number the screen quotes as how sure it is. 1 for a reported day. */
  probability: number;
  /** True when the call rests on a report rather than on the model. */
  observed: boolean;
  /** True when the day carries a report of any kind, bleeding or not. The
   *  calendar marks these so "I logged it and felt fine" is distinguishable
   *  from "I forgot". */
  reported: boolean;
  /** Posterior probability the day falls inside the fertile window. */
  fertileProbability: number;
  /** Posterior probability the day is covered by a period — the one running
   *  now, or an upcoming one. */
  periodProbability: number;
  /**
   * The day falls inside the span an upcoming period is *expected* to cover —
   * a projected start day and the days a typical episode runs for.
   *
   * Separate from `kind` on purpose. `kind` is the call, and it keeps the half
   * rule; this is where the model expects the period to fall, which it has an
   * opinion about for months after no single day clears a half. The calendar
   * paints from this, the wording quotes `kind`, and `probability` says how
   * sure either of them is. False on a day already reported without bleeding —
   * a logged "no" outranks a projection, the same way it rules a candidate
   * start day out of the forecast.
   */
  expectedPeriod: boolean;
  /**
   * The day is in a fertile window, and the cycle carrying it has **begun** —
   * a period was reported to open it.
   *
   * Still an estimate: ovulation is inferred from the luteal phase, never
   * logged. But it is an estimate placed inside a cycle whose start is a fact,
   * which is what earns it the filled mark. The cycle you are in right now
   * counts, so its window fills even though the period it points at has not
   * arrived yet. Always false when the fertile window is turned off.
   */
  startedFertile: boolean;
  /**
   * The day is in a fertile window of a cycle that has **not begun** — one a
   * projected onset would open, some way ahead.
   *
   * Both ends of it are predictions, so the calendar draws it hollow: the same
   * grammar the period pair uses, where a fill is something that happened and
   * an outline is something expected. Always false when the fertile window is
   * turned off.
   */
  expectedFertile: boolean;
};

/** Above this, a probability is stated as the day's status rather than as its
 *  negation. Half is the only defensible threshold: it is the point at which
 *  the opposite call would be the less likely one. */
const CALL_THRESHOLD = 0.5;

/** Posterior mass on period start days inside an inclusive range — every
 *  projected onset, not only the next one, which is what lets the months after
 *  next be painted at all. Days outside the projection carry no mass, so a
 *  range that runs past its edge simply contributes nothing.
 *
 *  `onsets` is sorted by day, so the walk stops at the far end of the range
 *  rather than reading a year of projection for a seven-day window. */
function startMassBetween(
  f: ProbabilisticForecast,
  from: DayKey,
  to: DayKey,
): number {
  let sum = 0;
  for (const d of f.onsets) {
    if (d.day > to) break;
    if (d.day >= from) sum += d.probability;
  }
  return Math.min(1, sum);
}

/** How likely the day sits inside the fertile window around the projected
 *  ovulation. */
export function fertileProbability(
  f: ProbabilisticForecast,
  day: DayKey,
  options: CycleOptions,
): number {
  return startMassBetween(
    f,
    addDays(day, options.lutealPhaseLength - options.fertileWindowAfter),
    addDays(day, options.lutealPhaseLength + options.fertileWindowBefore),
  );
}

/**
 * How likely the day is covered by an **upcoming** period — the next one, or a
 * later one.
 *
 * Every candidate start day S at or before `day` could cover it, but only if
 * the episode runs far enough: S contributes its own posterior mass times the
 * chance a period lasts at least `day − S + 1` days. Smearing the start-day
 * distribution over the length distribution like this is what gives the painted
 * window a soft trailing edge — the fifth day of a predicted period is less
 * certain than its second, which a fixed span of "N days from the start" could
 * not express.
 *
 * Reading every projected onset rather than only the first is the whole of what
 * puts a period on a calendar paged two months forward. It needs no special
 * case: a later onset is another set of candidate start days, weighed by the
 * same survival curve, and each one is wider than the last — so the strokes
 * thin out with distance and eventually stop, which is the shape of what the
 * history actually supports.
 *
 * `onsets` is sorted, so the walk stops once it is past the day being asked
 * about — every start day after it is one this day cannot belong to.
 */
export function upcomingPeriodProbability(
  f: ProbabilisticForecast,
  day: DayKey,
): number {
  let sum = 0;
  for (const d of f.onsets) {
    if (d.day > day) break;
    const index = daysBetween(d.day, day) + 1;
    const survives = periodLengthSurvival(f.periodLength, index);
    if (survives === 0) continue;
    sum += d.probability * survives;
  }
  return Math.min(1, sum);
}

/**
 * How likely the day is covered by the period **already running**.
 *
 * The episode's start is observed, not predicted, and so is the fact that it
 * has already reached `observedDays` — so the only open question is how much
 * further it runs, and the answer is the length distribution conditioned on
 * having got this far. Day 1 of a period therefore paints the next few days
 * without needing the start-day posterior to say anything about them.
 *
 * A day already reported with no bleeding is excluded outright, on the same
 * rule the forecast rules out impossible start days: a logged "no" is a fact,
 * and painting a period over it would be the screen contradicting the report it
 * was given. A day with no report at all stays possible — not logging is not
 * the same claim as logging a no.
 */
export function ongoingPeriodProbability(
  f: ProbabilisticForecast,
  day: DayKey,
  data: AppData,
): number {
  const running = f.periodLength.inProgress;
  if (!running || day < running.start) return 0;

  const entry = data.entries[day];
  if (entry !== undefined && !entry.bleeding) return 0;

  const index = daysBetween(running.start, day) + 1;
  if (index <= running.observedDays) return 1;

  // Renormalising on "it already got this far" is the whole conditioning step.
  // Without it a long episode would read as less and less likely to continue
  // precisely because it has been running a while, which is backwards.
  const reached = periodLengthSurvival(f.periodLength, running.observedDays);
  if (reached <= 0) return 0;
  return Math.min(1, periodLengthSurvival(f.periodLength, index) / reached);
}

/** How likely the day is a period day at all — the episode running now, or an
 *  upcoming one. They are different episodes at least a cycle apart and cannot
 *  both cover a day, so their masses add. */
export function periodProbability(
  f: ProbabilisticForecast,
  day: DayKey,
  data: AppData,
): number {
  return Math.min(
    1,
    ongoingPeriodProbability(f, day, data) + upcomingPeriodProbability(f, day),
  );
}

/**
 * Whether the day falls inside the span an upcoming period is *expected* to
 * cover: one of the projected start days, and the days after it a typical
 * episode runs for.
 *
 * This exists because far enough ahead the probability rule above runs out.
 * Each projected cycle is wider than the last, and once the spread is broader
 * than a period is long, no single day is more likely than not a period day —
 * so a calendar drawing only the days that clear a half answers "when is my
 * period in September?" with an empty month. That is not the cautious answer;
 * it is the wrong one, because the model has a perfectly good opinion about
 * September and is simply not being asked for it in the right terms.
 *
 * So the mark and the word part company here, which they already do elsewhere
 * (a reported quiet day is marked while its status is "not fertile"). The word
 * and the percentage keep the half rule and stay exactly as honest as they
 * were. The mark says where the period is expected to fall, in the outline that
 * has always meant *predicted* rather than observed — and it fades out on its
 * own, because `upcomingStarts` stops where the projection stops being a date
 * (see `forecastModel.ts`).
 */
function inExpectedPeriod(f: ProbabilisticForecast, day: DayKey): boolean {
  const length = Math.max(1, f.periodLength.typicalLength);
  for (const start of f.upcomingStarts) {
    if (start > day) break;
    if (daysBetween(start, day) < length) return true;
  }
  return false;
}

/**
 * The same for the fertile window: the days around the ovulation each of
 * `starts` implies.
 *
 * The window is derived from the start rather than estimated on its own, on the
 * rule the whole module runs on — ovulation is `luteal` days before an onset —
 * so it cannot land anywhere other than a fortnight before whatever the calendar
 * drew for that period.
 *
 * `starts` is oldest first, so the scan stops as soon as one is far enough past
 * the day that its window cannot reach back to it.
 */
function inFertileWindow(
  starts: readonly DayKey[],
  day: DayKey,
  options: CycleOptions,
): boolean {
  const earliest = options.lutealPhaseLength - options.fertileWindowAfter;
  const latest = options.lutealPhaseLength + options.fertileWindowBefore;
  for (const start of starts) {
    const lead = daysBetween(day, start);
    if (lead > latest) break;
    if (lead >= earliest) return true;
  }
  return false;
}

/**
 * Whether the cycle `day` belongs to has begun.
 *
 * An onset is where one cycle ends and the next starts, so the cycle a day is
 * in is the one opened by the last onset at or before it — and whether that
 * cycle has *begun* is simply whether that onset was reported or is still only
 * projected. Every projected onset comes after every observed one, so the first
 * projected onset is the whole boundary: on this side of it a real period
 * opened the cycle, on the far side a predicted one did.
 *
 * This is what decides whether a fertile window is filled or outlined. The
 * window sits roughly midway through the cycle it belongs to, a fortnight
 * *after* the onset that opened it and a fortnight *before* the one that will
 * close it — so a window in the cycle you are in now is filled even though the
 * period it points at has not arrived, because the cycle carrying it is
 * underway and dated by a report. The windows of cycles that no period has
 * opened yet are the projections, and they are the ones drawn hollow.
 *
 * Null before the first logged period: there is no cycle to be in, and a window
 * there would be an invention about a month the app never saw.
 */
function cycleBeganWith(
  f: ProbabilisticForecast,
  day: DayKey,
): "reported" | "projected" | null {
  const projected = f.upcomingStarts[0];
  if (projected !== undefined && day >= projected) return "projected";
  const reported = f.observedStarts[0];
  if (reported !== undefined && day >= reported) return "reported";
  return null;
}

/** Everything a status call needs that isn't the day itself. Bundled because
 *  the strip asks for a week of them and re-deriving the posterior per day
 *  would be the same answer computed seven times. */
export type StatusContext = {
  data: AppData;
  /** Null until a period has been logged. Every day is then `unknown` except
   *  the ones a report speaks for. */
  forecast: ProbabilisticForecast | null;
  options: CycleOptions;
  /** Whether the fertile window may be named at all. Off for anyone tracking
   *  only their period: the status then reads as period / not, and no
   *  fertility estimate is put on screen. */
  showFertileWindow: boolean;
};

/**
 * The status of one day.
 *
 * Priority is what actually happened over what was predicted: a reported
 * bleeding day is a period however the model felt about it. Below that, the
 * period call outranks the fertile one — they cannot both clear a half, since
 * the start days they ask about are two weeks apart, but the period is the
 * more consequential answer when the two are close.
 */
export function dayStatus(day: DayKey, ctx: StatusContext): DayStatus {
  const entry = ctx.data.entries[day];
  const f = ctx.forecast;
  const fertile =
    f && ctx.showFertileWindow ? fertileProbability(f, day, ctx.options) : 0;
  const period = f ? periodProbability(f, day, ctx.data) : 0;
  // A fertile window is a fortnight before *some* onset, whichever list that
  // onset came from; which of the two marks it wears is a separate question,
  // answered by the cycle it sits in rather than by the onset it points at.
  const inWindow =
    f !== null &&
    ctx.showFertileWindow &&
    (inFertileWindow(f.upcomingStarts, day, ctx.options) ||
      inFertileWindow(f.observedStarts, day, ctx.options));
  const began = f !== null ? cycleBeganWith(f, day) : null;
  const base = {
    day,
    reported: entry !== undefined,
    fertileProbability: fertile,
    periodProbability: period,
    // A logged "no" outranks a projection, exactly as it rules a candidate
    // start day out of the forecast: an overdue period's expected span can
    // reach back over days that have already been answered.
    expectedPeriod:
      f !== null &&
      !(entry !== undefined && !entry.bleeding) &&
      inExpectedPeriod(f, day),
    startedFertile: inWindow && began === "reported",
    expectedFertile: inWindow && began === "projected",
  };

  if (entry?.bleeding) {
    return { ...base, kind: "period", probability: 1, observed: true };
  }
  // With nothing fitted there is no honest number to quote, and quoting the
  // complement of zero ("not fertile, 100% sure") would be the dishonest one.
  if (!f) {
    return { ...base, kind: "unknown", probability: 0, observed: false };
  }
  if (period >= CALL_THRESHOLD) {
    return {
      ...base,
      kind: "predictedPeriod",
      probability: period,
      observed: false,
    };
  }
  if (fertile >= CALL_THRESHOLD) {
    return { ...base, kind: "fertile", probability: fertile, observed: false };
  }
  // With the fertile window off there is no fertile mass to take a complement
  // of, and "not fertile, 100% sure" would be a confident fertility claim made
  // by a screen that is meant to be making none. The quiet day is then about
  // the period instead.
  if (!ctx.showFertileWindow) {
    return {
      ...base,
      kind: "noPeriod",
      probability: 1 - period,
      observed: false,
    };
  }
  // "Not fertile" is a claim about the fertile window only, so its confidence
  // is the complement of the fertile mass — not of whichever of the two was
  // larger. Saying "not fertile, 60% sure" because a period is 40% likely
  // would understate a call the model is actually confident about.
  return {
    ...base,
    kind: "notFertile",
    probability: 1 - fertile,
    observed: false,
  };
}

/**
 * A run of consecutive days' statuses, `before` days back from `day` through
 * `after` days forward — the Status screen's week row, which shows where the
 * last few days sat and where the next few are heading.
 */
export function statusStrip(
  day: DayKey,
  before: number,
  after: number,
  ctx: StatusContext,
): DayStatus[] {
  const out: DayStatus[] = [];
  for (let offset = -before; offset <= after; offset++) {
    out.push(dayStatus(addDays(day, offset), ctx));
  }
  return out;
}
