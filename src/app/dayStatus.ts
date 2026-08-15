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
//   - a day D is inside the next period  ⟺  the period starts on some day in
//     [D − (periodLength − 1), D]
//   - a day D is fertile                 ⟺  the period starts on some day in
//     [D + luteal − after, D + luteal + before]
//
// (the fertile window is defined *backwards* from the next start — ovulation
// is `luteal` days before it — which is exactly why the posterior over start
// days answers both questions.)
//
// Pure and clock-free like the rest of the derivation: `today` is a parameter,
// and every input is passed in.

import { addDays, type DayKey } from "@niclaslindstedt/oss-framework/calendar";

import type { CycleOptions } from "./cycle.ts";
import type { ProbabilisticForecast } from "./forecastModel.ts";
import type { AppData } from "./types.ts";

/** The things a day can be, in the order they outrank each other. */
export type DayStatusKind =
  /** Bleeding was reported. Not a prediction — a fact. */
  | "period"
  /** The next period is more likely than not to cover this day. */
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
  /** Posterior probability the day falls inside the next period. */
  periodProbability: number;
};

/** Above this, a probability is stated as the day's status rather than as its
 *  negation. Half is the only defensible threshold: it is the point at which
 *  the opposite call would be the less likely one. */
const CALL_THRESHOLD = 0.5;

/** Posterior mass on next-period start days inside an inclusive range. Days
 *  outside the modelled window carry no mass, so a range that runs past its
 *  edge simply contributes nothing. */
function startMassBetween(
  f: ProbabilisticForecast,
  from: DayKey,
  to: DayKey,
): number {
  let sum = 0;
  for (const d of f.days) {
    if (d.day >= from && d.day <= to) sum += d.probability;
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

/** How likely the day is covered by the next period, given how long one
 *  usually lasts. */
export function periodProbability(
  f: ProbabilisticForecast,
  day: DayKey,
  periodLength: number,
): number {
  const span = Math.max(1, Math.round(periodLength));
  return startMassBetween(f, addDays(day, -(span - 1)), day);
}

/** Everything a status call needs that isn't the day itself. Bundled because
 *  the strip asks for a week of them and re-deriving the posterior per day
 *  would be the same answer computed seven times. */
export type StatusContext = {
  data: AppData;
  /** Null until a period has been logged. Every day is then `unknown` except
   *  the ones a report speaks for. */
  forecast: ProbabilisticForecast | null;
  /** Days a period usually lasts — the observed average, or the configured
   *  default until one has been logged. */
  periodLength: number;
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
  const period = f ? periodProbability(f, day, ctx.periodLength) : 0;
  const base = {
    day,
    reported: entry !== undefined,
    fertileProbability: fertile,
    periodProbability: period,
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
