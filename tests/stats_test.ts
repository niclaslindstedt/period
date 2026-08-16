// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  convolve,
  credibleInterval,
  logGamma,
  median,
  normalize,
  pmfMassBetween,
  pmfMean,
  pmfMode,
  pmfQuantile,
  pmfStdev,
  regularizedIncompleteBeta,
  studentTCdf,
  studentTPdf,
  totalWeight,
  weightedMean,
  weightedSumSquares,
  type Pmf,
} from "../src/app/stats.ts";

// These functions have published right answers, which is the point of them
// living in their own module: the assertions below are textbook values, not a
// snapshot of whatever the implementation produced first. If the forecast ever
// looks wrong, this file tells you whether the arithmetic or the modelling is
// at fault.

describe("logGamma", () => {
  it("matches the factorial identity Γ(n) = (n−1)!", () => {
    expect(logGamma(1)).toBeCloseTo(0, 12);
    expect(logGamma(2)).toBeCloseTo(0, 12);
    expect(logGamma(3)).toBeCloseTo(Math.log(2), 12);
    expect(logGamma(6)).toBeCloseTo(Math.log(120), 10);
  });

  it("matches Γ(½) = √π", () => {
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
  });
});

describe("regularizedIncompleteBeta", () => {
  it("reduces to the identity when a = b = 1", () => {
    // I_x(1,1) = x, because Beta(1,1) is the uniform distribution.
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(regularizedIncompleteBeta(x, 1, 1)).toBeCloseTo(x, 10);
    }
  });

  it("is symmetric about ½ when a = b", () => {
    expect(regularizedIncompleteBeta(0.5, 3, 3)).toBeCloseTo(0.5, 10);
    expect(regularizedIncompleteBeta(0.3, 4, 4)).toBeCloseTo(
      1 - regularizedIncompleteBeta(0.7, 4, 4),
      10,
    );
  });

  it("pins the endpoints", () => {
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
  });
});

describe("studentTCdf", () => {
  it("is a half at the median for every df", () => {
    for (const df of [1, 2, 5, 30, 1000]) {
      expect(studentTCdf(0, df)).toBeCloseTo(0.5, 12);
    }
  });

  it("matches the Cauchy closed form at df = 1", () => {
    // P(T ≤ t) = ½ + atan(t)/π.
    for (const t of [-2, -0.5, 0.5, 1, 3]) {
      expect(studentTCdf(t, 1)).toBeCloseTo(0.5 + Math.atan(t) / Math.PI, 10);
    }
  });

  it("reproduces the published critical values", () => {
    // One-sided 95% and two-sided 95% points from a t table.
    expect(studentTCdf(2.015, 5)).toBeCloseTo(0.95, 4);
    expect(studentTCdf(1.725, 20)).toBeCloseTo(0.95, 4);
    expect(studentTCdf(2.228, 10)).toBeCloseTo(0.975, 4);
    expect(studentTCdf(2.042, 30)).toBeCloseTo(0.975, 4);
    expect(studentTCdf(4.303, 2)).toBeCloseTo(0.975, 4);
  });

  it("approaches the normal as df grows", () => {
    // Φ(1.96) = 0.975.
    expect(studentTCdf(1.96, 1_000_000)).toBeCloseTo(0.975, 5);
  });

  it("is symmetric", () => {
    expect(studentTCdf(-1.3, 7)).toBeCloseTo(1 - studentTCdf(1.3, 7), 12);
  });
});

describe("studentTPdf", () => {
  it("matches the Cauchy density at df = 1", () => {
    expect(studentTPdf(0, 1)).toBeCloseTo(1 / Math.PI, 12);
    expect(studentTPdf(1, 1)).toBeCloseTo(1 / (2 * Math.PI), 12);
  });

  it("integrates (crudely) to one", () => {
    const step = 0.01;
    let area = 0;
    for (let t = -40; t <= 40; t += step) area += studentTPdf(t, 4) * step;
    expect(area).toBeCloseTo(1, 3);
  });
});

describe("weighted moments", () => {
  it("collapses to the unweighted mean at equal weights", () => {
    const items = [2, 4, 6].map((value) => ({ value, weight: 1 }));
    expect(weightedMean(items)).toBeCloseTo(4, 12);
    expect(totalWeight(items)).toBe(3);
    // Σ(x−x̄)² = 4 + 0 + 4.
    expect(weightedSumSquares(items)).toBeCloseTo(8, 12);
  });

  it("lets a heavier observation pull the mean", () => {
    const items = [
      { value: 0, weight: 1 },
      { value: 10, weight: 3 },
    ];
    expect(weightedMean(items)).toBeCloseTo(7.5, 12);
  });

  it("returns zero rather than NaN for an empty set", () => {
    expect(weightedMean([])).toBe(0);
    expect(totalWeight([])).toBe(0);
  });
});

describe("median", () => {
  it("averages the middle pair for an even count", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("takes the middle value for an odd count", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("has no answer for an empty list", () => {
    expect(median([])).toBeNull();
  });
});

describe("Pmf helpers", () => {
  // A small asymmetric distribution over the days 10..14.
  const pmf = normalize({
    offset: 10,
    probabilities: [1, 2, 4, 2, 1],
  })!;

  it("normalises to one", () => {
    const total = pmf.probabilities.reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("refuses to normalise a distribution with no mass", () => {
    expect(normalize({ offset: 0, probabilities: [0, 0, 0] })).toBeNull();
  });

  it("finds the mode, mean and spread", () => {
    expect(pmfMode(pmf)).toBe(12);
    expect(pmfMean(pmf)).toBeCloseTo(12, 12);
    // Variance = (2·1·4 + 2·2·1)/10 = 1.2.
    expect(pmfStdev(pmf)).toBeCloseTo(Math.sqrt(1.2), 12);
  });

  it("takes the first day whose cumulative mass reaches the quantile", () => {
    // Cumulative: .1 .3 .7 .9 1.0 over days 10..14.
    expect(pmfQuantile(pmf, 0.05)).toBe(10);
    expect(pmfQuantile(pmf, 0.5)).toBe(12);
    expect(pmfQuantile(pmf, 0.95)).toBe(14);
  });

  it("builds equal-tailed credible intervals", () => {
    // 80% leaves 10% off each end: lower is the first day reaching .1 (day
    // 10), upper the first reaching .9 (day 13).
    expect(credibleInterval(pmf, 0.8)).toEqual({ lower: 10, upper: 13 });
  });

  it("sums the mass over a day range", () => {
    expect(pmfMassBetween(pmf, 11, 13)).toBeCloseTo(0.8, 12);
    expect(pmfMassBetween(pmf, 0, 100)).toBeCloseTo(1, 12);
    expect(pmfMassBetween(pmf, 20, 30)).toBe(0);
  });
});

describe("convolve", () => {
  it("adds the offsets and multiplies the masses out", () => {
    // A fair coin over {0,1} added to a fair coin over {10,11} is the
    // triangular {10:¼, 11:½, 12:¼}.
    const sum = convolve(
      { offset: 0, probabilities: [0.5, 0.5] },
      { offset: 10, probabilities: [0.5, 0.5] },
    );
    expect(sum.offset).toBe(10);
    expect(sum.probabilities).toEqual([0.25, 0.5, 0.25]);
  });

  it("keeps the total mass and adds the means and the variances", () => {
    const a: Pmf = { offset: 3, probabilities: [0.2, 0.5, 0.3] };
    const b: Pmf = { offset: 25, probabilities: [0.1, 0.4, 0.4, 0.1] };
    const sum = convolve(a, b);
    expect(sum.probabilities.reduce((t, p) => t + p, 0)).toBeCloseTo(1, 12);
    expect(pmfMean(sum)).toBeCloseTo(pmfMean(a) + pmfMean(b), 12);
    // Independent variables: variances add, so the spread grows — which is the
    // whole reason a projected cycle is less certain than the one before it.
    expect(pmfStdev(sum) ** 2).toBeCloseTo(
      pmfStdev(a) ** 2 + pmfStdev(b) ** 2,
      12,
    );
    expect(pmfStdev(sum)).toBeGreaterThan(pmfStdev(a));
  });

  it("survives an empty distribution rather than producing a negative length", () => {
    const empty = convolve(
      { offset: 1, probabilities: [] },
      { offset: 10, probabilities: [1] },
    );
    expect(empty.probabilities).toEqual([]);
  });
});
