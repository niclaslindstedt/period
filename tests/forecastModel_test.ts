// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { addDays, daysBetween } from "@niclaslindstedt/oss-framework/calendar";

import { DEFAULT_CYCLE_OPTIONS } from "../src/app/cycle.ts";
import {
  backtest,
  binaryLogLikelihoodRatio,
  centredTemperatures,
  confidenceFrom,
  DEFAULT_MODEL_OPTIONS,
  detectThermalShift,
  fertilityTestProfile,
  fitPosterior,
  fitRobustPosterior,
  lustProfile,
  OVULATORY_WINDOW,
  readFertilityTest,
  sexProfile,
  observationsFrom,
  periodLengthModel,
  periodLengthSurvival,
  predictivePmf,
  MAX_PERIOD_LENGTH,
  probabilisticForecast,
  repairSkippedCycles,
  symptomLogLikelihoodRatio,
  symptomProfile,
  temperatureLogLikelihoodRatio,
  temperatureProfile,
  thermalShiftEstimate,
  thermalShiftLogLikelihoodRatio,
  PREMENSTRUAL_WINDOW,
  type CentredReading,
  type CycleObservation,
} from "../src/app/forecastModel.ts";
import { derivePeriods } from "../src/app/cycle.ts";
import { pmfMode, pmfQuantile } from "../src/app/stats.ts";
import { emptyDoc, type AppData } from "../src/app/types.ts";

// The forecast model is the one place in the app where a wrong number looks
// completely plausible: a distribution is confident-looking whether or not it
// is right. So these tests pin three separate things — that the arithmetic
// matches the model on paper, that the evidence moves the answer in the
// direction it should, and that the intervals it draws actually cover the
// truth (the backtest at the bottom).
//
// All dates are real and `today` is always passed in, so nothing here needs a
// fake clock.

const STAMP = "2026-01-01T00:00:00.000Z";

/** Deterministic 0–1 noise, so a "background rate" of anything is repeatable
 *  across runs without a seeded-random dependency. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

type BuildOptions = {
  /** Day the first period starts. */
  firstStart: string;
  /** Gap in days from each period start to the next. */
  cycleLengths: readonly number[];
  /** Bleeding days per period. */
  periodLength?: number;
  /** Mood swings are reported on the days this many days before each onset. */
  swingsBefore?: number;
  /** Chance of a mood swing on any other reported day. */
  backgroundSwingRate?: number;
  /** Log every day from the first start through the last one. Off leaves only
   *  the bleeding days logged, which is how a minimal user tracks. */
  logEveryDay?: boolean;
  /** Size of the biphasic temperature shift in °C. Zero records no readings at
   *  all; 0.3 is the textbook luteal rise. */
  temperatureShift?: number;
  /** Share of logged days that carry a reading, so a test can be as patchy as
   *  a real morning routine. */
  temperatureCoverage?: number;
  /** Lust is reported on the days at these lags before each onset — a set of
   *  lags rather than a count, because the ovulatory channels peak in the
   *  *middle* of the window rather than up against its right-hand end. */
  lustLags?: readonly number[];
  /** Chance of lust on any other reported day. */
  backgroundLustRate?: number;
  /** Sex is reported on the days at these lags before each onset. */
  sexLags?: readonly number[];
  /** Chance of sex on any other reported day. */
  backgroundSexRate?: number;
  /** An ovulation test is taken on the days at these lags before each onset… */
  testLags?: readonly number[];
  /** …and reads positive at this one. Every other tested day reads negative. */
  positiveTestLag?: number;
};

/** The follicular-phase resting temperature the fixture builds around. */
const BASE_CELSIUS = 36.4;

/**
 * Build a realistic document: a run of periods at the given gaps, every day in
 * between reported, and mood swings concentrated in the days before each
 * onset. Returns the document and the onsets it was built from.
 */
function build(opts: BuildOptions): { data: AppData; starts: string[] } {
  const {
    firstStart,
    cycleLengths,
    periodLength = 5,
    swingsBefore = 0,
    backgroundSwingRate = 0,
    logEveryDay = true,
    temperatureShift = 0,
    temperatureCoverage = 1,
    lustLags = [],
    backgroundLustRate = 0,
    sexLags = [],
    backgroundSexRate = 0,
    testLags = [],
    positiveTestLag,
  } = opts;

  const data = emptyDoc();
  const starts: string[] = [firstStart];
  for (const gap of cycleLengths) {
    starts.push(addDays(starts[starts.length - 1]!, gap));
  }

  const lastDay = addDays(starts[starts.length - 1]!, periodLength - 1);
  const bleeding = new Set<string>();
  for (const start of starts) {
    for (let i = 0; i < periodLength; i++) bleeding.add(addDays(start, i));
  }

  const swinging = new Set<string>();
  for (const start of starts) {
    for (let lag = 1; lag <= swingsBefore; lag++) {
      swinging.add(addDays(start, -lag));
    }
  }

  /** Days from a date to the next onset, or null once past the last one. */
  const lagOf = (date: string): number | null => {
    for (const start of starts) {
      const lag = daysBetween(date, start);
      if (lag >= 0) return lag;
    }
    return null;
  };

  /** A biphasic waking temperature: low through the follicular phase, raised
   *  across the luteal one, already falling as bleeding starts. */
  const temperatureFor = (date: string, index: number): number | null => {
    if (temperatureShift <= 0) return null;
    if (noise(index + 500) >= temperatureCoverage) return null;
    const lag = lagOf(date);
    const luteal = lag !== null && lag < 14 ? temperatureShift : 0;
    const falling = lag !== null && lag <= 1 ? temperatureShift * 0.6 : 0;
    const jitter = (noise(index + 17) - 0.5) * 0.1;
    return Math.round((BASE_CELSIUS + luteal - falling + jitter) * 1000) / 1000;
  };

  const total = daysBetween(firstStart, lastDay);
  for (let i = 0; i <= total; i++) {
    const date = addDays(firstStart, i);
    const isBleeding = bleeding.has(date);
    if (!logEveryDay && !isBleeding) continue;
    // The ovulatory channels are placed by lag rather than by date, so a
    // fixture says "lust on the days around ovulation" and the arithmetic
    // works out which calendar days those were.
    const lag = lagOf(date);
    const at = (lags: readonly number[]) => lag !== null && lags.includes(lag);
    data.entries[date] = {
      date,
      bleeding: isBleeding,
      moodSwings: swinging.has(date) || noise(i + 1) < backgroundSwingRate,
      lust: at(lustLags) || noise(i + 101) < backgroundLustRate,
      sex: at(sexLags) || noise(i + 201) < backgroundSexRate,
      temperature: temperatureFor(date, i),
      fertilityTest: at(testLags)
        ? lag === positiveTestLag
          ? "positive"
          : "negative"
        : null,
      updatedAt: STAMP,
    };
  }
  return { data, starts };
}

/** Twelve steady 28-day cycles — the "regular user" fixture. */
function steady(extra: Partial<BuildOptions> = {}) {
  return build({
    firstStart: "2025-09-01",
    cycleLengths: Array.from({ length: 11 }, () => 28),
    ...extra,
  });
}

describe("repairSkippedCycles", () => {
  it("leaves an ordinary gap alone", () => {
    expect(repairSkippedCycles([28, 30, 26], 28)).toEqual([
      { length: 28, imputed: false },
      { length: 30, imputed: false },
      { length: 26, imputed: false },
    ]);
  });

  it("splits a gap that is cleanly two cycles long", () => {
    expect(repairSkippedCycles([58], 28)).toEqual([
      { length: 29, imputed: true },
      { length: 29, imputed: true },
    ]);
  });

  it("splits a gap that is cleanly three cycles long", () => {
    expect(repairSkippedCycles([84], 28)).toHaveLength(3);
  });

  it("leaves a merely long cycle alone", () => {
    // 45 days is 1.6 typical lengths: below the split threshold, because one
    // long cycle explains it at least as well as two 22-day ones.
    expect(repairSkippedCycles([45], 28)).toEqual([
      { length: 45, imputed: false },
    ]);
  });

  it("leaves a long gap alone when it does not divide cleanly", () => {
    // 66/28 rounds to 2, but 33 is 18% off the typical length — too far to
    // call it a skip.
    expect(repairSkippedCycles([66], 28)).toEqual([
      { length: 66, imputed: false },
    ]);
  });
});

describe("observationsFrom", () => {
  it("weights the most recent cycle fully and decays the older ones", () => {
    const { data } = steady();
    const observations = observationsFrom(
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    );
    expect(observations).toHaveLength(11);
    expect(observations[observations.length - 1]!.weight).toBeCloseTo(1, 12);
    // Six cycles back is one half-life.
    expect(observations[observations.length - 7]!.weight).toBeCloseTo(0.5, 12);
    // The decay is monotone.
    for (let i = 1; i < observations.length; i++) {
      expect(observations[i]!.weight).toBeGreaterThan(
        observations[i - 1]!.weight,
      );
    }
  });

  it("halves the weight of a cycle recovered from a skipped gap", () => {
    const { data } = build({
      firstStart: "2026-01-05",
      // The third gap is two unlogged cycles.
      cycleLengths: [28, 28, 56, 28],
    });
    const observations = observationsFrom(
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    );
    const imputed = observations.filter((o) => o.imputed);
    expect(imputed).toHaveLength(2);
    expect(imputed.every((o) => o.length === 28)).toBe(true);
    // Each imputed cycle is worth half a real one at the same age.
    const real = observations.filter((o) => !o.imputed);
    expect(imputed[1]!.weight).toBeLessThan(real[real.length - 1]!.weight);
  });

  it("has nothing to fit from a single period", () => {
    const { data } = build({ firstStart: "2026-02-01", cycleLengths: [] });
    expect(
      observationsFrom(derivePeriods(data), DEFAULT_MODEL_OPTIONS),
    ).toEqual([]);
  });
});

describe("fitPosterior", () => {
  it("falls back to the prior with no observations", () => {
    const params = fitPosterior([], DEFAULT_MODEL_OPTIONS);
    expect(params.typicalLength).toBeCloseTo(28, 6);
    // 2α₀ = 5 degrees of freedom: deliberately fat-tailed with no history.
    expect(params.df).toBeCloseTo(5, 12);
    expect(params.effectiveSample).toBe(0);
  });

  it("centres on the observed length and tightens as cycles accumulate", () => {
    const one = fitPosterior(
      [{ length: 31, weight: 1, imputed: false }],
      DEFAULT_MODEL_OPTIONS,
    );
    const many = fitPosterior(
      Array.from({ length: 12 }, () => ({
        length: 31,
        weight: 1,
        imputed: false,
      })),
      DEFAULT_MODEL_OPTIONS,
    );
    // One observation is still pulled halfway toward the 28-day prior; twelve
    // have all but taken it over — the prior is worth κ₀ = 1 observation, so
    // it never disappears completely, and should not.
    expect(one.typicalLength).toBeGreaterThan(28);
    expect(one.typicalLength).toBeLessThan(31);
    expect(many.typicalLength).toBeCloseTo(31, 0);
    expect(many.typicalLength).toBeLessThan(31);
    // More data means more degrees of freedom and a narrower predictive.
    expect(many.df).toBeGreaterThan(one.df);
    expect(many.scale).toBeLessThan(one.scale);
  });

  it("widens the predictive when the cycles disagree", () => {
    const tight = fitPosterior(
      [26, 28, 27, 28, 27, 28].map((length) => ({
        length,
        weight: 1,
        imputed: false,
      })),
      DEFAULT_MODEL_OPTIONS,
    );
    const loose = fitPosterior(
      [21, 35, 24, 38, 26, 33].map((length) => ({
        length,
        weight: 1,
        imputed: false,
      })),
      DEFAULT_MODEL_OPTIONS,
    );
    expect(loose.scale).toBeGreaterThan(tight.scale);
    expect(loose.spreadDays).toBeGreaterThan(tight.spreadDays);
  });
});

describe("predictivePmf", () => {
  it("is a proper distribution centred on the typical length", () => {
    const params = fitPosterior(
      Array.from({ length: 10 }, () => ({
        length: 30,
        weight: 1,
        imputed: false,
      })),
      DEFAULT_MODEL_OPTIONS,
    );
    const pmf = predictivePmf(params, DEFAULT_MODEL_OPTIONS.maxLeadDays);
    const total = pmf.probabilities.reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(pmf.probabilities.every((p) => p >= 0)).toBe(true);

    let mode = 0;
    for (let i = 1; i < pmf.probabilities.length; i++) {
      if (pmf.probabilities[i]! > pmf.probabilities[mode]!) mode = i;
    }
    expect(pmf.offset + mode).toBe(30);
  });

  it("keeps the right skew of the log-normal", () => {
    // The whole reason the model works in logs: a week late must carry more
    // probability than a week early. Being symmetric in `ln(days)` makes it
    // asymmetric in days, which is the shape cycle lengths actually have.
    const params = fitPosterior(
      [24, 28, 32, 26, 34, 29].map((length) => ({
        length,
        weight: 1,
        imputed: false,
      })),
      DEFAULT_MODEL_OPTIONS,
    );
    const pmf = predictivePmf(params, DEFAULT_MODEL_OPTIONS.maxLeadDays);
    const centre = Math.round(params.typicalLength);
    const mass = (from: number, to: number) =>
      pmf.probabilities.reduce(
        (sum, p, i) =>
          pmf.offset + i >= from && pmf.offset + i <= to ? sum + p : sum,
        0,
      );
    expect(mass(centre + 7, 1000)).toBeGreaterThan(mass(0, centre - 7));

    // The signature of the skew: the peak sits at or below the middle, and
    // there is more probability above the peak than below it.
    const peak = pmfMode(pmf);
    expect(peak).toBeLessThanOrEqual(pmfQuantile(pmf, 0.5));
    expect(mass(peak + 1, 1000)).toBeGreaterThan(mass(0, peak - 1));
  });
});

describe("periodLengthModel", () => {
  /** Six periods of `periodLength` days at a steady 28-day gap, truncated so
   *  the last one has only `runningDays` of it logged. */
  function history(periodLength: number, runningDays = periodLength): AppData {
    const { data, starts } = build({
      firstStart: "2026-01-01",
      cycleLengths: [28, 28, 28, 28, 28],
      periodLength,
      logEveryDay: false,
    });
    const last = starts[starts.length - 1]!;
    for (let i = runningDays; i < periodLength; i++) {
      delete data.entries[addDays(last, i)];
    }
    return data;
  }

  it("is a distribution over 1 … MAX_PERIOD_LENGTH days", () => {
    const m = periodLengthModel(
      derivePeriods(history(5)),
      "2026-06-10",
      DEFAULT_CYCLE_OPTIONS,
    );
    expect(m.pmf.offset).toBe(1);
    expect(m.pmf.probabilities).toHaveLength(MAX_PERIOD_LENGTH);
    const total = m.pmf.probabilities.reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(m.pmf.probabilities.every((p) => p >= 0)).toBe(true);
  });

  it("centres on the episodes actually logged", () => {
    const at = (length: number) =>
      periodLengthModel(
        derivePeriods(history(length)),
        "2026-06-10",
        DEFAULT_CYCLE_OPTIONS,
      ).typicalLength;
    expect(at(3)).toBe(3);
    expect(at(5)).toBe(5);
    expect(at(7)).toBe(7);
  });

  it("is the configured default before any episode has finished", () => {
    const data = emptyDoc();
    data.entries["2026-03-01"] = {
      date: "2026-03-01",
      bleeding: true,
      moodSwings: false,
      lust: false,
      sex: false,
      temperature: null,
      fertilityTest: null,
      updatedAt: STAMP,
    };
    const m = periodLengthModel(
      derivePeriods(data),
      "2026-03-01",
      DEFAULT_CYCLE_OPTIONS,
    );
    expect(m.observedEpisodes).toBe(0);
    expect(m.typicalLength).toBe(DEFAULT_CYCLE_OPTIONS.defaultPeriodLength);
  });

  it("reports the episode in progress and leaves it out of the fit", () => {
    // Five finished five-day periods, plus one a single day old.
    const data = history(5, 1);
    const m = periodLengthModel(
      derivePeriods(data),
      "2026-05-21",
      DEFAULT_CYCLE_OPTIONS,
    );
    expect(m.observedEpisodes).toBe(5);
    expect(m.typicalLength).toBe(5);
    expect(m.inProgress).toEqual({
      start: "2026-05-21",
      lastBleedingDay: "2026-05-21",
      observedDays: 1,
    });
  });

  it("has no episode in progress once the last one is over", () => {
    const m = periodLengthModel(
      derivePeriods(history(5)),
      "2026-06-10",
      DEFAULT_CYCLE_OPTIONS,
    );
    expect(m.inProgress).toBeNull();
  });

  it("never rules a length out entirely", () => {
    // Six identical five-day periods. Without a floor the distribution would
    // put a hard zero on a sixth day of bleeding, and the conditional survival
    // that the calendar reads would divide by it.
    const m = periodLengthModel(
      derivePeriods(history(5)),
      "2026-06-10",
      DEFAULT_CYCLE_OPTIONS,
    );
    for (let n = 1; n <= MAX_PERIOD_LENGTH; n++) {
      expect(periodLengthSurvival(m, n)).toBeGreaterThan(0);
    }
  });

  it("survives monotonically, from certain to impossible", () => {
    const m = periodLengthModel(
      derivePeriods(history(5)),
      "2026-06-10",
      DEFAULT_CYCLE_OPTIONS,
    );
    expect(periodLengthSurvival(m, 0)).toBe(1);
    expect(periodLengthSurvival(m, 1)).toBeCloseTo(1, 12);
    expect(periodLengthSurvival(m, MAX_PERIOD_LENGTH + 1)).toBe(0);
    for (let n = 1; n <= MAX_PERIOD_LENGTH; n++) {
      expect(periodLengthSurvival(m, n)).toBeLessThanOrEqual(
        periodLengthSurvival(m, n - 1),
      );
    }
    // Half the mass sits at five days, so five is near-certain and eight is
    // most of the way gone.
    expect(periodLengthSurvival(m, 5)).toBeGreaterThan(0.5);
    expect(periodLengthSurvival(m, 8)).toBeLessThan(0.1);
  });
});

describe("probabilisticForecast", () => {
  it("has nothing to say before a period is logged", () => {
    expect(probabilisticForecast(emptyDoc(), "2026-03-01")).toBeNull();
  });

  it("predicts one typical cycle on from the last start", () => {
    const { data, starts } = steady();
    const lastStart = starts[starts.length - 1]!;
    const today = addDays(lastStart, 20);

    const f = probabilisticForecast(data, today, "univariate")!;
    expect(f.expectedDay).toBe(addDays(lastStart, 28));
    expect(f.daysUntilExpected).toBe(8);
    expect(f.anchorStart).toBe(lastStart);
    expect(f.confidence).toBe("high");
  });

  it("nests the credible intervals, widest outermost", () => {
    const { data, starts } = steady();
    const f = probabilisticForecast(
      data,
      addDays(starts[starts.length - 1]!, 20),
      "univariate",
    )!;
    const [ci95, ci80, ci50] = f.intervals;
    expect(ci95!.mass).toBe(0.95);
    expect(ci50!.widthDays).toBeLessThanOrEqual(ci80!.widthDays);
    expect(ci80!.widthDays).toBeLessThanOrEqual(ci95!.widthDays);
    expect(ci95!.start <= ci80!.start).toBe(true);
    expect(ci95!.end >= ci80!.end).toBe(true);
    // The day named is inside every band.
    expect(f.expectedDay >= ci50!.start && f.expectedDay <= ci50!.end).toBe(
      true,
    );
  });

  it("draws a wider band from an erratic history than a steady one", () => {
    const regular = build({
      firstStart: "2025-09-01",
      cycleLengths: [28, 28, 27, 28, 29, 28, 28],
    });
    const erratic = build({
      firstStart: "2025-09-01",
      cycleLengths: [21, 35, 24, 38, 26, 33, 22],
    });
    const width = (b: ReturnType<typeof build>) => {
      const last = b.starts[b.starts.length - 1]!;
      const f = probabilisticForecast(b.data, addDays(last, 10), "univariate")!;
      return f.intervals.find((i) => i.mass === 0.8)!.widthDays;
    };
    expect(width(erratic)).toBeGreaterThan(width(regular));
  });

  it("is humbler about two cycles than about ten", () => {
    const short = build({ firstStart: "2026-01-05", cycleLengths: [28, 28] });
    const long = steady();
    const width = (b: ReturnType<typeof build>) => {
      const last = b.starts[b.starts.length - 1]!;
      const f = probabilisticForecast(b.data, addDays(last, 10), "univariate")!;
      return f.intervals.find((i) => i.mass === 0.8)!.widthDays;
    };
    // Same (perfectly regular) cycle length, but far less of it: the Student-t
    // degrees of freedom do the widening on their own.
    expect(width(short)).toBeGreaterThan(width(long));
  });

  it("rules out days already reported without bleeding", () => {
    const { data, starts } = steady();
    const lastStart = starts[starts.length - 1]!;
    const predicted = addDays(lastStart, 28);
    const today = addDays(predicted, 2);

    // A diligent user: every day since the last period ended is logged, and
    // none of them bled. The period is two days late, and no day up to today
    // can be its first.
    for (let i = 5; i <= daysBetween(lastStart, today); i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const f = probabilisticForecast(data, today, "univariate")!;

    const excluded = f.days.filter((d) => d.excluded);
    expect(excluded.length).toBeGreaterThan(0);
    for (const day of excluded) {
      expect(day.probability).toBe(0);
      expect(day.day <= today).toBe(true);
    }
    // Every remaining candidate — and so the whole forecast — is in the future.
    expect(f.expectedDay > today).toBe(true);
    expect(f.daysUntilExpected).toBeGreaterThan(0);
  });

  it("sharpens as the days without bleeding accumulate", () => {
    // The survival conditioning is the reason a forecast improves during a
    // cycle rather than sitting still: each logged, bloodless day removes a
    // candidate and the rest renormalise.
    const { data, starts } = steady();
    const lastStart = starts[starts.length - 1]!;
    const widthOn = (dayOfCycle: number) => {
      for (let i = 5; i <= dayOfCycle; i++) {
        const date = addDays(lastStart, i);
        data.entries[date] = {
          date,
          bleeding: false,
          moodSwings: false,
          lust: false,
          sex: false,
          temperature: null,
          fertilityTest: null,
          updatedAt: STAMP,
        };
      }
      const f = probabilisticForecast(
        data,
        addDays(lastStart, dayOfCycle),
        "univariate",
      )!;
      return f.intervals.find((i) => i.mass === 0.8)!.widthDays;
    };
    expect(widthOn(27)).toBeLessThan(widthOn(20));
  });

  it("leaves unreported days possible", () => {
    // Nothing logged since the last period ended: the predicted day is still
    // on the table, because not logging is not a report of "no bleeding".
    const { data, starts } = steady({ logEveryDay: false });
    const lastStart = starts[starts.length - 1]!;
    const f = probabilisticForecast(
      data,
      addDays(lastStart, 30),
      "univariate",
    )!;
    expect(f.days.some((d) => d.excluded)).toBe(false);
    expect(f.expectedDay).toBe(addDays(lastStart, 28));
  });

  it("rolls the anchor forward over cycles that were never logged", () => {
    const { data, starts } = steady({ logEveryDay: false });
    const lastStart = starts[starts.length - 1]!;
    // Three months later with nothing logged in between.
    const today = addDays(lastStart, 90);
    const f = probabilisticForecast(data, today, "univariate")!;
    expect(f.lastObservedStart).toBe(lastStart);
    expect(f.anchorStart).toBe(addDays(lastStart, 56));
    // The date named is in the future, not three months ago.
    expect(daysBetween(today, f.expectedDay)).toBeGreaterThan(-28);
  });

  it("reports a period that is merely late as late", () => {
    const { data, starts } = steady({ logEveryDay: false });
    const lastStart = starts[starts.length - 1]!;
    const f = probabilisticForecast(
      data,
      addDays(lastStart, 31),
      "univariate",
    )!;
    expect(f.daysUntilExpected).toBe(-3);
  });
});

describe("symptomProfile", () => {
  it("finds the premenstrual rise when it is really there", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      swingsBefore: 4,
      backgroundSwingRate: 0.1,
    });
    const profile = symptomProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    )!;

    expect(profile.window).toBe(PREMENSTRUAL_WINDOW);
    expect(profile.informative).toBe(true);
    // Lags 1–4 carry the planted swings; the baseline is the background rate.
    expect(profile.rate[2]!).toBeGreaterThan(profile.baseline * 3);
    expect(profile.rate[12]!).toBeLessThan(profile.rate[2]!);
  });

  it("stays flat, and refuses to be used, on a thin history", () => {
    const { data } = build({
      firstStart: "2026-02-01",
      cycleLengths: [28],
      swingsBefore: 4,
    });
    const profile = symptomProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    )!;
    expect(profile.informative).toBe(false);
  });

  it("has no profile at all with no periods", () => {
    expect(symptomProfile(emptyDoc(), [], DEFAULT_MODEL_OPTIONS)).toBeNull();
  });
});

describe("symptomLogLikelihoodRatio", () => {
  const profile = {
    window: PREMENSTRUAL_WINDOW,
    // A sharp rise over the last three days before onset.
    rate: [0.5, 0.8, 0.8, 0.7, ...Array.from({ length: 10 }, () => 0.1)],
    baseline: 0.1,
    windowDays: 100,
    baselineDays: 100,
    informative: true,
  };
  const entry = (date: string, moodSwings: boolean) => ({
    date,
    bleeding: false,
    moodSwings,
    lust: false,
    sex: false,
    temperature: null,
    fertilityTest: null,
    updatedAt: STAMP,
  });

  it("favours an imminent onset after a run of swings", () => {
    const recent = [
      entry("2026-04-08", true),
      entry("2026-04-09", true),
      entry("2026-04-10", true),
    ];
    // Onset on the 11th puts those days at lags 3, 2, 1 — the peak.
    const soon = symptomLogLikelihoodRatio(
      "2026-04-11",
      recent,
      profile,
      DEFAULT_MODEL_OPTIONS,
    );
    // Onset on the 20th puts them at lags 12, 11, 10 — the flat part.
    const later = symptomLogLikelihoodRatio(
      "2026-04-20",
      recent,
      profile,
      DEFAULT_MODEL_OPTIONS,
    );
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeGreaterThan(0);
  });

  it("treats a placid run as evidence against an imminent onset", () => {
    const recent = [
      entry("2026-04-08", false),
      entry("2026-04-09", false),
      entry("2026-04-10", false),
    ];
    expect(
      symptomLogLikelihoodRatio(
        "2026-04-11",
        recent,
        profile,
        DEFAULT_MODEL_OPTIONS,
      ),
    ).toBeLessThan(0);
  });

  it("ignores reports that fall after the candidate day", () => {
    expect(
      symptomLogLikelihoodRatio(
        "2026-04-01",
        [entry("2026-04-08", true)],
        profile,
        DEFAULT_MODEL_OPTIONS,
      ),
    ).toBe(0);
  });

  it("is clamped, so symptoms can never overrule the history", () => {
    const recent = Array.from({ length: 14 }, (_, i) =>
      entry(addDays("2026-04-01", i), true),
    );
    const value = symptomLogLikelihoodRatio(
      "2026-04-15",
      recent,
      profile,
      DEFAULT_MODEL_OPTIONS,
    );
    expect(value).toBeLessThanOrEqual(DEFAULT_MODEL_OPTIONS.symptomMaxLogLr);
  });
});

// The ovulatory channels. What separates them from the mood one is *where*
// their peak sits: an onset-anchored window of a fortnight cannot see ovulation
// at all, so these read over the longer window and their bump lands in the
// middle of it rather than up against the right-hand end.
describe("lustProfile / sexProfile", () => {
  /** A year of steady cycles with lust reported across the fertile days —
   *  lags 12–16 before onset, which is ovulation ±2 on a 28-day cycle. */
  const fertileLags = [12, 13, 14, 15, 16];

  it("finds the mid-cycle rise, a luteal phase before the onset", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      lustLags: fertileLags,
      backgroundLustRate: 0.1,
    });
    const profile = lustProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    )!;

    expect(profile.window).toBe(OVULATORY_WINDOW);
    expect(profile.informative).toBe(true);
    // The peak is at ovulation, not against the onset — which is the whole
    // reason this channel is read over a longer window than mood is.
    expect(profile.rate[14]!).toBeGreaterThan(profile.baseline * 3);
    expect(profile.rate[14]!).toBeGreaterThan(profile.rate[2]! * 2);
  });

  it("reads much flatter for a channel that does not track the cycle", () => {
    // The claim the sex channel rests on: whether it follows the cycle is a
    // fact about a life rather than about hormones, and a channel that does not
    // has to produce a profile too flat to move anything. Both fixtures log the
    // same number of days at a similar overall rate — the only difference is
    // whether the yeses cluster at a lag.
    const cycles = Array.from({ length: 12 }, () => 28);
    const profileOf = (extra: Partial<BuildOptions>) => {
      const { data } = build({
        firstStart: "2025-06-02",
        cycleLengths: cycles,
        ...extra,
      });
      return sexProfile(data, derivePeriods(data), DEFAULT_MODEL_OPTIONS)!;
    };
    const structured = profileOf({ sexLags: fertileLags });
    const confounded = profileOf({ backgroundSexRate: 0.2 });

    const spread = (p: { rate: number[] }) =>
      Math.max(...p.rate) - Math.min(...p.rate);
    expect(confounded.informative).toBe(true);
    expect(spread(confounded)).toBeLessThan(spread(structured) / 2);
  });

  it("has no profile at all with no periods", () => {
    expect(lustProfile(emptyDoc(), [], DEFAULT_MODEL_OPTIONS)).toBeNull();
    expect(sexProfile(emptyDoc(), [], DEFAULT_MODEL_OPTIONS)).toBeNull();
  });
});

describe("fertilityTestProfile", () => {
  const twelveCycles = Array.from({ length: 12 }, () => 28);

  it("is absent until a test has actually been taken", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: twelveCycles,
    });
    expect(
      fertilityTestProfile(data, derivePeriods(data), DEFAULT_MODEL_OPTIONS),
    ).toBeNull();
  });

  it("centres on the luteal phase plus a day before any positive is seen", () => {
    // Tests taken and all negative: there is nothing to learn the lead from, so
    // the configured luteal phase is the whole of it.
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: twelveCycles,
      testLags: [16, 15, 14, 13],
    });
    const profile = fertilityTestProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
      DEFAULT_CYCLE_OPTIONS,
    )!;
    expect(profile.observedPositives).toBe(0);
    expect(profile.leadDays).toBe(DEFAULT_CYCLE_OPTIONS.lutealPhaseLength + 1);
    expect(profile.window).toBe(OVULATORY_WINDOW);
    // The bump peaks at the lead and is back at the floor a week either side.
    expect(profile.rate[15]!).toBe(Math.max(...profile.rate));
    expect(profile.rate[15]!).toBeGreaterThan(profile.baseline * 5);
    expect(profile.rate[8]!).toBeLessThan(profile.baseline);
    // And it is a distribution over which day the surge fell on, not a claim
    // that every day in the middle of the cycle tests positive: the whole bump
    // is worth about one caught surge, not one per lag inside it.
    const bump = profile.rate.reduce((sum, r) => sum + r, 0) - 21 * 0.01;
    expect(bump).toBeGreaterThan(0.6);
    expect(bump).toBeLessThan(0.9);
  });

  it("moves the lead toward the reader's own positives", () => {
    // Surges consistently eleven days before the onset — a short luteal phase,
    // which the textbook fifteen would put four days wrong.
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: twelveCycles,
      testLags: [13, 12, 11, 10],
      positiveTestLag: 11,
    });
    const profile = fertilityTestProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
      DEFAULT_CYCLE_OPTIONS,
    )!;
    expect(profile.observedPositives).toBe(12);
    expect(profile.leadDays).toBeGreaterThan(11);
    expect(profile.leadDays).toBeLessThan(12);
  });

  it("reads a positive strip as evidence for an onset a lead away", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: twelveCycles,
      testLags: [15],
    });
    const profile = fertilityTestProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
      DEFAULT_CYCLE_OPTIONS,
    )!;
    const positive = [
      {
        date: "2026-06-01",
        bleeding: false,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: "positive" as const,
        updatedAt: STAMP,
      },
    ];
    const onLead = binaryLogLikelihoodRatio(
      addDays("2026-06-01", Math.round(profile.leadDays)),
      positive,
      profile,
      DEFAULT_MODEL_OPTIONS,
      readFertilityTest,
      DEFAULT_MODEL_OPTIONS.fertilityTemper,
    );
    const offLead = binaryLogLikelihoodRatio(
      addDays("2026-06-01", Math.round(profile.leadDays) - 7),
      positive,
      profile,
      DEFAULT_MODEL_OPTIONS,
      readFertilityTest,
      DEFAULT_MODEL_OPTIONS.fertilityTemper,
    );
    expect(onLead).toBeGreaterThan(1);
    // A positive at the wrong distance is evidence *against* that day, not
    // merely a shrug — which is what the baseline sitting above the floor buys.
    expect(offLead).toBeLessThan(0);
  });

  it("says nothing at all about a morning nobody tested", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: twelveCycles,
      testLags: [15],
    });
    const profile = fertilityTestProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
      DEFAULT_CYCLE_OPTIONS,
    )!;
    const untested = [
      {
        date: "2026-06-01",
        bleeding: false,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      },
    ];
    expect(
      binaryLogLikelihoodRatio(
        addDays("2026-06-01", Math.round(profile.leadDays)),
        untested,
        profile,
        DEFAULT_MODEL_OPTIONS,
        readFertilityTest,
        DEFAULT_MODEL_OPTIONS.fertilityTemper,
      ),
    ).toBe(0);
  });
});

describe("centredTemperatures", () => {
  it("expresses each reading against its own neighbourhood", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 10 }, () => 28),
      temperatureShift: 0.3,
    });
    const centred = centredTemperatures(data, DEFAULT_MODEL_OPTIONS);
    expect(centred.length).toBeGreaterThan(200);
    // Centring removes the level, so the deviations straddle zero.
    const mean =
      centred.reduce((sum, r) => sum + r.deviation, 0) / centred.length;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it("is unmoved by a thermometer reading uniformly high", () => {
    const base = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 8 }, () => 28),
      temperatureShift: 0.3,
    });
    const shifted = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 8 }, () => 28),
      temperatureShift: 0.3,
    });
    // A new thermometer that reads half a degree high, from the start. Half
    // rather than a whole degree because a whole one would push the luteal
    // days past the fever line, and above that the app has no way to tell a
    // miscalibrated thermometer from an actual fever — it drops both.
    for (const entry of Object.values(shifted.data.entries)) {
      if (entry.temperature !== null) entry.temperature += 0.5;
    }
    const a = centredTemperatures(base.data, DEFAULT_MODEL_OPTIONS);
    const b = centredTemperatures(shifted.data, DEFAULT_MODEL_OPTIONS);
    for (let i = 0; i < a.length; i++) {
      expect(b[i]!.deviation).toBeCloseTo(a[i]!.deviation, 6);
    }
  });

  it("has nothing to centre when no readings were taken", () => {
    const { data } = steady();
    expect(centredTemperatures(data, DEFAULT_MODEL_OPTIONS)).toEqual([]);
  });

  it("leaves a fever out of the channel entirely", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 8 }, () => 28),
      temperatureShift: 0.3,
    });
    const clean = centredTemperatures(data, DEFAULT_MODEL_OPTIONS);
    // Three mornings in the middle of a follicular phase, where a rise is the
    // last thing the model expects.
    const ill = ["2025-08-08", "2025-08-09", "2025-08-10"];

    // Just under the fever line the readings are ordinary evidence — and this
    // is the damage the line exists to prevent: each one lands in the channel
    // carrying three times the deviation the whole biphasic shift amounts to.
    for (const date of ill) data.entries[date]!.temperature = 37.4;
    const spiky = centredTemperatures(data, DEFAULT_MODEL_OPTIONS);
    expect(spiky.length).toBe(clean.length);
    expect(spiky.find((r) => r.date === ill[0])!.deviation).toBeGreaterThan(
      0.8,
    );

    // Over it, and they are not evidence about a cycle at all.
    for (const date of ill) data.entries[date]!.temperature = 38.6;
    const withFever = centredTemperatures(data, DEFAULT_MODEL_OPTIONS);
    expect(withFever.length).toBe(clean.length - ill.length);
    expect(withFever.map((r) => r.date)).not.toContain(ill[0]);
    // And the mornings on either side are left where they were: three
    // readings out of a rolling window move its median by a hundredth, which
    // is the point of centring on a median rather than on a mean.
    expect(
      withFever.find((r) => r.date === "2025-08-07")!.deviation,
    ).toBeCloseTo(clean.find((r) => r.date === "2025-08-07")!.deviation, 1);
  });
});

describe("temperatureProfile", () => {
  it("recovers the biphasic shift", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      temperatureShift: 0.3,
    });
    const profile = temperatureProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    )!;

    expect(profile.informative).toBe(true);
    // Mid-luteal (a week before bleeding) runs warm; the follicular baseline
    // does not, and the difference is the planted third of a degree.
    expect(profile.mean[7]!).toBeGreaterThan(profile.baselineMean + 0.2);
    expect(profile.shiftCelsius).toBeGreaterThan(0.2);
    expect(profile.shiftCelsius).toBeLessThan(0.45);
    // …and it is already falling by the day bleeding starts.
    expect(profile.mean[0]!).toBeLessThan(profile.mean[7]!);
  });

  it("stays flat when the temperature carries no cycle signal", () => {
    const { data } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      // Readings taken, but no biphasic pattern at all beyond the jitter.
      temperatureShift: 0.001,
    });
    const profile = temperatureProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    )!;
    expect(Math.abs(profile.shiftCelsius)).toBeLessThan(0.1);
  });

  it("refuses to be used from a fortnight of readings", () => {
    const { data } = build({
      firstStart: "2026-03-02",
      cycleLengths: [28],
      temperatureShift: 0.3,
      temperatureCoverage: 0.3,
    });
    const profile = temperatureProfile(
      data,
      derivePeriods(data),
      DEFAULT_MODEL_OPTIONS,
    )!;
    expect(profile.informative).toBe(false);
  });

  it("has no profile without readings", () => {
    const { data } = steady();
    expect(
      temperatureProfile(data, derivePeriods(data), DEFAULT_MODEL_OPTIONS),
    ).toBeNull();
  });
});

describe("temperatureLogLikelihoodRatio", () => {
  const profile = {
    window: PREMENSTRUAL_WINDOW,
    // Warm through the luteal plateau, falling to the onset day.
    mean: [0.0, 0.1, 0.2, ...Array.from({ length: 11 }, () => 0.28)],
    baselineMean: -0.14,
    sd: 0.09,
    windowDays: 100,
    baselineDays: 100,
    shiftCelsius: 0.42,
    informative: true,
  };
  const reading = (date: string, deviation: number) => ({ date, deviation });

  it("favours a nearby onset after a run of warm mornings", () => {
    const recent = [
      reading("2026-04-05", 0.27),
      reading("2026-04-06", 0.3),
      reading("2026-04-07", 0.26),
    ];
    // Onset on the 12th puts those at lags 7, 6, 5 — the plateau.
    const plateau = temperatureLogLikelihoodRatio(
      "2026-04-12",
      recent,
      profile,
      DEFAULT_MODEL_OPTIONS,
    );
    // Onset on the 30th puts them well outside the window, where the model
    // expects the follicular baseline instead.
    const distant = temperatureLogLikelihoodRatio(
      "2026-04-30",
      recent,
      profile,
      DEFAULT_MODEL_OPTIONS,
    );
    expect(plateau).toBeGreaterThan(0);
    expect(plateau).toBeGreaterThan(distant);
  });

  it("argues against an imminent onset while the mornings are still cool", () => {
    const recent = [
      reading("2026-04-05", -0.15),
      reading("2026-04-06", -0.12),
      reading("2026-04-07", -0.16),
    ];
    expect(
      temperatureLogLikelihoodRatio(
        "2026-04-12",
        recent,
        profile,
        DEFAULT_MODEL_OPTIONS,
      ),
    ).toBeLessThan(0);
  });

  it("ignores readings taken after the candidate day", () => {
    expect(
      temperatureLogLikelihoodRatio(
        "2026-04-01",
        [reading("2026-04-08", 0.3)],
        profile,
        DEFAULT_MODEL_OPTIONS,
      ),
    ).toBe(0);
  });

  it("is clamped, however many mornings agree", () => {
    const recent = Array.from({ length: 14 }, (_, i) =>
      reading(addDays("2026-04-01", i), 0.3),
    );
    expect(
      Math.abs(
        temperatureLogLikelihoodRatio(
          "2026-04-15",
          recent,
          profile,
          DEFAULT_MODEL_OPTIONS,
        ),
      ),
    ).toBeLessThanOrEqual(DEFAULT_MODEL_OPTIONS.symptomMaxLogLr);
  });
});

describe("the multivariate model", () => {
  /** A year of steady cycles with a strong, consistent premenstrual pattern. */
  function withSymptoms(swingsBefore: number) {
    return build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      swingsBefore,
      backgroundSwingRate: 0.08,
    });
  }

  it("matches the univariate model when the profile is too thin to use", () => {
    const { data, starts } = build({
      firstStart: "2026-03-02",
      cycleLengths: [28],
    });
    const today = addDays(starts[starts.length - 1]!, 20);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;
    expect(multi.expectedDay).toBe(uni.expectedDay);
    expect(multi.evidenceShiftDays).toBe(0);
  });

  it("pulls the forecast earlier after an unexpected run of swings", () => {
    const { data, starts } = withSymptoms(4);
    const lastStart = starts[starts.length - 1]!;
    // Day 20 of the cycle — a full week before the swings usually start — but
    // reported rough for three days running.
    for (let i = 0; i < 3; i++) {
      const date = addDays(lastStart, 18 + i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: true,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const today = addDays(lastStart, 20);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;

    expect(multi.symptoms?.informative).toBe(true);
    expect(daysBetween(multi.expectedDay, uni.expectedDay)).toBeGreaterThan(0);
    expect(multi.evidenceShiftDays).toBeLessThan(0);
  });

  it("pushes the forecast later after a quiet stretch", () => {
    const { data, starts } = withSymptoms(6);
    const lastStart = starts[starts.length - 1]!;
    // The six days before the due date would normally be rough. They were not.
    for (let i = 22; i <= 27; i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const today = addDays(lastStart, 27);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;
    expect(daysBetween(uni.expectedDay, multi.expectedDay)).toBeGreaterThan(0);
    expect(multi.evidenceShiftDays).toBeGreaterThan(0);
  });

  it("keeps the shift bounded — evidence, not a veto", () => {
    const { data, starts } = withSymptoms(4);
    const lastStart = starts[starts.length - 1]!;
    for (let i = 8; i <= 20; i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: true,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const multi = probabilisticForecast(
      data,
      addDays(lastStart, 20),
      "multivariate",
    )!;
    // A fortnight of swings moves the date by days, not by a fortnight.
    expect(Math.abs(multi.evidenceShiftDays)).toBeLessThanOrEqual(7);
  });

  it("brings the forecast forward once the mornings have been warm a while", () => {
    // A year of tracked temperature, then a cycle whose luteal plateau
    // started early — ovulation came sooner, so the period will too.
    const { data, starts } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      temperatureShift: 0.3,
    });
    const lastStart = starts[starts.length - 1]!;
    for (let i = 5; i <= 20; i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: false,
        lust: false,
        sex: false,
        // Raised from cycle day 6 — four days earlier than this history's norm.
        temperature: i >= 9 ? 36.7 : 36.4,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const today = addDays(lastStart, 20);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;

    expect(multi.temperature?.informative).toBe(true);
    expect(daysBetween(multi.expectedDay, uni.expectedDay)).toBeGreaterThan(0);
    expect(multi.evidenceShiftDays).toBeLessThan(0);
  });

  it("holds the forecast back while the mornings are still cool", () => {
    const { data, starts } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      temperatureShift: 0.3,
    });
    const lastStart = starts[starts.length - 1]!;
    // Cycle day 21 and the temperature has not risen: ovulation is late, so
    // the period is too.
    for (let i = 5; i <= 20; i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: 36.4,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const today = addDays(lastStart, 20);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;
    expect(daysBetween(uni.expectedDay, multi.expectedDay)).toBeGreaterThan(0);
    expect(multi.evidenceShiftDays).toBeGreaterThan(0);
  });

  it("reads both channels together, and stays bounded when they agree", () => {
    const { data, starts } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      swingsBefore: 4,
      backgroundSwingRate: 0.08,
      temperatureShift: 0.3,
    });
    const lastStart = starts[starts.length - 1]!;
    // Warm *and* rough, well before either usually shows up: both channels
    // point the same way.
    for (let i = 5; i <= 20; i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: i >= 18,
        lust: false,
        sex: false,
        temperature: i >= 9 ? 36.7 : 36.4,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const multi = probabilisticForecast(
      data,
      addDays(lastStart, 20),
      "multivariate",
    )!;
    expect(multi.symptoms?.informative).toBe(true);
    expect(multi.temperature?.informative).toBe(true);
    expect(multi.evidenceShiftDays).toBeLessThan(0);
    // Two agreeing channels may say more than one, but the cycle history is
    // still what the forecast is anchored to.
    expect(Math.abs(multi.evidenceShiftDays)).toBeLessThanOrEqual(8);
  });

  // The ovulatory channels, end to end. What they buy over the premenstrual
  // ones is timing: they speak in the middle of the cycle, when the forecast
  // still has a fortnight of prior spread left to sharpen, rather than in the
  // last few days when it has nearly resolved itself anyway.
  it("brings the forecast forward when this cycle's lust peaked early", () => {
    const { data, starts } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      lustLags: [12, 13, 14, 15, 16],
      backgroundLustRate: 0.08,
    });
    const lastStart = starts[starts.length - 1]!;
    // Lust on cycle days 8–12 — four days ahead of where this history puts it,
    // so ovulation came early and the period will follow it.
    for (let i = 5; i <= 15; i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: false,
        lust: i >= 7 && i <= 11,
        sex: false,
        temperature: null,
        fertilityTest: null,
        updatedAt: STAMP,
      };
    }
    const today = addDays(lastStart, 15);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;

    expect(multi.lust?.informative).toBe(true);
    expect(daysBetween(multi.expectedDay, uni.expectedDay)).toBeGreaterThan(0);
    expect(multi.evidenceShiftDays).toBeLessThan(0);
  });

  it("dates the next period from a positive fertility test", () => {
    // A history with no tests in it at all, so the profile is the constructed
    // one and the lead is the configured luteal phase plus a day. The whole
    // point of the channel: a strip helps on the first cycle it is used.
    const { data, starts } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
    });
    const lastStart = starts[starts.length - 1]!;
    // A surge on cycle day 10 — four days earlier than a 28-day cycle implies.
    const surge = addDays(lastStart, 9);
    for (let i = 5; i <= 12; i++) {
      const date = addDays(lastStart, i);
      data.entries[date] = {
        date,
        bleeding: false,
        moodSwings: false,
        lust: false,
        sex: false,
        temperature: null,
        fertilityTest: date === surge ? "positive" : "negative",
        updatedAt: STAMP,
      };
    }
    const today = addDays(lastStart, 12);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;

    expect(multi.fertilityTest?.informative).toBe(true);
    expect(multi.fertilityTest?.observedPositives).toBe(0);
    // The strip pulls the date toward the surge plus the lead, and the cycle
    // history holds it back from landing exactly there.
    const implied = addDays(surge, DEFAULT_CYCLE_OPTIONS.lutealPhaseLength + 1);
    expect(daysBetween(multi.expectedDay, uni.expectedDay)).toBeGreaterThan(0);
    expect(multi.expectedDay >= implied).toBe(true);
    expect(multi.expectedDay <= uni.expectedDay).toBe(true);
  });

  it("leaves the forecast alone when no test was taken", () => {
    // The same fixture with the strips removed. A morning nobody tested is not
    // a negative, so the channel has to be silent rather than confident.
    const { data, starts } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
    });
    const today = addDays(starts[starts.length - 1]!, 12);
    const uni = probabilisticForecast(data, today, "univariate")!;
    const multi = probabilisticForecast(data, today, "multivariate")!;
    expect(multi.fertilityTest).toBeNull();
    expect(multi.expectedDay).toBe(uni.expectedDay);
  });

  it("ignores temperature entirely under the univariate model", () => {
    const { data, starts } = build({
      firstStart: "2025-06-02",
      cycleLengths: Array.from({ length: 12 }, () => 28),
      temperatureShift: 0.3,
    });
    const f = probabilisticForecast(
      data,
      addDays(starts[starts.length - 1]!, 20),
      "univariate",
    )!;
    expect(f.temperature).toBeNull();
    expect(f.symptoms).toBeNull();
    expect(f.evidenceShiftDays).toBe(0);
  });

  it("stays a proper distribution after the update", () => {
    const { data, starts } = withSymptoms(5);
    const f = probabilisticForecast(
      data,
      addDays(starts[starts.length - 1]!, 22),
      "multivariate",
    )!;
    const total = f.days.reduce((sum, d) => sum + d.probability, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(f.days.every((d) => d.probability >= 0)).toBe(true);
    expect(f.days[f.days.length - 1]!.cumulative).toBeCloseTo(1, 10);
    expect(f.probabilityWithinWeek).toBeGreaterThan(0);
    expect(f.probabilityWithinWeek).toBeLessThanOrEqual(1);
  });
});

describe("backtest", () => {
  it("says nothing at all from a handful of cycles", () => {
    const { data } = build({
      firstStart: "2026-01-05",
      cycleLengths: [28, 28],
    });
    expect(backtest(data).meanAbsoluteError).toBeNull();
    expect(backtest(data).folds).toEqual([]);
  });

  it("is accurate and well covered on a regular history", () => {
    const { data } = build({
      firstStart: "2025-01-06",
      cycleLengths: [28, 27, 29, 28, 28, 29, 27, 28, 28, 29, 28, 27, 28],
    });
    const result = backtest(data, "univariate");
    expect(result.folds.length).toBeGreaterThanOrEqual(5);
    expect(result.meanAbsoluteError!).toBeLessThan(1.5);
    // The bands should nearly always contain the answer on a history this
    // steady — an 80% band that covers less than 80% here would be lying.
    expect(result.coverage80!).toBeGreaterThanOrEqual(80);
    expect(result.coverage95!).toBeGreaterThanOrEqual(result.coverage80!);
  });

  it("never scores a fold against data it could see", () => {
    const { data } = build({
      firstStart: "2025-01-06",
      cycleLengths: [28, 31, 26, 33, 27, 30, 25, 32, 28, 29],
    });
    for (const fold of backtest(data, "univariate").folds) {
      expect(daysBetween(fold.evaluatedOn, fold.actual)).toBeGreaterThan(0);
    }
  });

  it("keeps its bands honest on an erratic history", () => {
    // Wild cycles: the model should get the *dates* wrong and still cover them,
    // because the bands widen with the disagreement.
    const { data } = build({
      firstStart: "2025-01-06",
      cycleLengths: [21, 35, 24, 38, 26, 33, 22, 36, 25, 31, 23, 34],
    });
    const result = backtest(data, "univariate");
    expect(result.meanAbsoluteError!).toBeGreaterThan(2);
    expect(result.coverage95!).toBeGreaterThanOrEqual(60);
  });

  it("compares against the plain median rule", () => {
    const { data } = build({
      firstStart: "2025-01-06",
      cycleLengths: [28, 27, 29, 28, 28, 29, 27, 28, 28],
    });
    const result = backtest(data, "univariate");
    expect(result.baselineMeanAbsoluteError).not.toBeNull();
    // Not "better than" — on a perfectly regular history the two agree, and
    // claiming a win there would be the kind of benchmark nobody should trust.
    expect(result.meanAbsoluteError!).toBeLessThanOrEqual(
      result.baselineMeanAbsoluteError! + 1,
    );
  });
});

describe("confidenceFrom", () => {
  it("has no answer without observations", () => {
    expect(confidenceFrom(3, 0)).toBe("none");
  });

  it("needs both a narrow band and enough cycles to be confident", () => {
    expect(confidenceFrom(3, 8)).toBe("high");
    expect(confidenceFrom(3, 2)).toBe("low");
    expect(confidenceFrom(8, 8)).toBe("medium");
    expect(confidenceFrom(20, 8)).toBe("low");
  });
});

describe("options plumbing", () => {
  it("takes the prior cycle length from the user's setting", () => {
    const { data, starts } = build({
      firstStart: "2026-03-02",
      cycleLengths: [],
    });
    const f = probabilisticForecast(
      data,
      addDays(starts[0]!, 10),
      "univariate",
      {
        ...DEFAULT_CYCLE_OPTIONS,
        defaultCycleLength: 35,
      },
    )!;
    // With no cycle observed at all, the prior is the whole model.
    expect(f.expectedDay).toBe(addDays(starts[0]!, 35));
  });
});

describe("fitRobustPosterior", () => {
  const observe = (lengths: readonly number[]): CycleObservation[] =>
    lengths.map((length) => ({ length, weight: 1, imputed: false }));

  it("files one stretched cycle under the wide component", () => {
    const lengths = [28, 28, 28, 28, 45, 28, 28, 28, 28];
    const robust = fitRobustPosterior(observe(lengths), DEFAULT_MODEL_OPTIONS);
    const plain = fitPosterior(observe(lengths), DEFAULT_MODEL_OPTIONS);

    // The centre stays on the pattern and the spread stops paying for the
    // outlier — that is the whole point of the mixture.
    expect(robust.params.typicalLength).toBeGreaterThan(27);
    expect(robust.params.typicalLength).toBeLessThan(29);
    expect(robust.params.spreadDays).toBeLessThan(plain.spreadDays / 2);

    const shares = robust.observations.map((o) => o.standardShare!);
    expect(Math.min(...shares.slice(0, 4))).toBeGreaterThan(0.9);
    expect(shares[4]!).toBeLessThan(0.2);

    // …and the outlier raises the fitted share of nonstandard cycles above
    // the prior instead of vanishing.
    expect(robust.params.outlierShare).toBeGreaterThan(
      DEFAULT_MODEL_OPTIONS.outlierPriorShare,
    );
  });

  it("downweights nothing when the history is erratic through and through", () => {
    const lengths = [21, 35, 24, 38, 26, 33, 22, 36];
    const robust = fitRobustPosterior(observe(lengths), DEFAULT_MODEL_OPTIONS);

    // Every cycle disagrees, so no cycle stands out: the spread stays wide
    // and every responsibility stays high. Robustness must never turn an
    // irregular history into a confidently narrow forecast.
    for (const o of robust.observations) {
      expect(o.standardShare!).toBeGreaterThan(0.7);
    }
    expect(robust.params.spreadDays).toBeGreaterThan(4);
  });

  it("keeps a steady history exactly as believable as before", () => {
    const lengths = [28, 27, 29, 28, 28, 29, 27, 28];
    const robust = fitRobustPosterior(observe(lengths), DEFAULT_MODEL_OPTIONS);
    const plain = fitPosterior(observe(lengths), DEFAULT_MODEL_OPTIONS);
    expect(robust.params.typicalLength).toBeCloseTo(plain.typicalLength, 1);
    for (const o of robust.observations) {
      expect(o.standardShare!).toBeGreaterThan(0.9);
    }
  });

  it("keeps a fat right tail in the predictive for the next stretched cycle", () => {
    const lengths = [28, 28, 28, 28, 45, 28, 28, 28, 28];
    const { params } = fitRobustPosterior(
      observe(lengths),
      DEFAULT_MODEL_OPTIONS,
    );
    const mixture = predictivePmf(params, 90);
    const sharp = predictivePmf({ ...params, outlierShare: 0 }, 90);
    const tail = (pmf: typeof mixture) =>
      pmf.probabilities.reduce(
        (sum, p, i) => (pmf.offset + i >= 36 ? sum + p : sum),
        0,
      );
    // The mixture prices in the possibility of another long cycle; a pure
    // single-component predictive fitted this tightly all but denies it.
    expect(tail(mixture)).toBeGreaterThan(tail(sharp) + 0.02);
    const total = mixture.probabilities.reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe("detectThermalShift", () => {
  const reading = (date: string, deviation: number): CentredReading => ({
    date,
    deviation,
  });
  /** Daily readings from `first`, at the given deviations. */
  const run = (first: string, deviations: readonly number[]) =>
    deviations.map((d, i) => reading(addDays(first, i), d));

  it("finds the first morning of a sustained rise", () => {
    const readings = run(
      "2026-03-01",
      [-0.14, -0.16, -0.13, -0.17, -0.15, -0.14, 0.16, 0.14, 0.17, 0.15],
    );
    expect(detectThermalShift(readings)).toBe("2026-03-07");
  });

  it("sees nothing in a flat, jittery run", () => {
    const readings = run(
      "2026-03-01",
      [-0.02, 0.03, -0.01, 0.02, -0.03, 0.01, 0.02, 0.04, 0.03, 0.01, 0.02],
    );
    expect(detectThermalShift(readings)).toBeNull();
  });

  it("does not call one warm morning a shift", () => {
    const readings = run(
      "2026-03-01",
      [-0.15, -0.14, -0.16, -0.15, -0.13, -0.16, 0.18, -0.14, -0.15, -0.13],
    );
    expect(detectThermalShift(readings)).toBeNull();
  });

  it("needs six mornings of baseline and three of rise", () => {
    const readings = run("2026-03-01", [-0.15, -0.14, -0.16, 0.15, 0.17, 0.16]);
    expect(detectThermalShift(readings)).toBeNull();
  });

  it("refuses three warm mornings scattered across weeks", () => {
    const lows = run("2026-03-01", [-0.15, -0.14, -0.16, -0.15, -0.13, -0.16]);
    const highs = [
      reading("2026-03-07", 0.16),
      reading("2026-03-12", 0.15),
      reading("2026-03-17", 0.17),
    ];
    expect(detectThermalShift([...lows, ...highs])).toBeNull();
  });
});

describe("the thermal-shift anchor", () => {
  it("learns the reader's own lead from past detected shifts", () => {
    const { data, starts } = steady({ temperatureShift: 0.35 });
    const today = addDays(starts[starts.length - 1]!, 4);
    const estimate = thermalShiftEstimate(
      data,
      derivePeriods(data),
      today,
      DEFAULT_MODEL_OPTIONS,
    )!;
    // The fixture raises the temperature through the last 13 days before each
    // onset, so every detected shift leads its onset by 13 — which is also the
    // prior (the configured luteal phase less a day), so the learned lead
    // sits there however many shifts have been seen.
    expect(estimate.observedShifts).toBeGreaterThanOrEqual(8);
    expect(estimate.leadDays).toBeGreaterThan(12);
    expect(estimate.leadDays).toBeLessThan(14);
    // Four mornings into a period there is no rise to detect yet.
    expect(estimate.detectedDay).toBeNull();
    expect(estimate.informative).toBe(false);
  });

  it("is absent entirely without a single reading", () => {
    const { data, starts } = steady();
    const today = addDays(starts[starts.length - 1]!, 10);
    expect(
      thermalShiftEstimate(
        data,
        derivePeriods(data),
        today,
        DEFAULT_MODEL_OPTIONS,
      ),
    ).toBeNull();
    const f = probabilisticForecast(data, today, "multivariate")!;
    expect(f.thermalShift).toBeNull();
  });

  it("scores candidates a learned lead after the shift, and no others", () => {
    const shift = {
      detectedDay: "2026-04-16",
      leadDays: 13,
      leadSd: 2.5,
      observedShifts: 5,
      informative: true,
    };
    const at = (date: string) =>
      thermalShiftLogLikelihoodRatio(date, shift, DEFAULT_MODEL_OPTIONS);
    // Positive at the lead, fading either side, and firmly against a period
    // starting on the shift day itself.
    expect(at("2026-04-29")).toBeGreaterThan(2);
    expect(at("2026-04-29")).toBeGreaterThan(at("2026-04-25"));
    expect(at("2026-04-29")).toBeGreaterThan(at("2026-05-03"));
    expect(at("2026-04-16")).toBe(-DEFAULT_MODEL_OPTIONS.symptomMaxLogLr);
  });

  it("anchors the current cycle once this cycle's rise is seen", () => {
    // A genuinely variable follicular phase: gaps of 26–31 days. The hidden
    // final cycle runs 31 days, but its temperature steps up 13 days before
    // the onset — which is the fact the anchor is supposed to read.
    const { data, starts } = build({
      firstStart: "2025-05-05",
      cycleLengths: [29, 27, 30, 26, 31, 27, 29, 26, 30, 28, 31],
      temperatureShift: 0.35,
    });
    const hidden = starts[starts.length - 1]!;
    const today = addDays(hidden, -9);
    const truncated: AppData = {
      ...data,
      entries: Object.fromEntries(
        Object.entries(data.entries).filter(([date]) => date <= today),
      ),
    };

    const multi = probabilisticForecast(truncated, today, "multivariate")!;
    const uni = probabilisticForecast(truncated, today, "univariate")!;

    expect(uni.thermalShift).toBeNull();
    expect(multi.thermalShift?.detectedDay).toBe(addDays(hidden, -13));

    // Anchored, the forecast lands on the hidden onset even though the cycle
    // history alone points a few days earlier…
    expect(
      Math.abs(daysBetween(hidden, multi.expectedDay)),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(daysBetween(hidden, multi.expectedDay)),
    ).toBeLessThanOrEqual(Math.abs(daysBetween(hidden, uni.expectedDay)));

    // …and says so with a tighter band than the history alone could draw.
    const width80 = (f: typeof multi) =>
      f.intervals.find((i) => i.mass === 0.8)!.widthDays;
    expect(width80(multi)).toBeLessThan(width80(uni));
  });
});
