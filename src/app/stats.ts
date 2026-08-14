// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The numerics the forecast model is built on: weighted moments, a Student-t
// distribution, and the regularized incomplete beta function underneath it.
//
// This exists as its own module for one reason: it is the part of the forecast
// with a *known right answer*. Every function here matches a textbook
// definition, so `tests/stats_test.ts` can pin it against published values
// rather than against whatever the implementation happened to produce. The
// model on top (`forecastModel.ts`) is then only responsible for wiring, not
// for arithmetic.
//
// Pure, allocation-light, and clock-free — the whole file runs in microseconds
// on a phone, which is the constraint that ruled out anything needing an
// optimiser or a sampler.

/** A value paired with how much it should count. Weights are non-negative and
 *  need not sum to anything in particular. */
export type Weighted = { value: number; weight: number };

/** Sum of the weights — the *effective sample size* of a weighted set. Two
 *  observations at half weight are worth one observation, which is exactly the
 *  claim the confidence wording downstream is allowed to make. */
export function totalWeight(items: readonly Weighted[]): number {
  return items.reduce((sum, i) => sum + i.weight, 0);
}

/** Weighted arithmetic mean. Returns 0 for an empty (or all-zero-weight) set;
 *  callers check the weight themselves before trusting it. */
export function weightedMean(items: readonly Weighted[]): number {
  const w = totalWeight(items);
  if (w <= 0) return 0;
  return items.reduce((sum, i) => sum + i.weight * i.value, 0) / w;
}

/** Weighted sum of squared deviations from the weighted mean — the `Σ w(x−x̄)²`
 *  term the conjugate update needs. Not divided by anything, deliberately: the
 *  posterior wants the raw sum, and dividing here would only invite a
 *  disagreement about whether the denominator is `W` or `W−1`. */
export function weightedSumSquares(items: readonly Weighted[]): number {
  const m = weightedMean(items);
  return items.reduce((sum, i) => sum + i.weight * (i.value - m) ** 2, 0);
}

/** Median of a numeric list. Returns null for an empty list rather than NaN —
 *  "no median" is a state the callers handle, and NaN would leak silently into
 *  a date. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// --- The log-gamma function ----------------------------------------------
//
// Lanczos approximation, g = 7, n = 9. Accurate to roughly 15 significant
// digits over the range this file uses (all arguments are positive and
// modest), which is far more than a day-resolution forecast can consume.

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Natural log of the gamma function, for x > 0. */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1−x) = π / sin(πx). Not reached by this module's own
    // callers (every argument is ≥ 0.5) but leaving it out would make the
    // function quietly wrong for anyone who reuses it.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i]! / (z + i);
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

// --- The regularized incomplete beta function ----------------------------
//
// `I_x(a, b)`, evaluated by the modified Lentz continued fraction. This is the
// standard route to a Student-t CDF and it converges in a few dozen
// iterations for every argument the forecast produces.

const FPMIN = 1e-300;
const EPS = 3e-14;
const MAX_ITERATIONS = 300;

/** The continued fraction for `I_x(a, b)`, valid where it converges quickly
 *  (`x < (a+1)/(a+b+2)`); `regularizedIncompleteBeta` handles the swap. */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;
    // Even step.
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    // Odd step.
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/** The regularized incomplete beta function `I_x(a, b)`, for `a, b > 0` and
 *  `x` in [0, 1]. */
export function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  // The fraction converges fast only on one side of the mode; past it, use the
  // symmetry `I_x(a,b) = 1 − I_{1−x}(b,a)`.
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(x, a, b)) / a
    : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

// --- Student's t ----------------------------------------------------------

/** Density of the standard Student-t with `df` degrees of freedom. */
export function studentTPdf(t: number, df: number): number {
  const logDensity =
    logGamma((df + 1) / 2) -
    logGamma(df / 2) -
    0.5 * Math.log(df * Math.PI) -
    ((df + 1) / 2) * Math.log(1 + (t * t) / df);
  return Math.exp(logDensity);
}

/**
 * CDF of the standard Student-t with `df` degrees of freedom, via
 * `P(T ≤ t) = 1 − ½·I_{df/(df+t²)}(df/2, ½)` for t > 0 and the mirror below 0.
 */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

// --- Discrete distributions ----------------------------------------------
//
// The forecast's posterior is ultimately a probability *per calendar day*, so
// once the continuous model has been discretised everything downstream — point
// estimates, credible intervals, the chart — works on a plain array of
// probabilities. These helpers are that vocabulary.

/** A probability mass function over consecutive integers starting at `offset`.
 *  `probabilities[i]` is the mass at the value `offset + i`. */
export type Pmf = {
  offset: number;
  probabilities: number[];
};

/** Scale a mass function so it sums to 1. A distribution with no mass left at
 *  all (every candidate ruled out) returns null — the caller must decide what
 *  an impossible forecast means rather than divide by zero. */
export function normalize(pmf: Pmf): Pmf | null {
  const total = pmf.probabilities.reduce((sum, p) => sum + p, 0);
  if (!(total > 0) || !Number.isFinite(total)) return null;
  return {
    offset: pmf.offset,
    probabilities: pmf.probabilities.map((p) => p / total),
  };
}

/** The value carrying the most mass — the *mode*, and the day a forecast
 *  names. Ties go to the earlier day. */
export function pmfMode(pmf: Pmf): number {
  let best = 0;
  for (let i = 1; i < pmf.probabilities.length; i++) {
    if (pmf.probabilities[i]! > pmf.probabilities[best]!) best = i;
  }
  return pmf.offset + best;
}

/** Expected value. */
export function pmfMean(pmf: Pmf): number {
  return pmf.probabilities.reduce((sum, p, i) => sum + p * (pmf.offset + i), 0);
}

/** Standard deviation. */
export function pmfStdev(pmf: Pmf): number {
  const m = pmfMean(pmf);
  const variance = pmf.probabilities.reduce(
    (sum, p, i) => sum + p * (pmf.offset + i - m) ** 2,
    0,
  );
  return Math.sqrt(Math.max(0, variance));
}

/**
 * The smallest integer whose cumulative mass reaches `q`.
 *
 * Inverting a *discrete* distribution has no exact answer — the CDF steps over
 * the target rather than hitting it — so this returns the first day at or past
 * it, which is the conservative reading for an interval bound.
 */
export function pmfQuantile(pmf: Pmf, q: number): number {
  let cumulative = 0;
  for (let i = 0; i < pmf.probabilities.length; i++) {
    cumulative += pmf.probabilities[i]!;
    if (cumulative >= q) return pmf.offset + i;
  }
  return pmf.offset + pmf.probabilities.length - 1;
}

/**
 * An equal-tailed credible interval at `mass` (0–1): the range leaving
 * `(1−mass)/2` of the probability off each end.
 *
 * Equal-tailed rather than highest-density on purpose. On a calendar the two
 * are nearly identical for the unimodal shape this model produces, and an
 * interval defined by "5% chance it is earlier, 5% chance it is later" is a
 * sentence a person can act on — which a highest-density region is not.
 */
export function credibleInterval(
  pmf: Pmf,
  mass: number,
): { lower: number; upper: number } {
  const tail = (1 - mass) / 2;
  return {
    lower: pmfQuantile(pmf, tail),
    upper: pmfQuantile(pmf, 1 - tail),
  };
}

/** Total mass on values in `[lower, upper]` inclusive. */
export function pmfMassBetween(pmf: Pmf, lower: number, upper: number): number {
  let total = 0;
  for (let i = 0; i < pmf.probabilities.length; i++) {
    const value = pmf.offset + i;
    if (value >= lower && value <= upper) total += pmf.probabilities[i]!;
  }
  return total;
}
