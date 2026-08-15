# The forecast model

[`cycle.ts`](../src/app/cycle.ts) answers "when is the next period?" with a
single date: the last start plus the typical gap. [That page](cycle.md) explains
it, and it is still what the calendar and the fertile window are drawn from.

This page is about the other answer — the one the Forecast screen's chart draws.
The truth about a future period is a **distribution over days**, not a date, and
[`forecastModel.ts`](../src/app/forecastModel.ts) computes it.

The **simple** and **advanced** views of the Forecast screen read the _same_
posterior. The simple view quotes its median and its 80% interval; the advanced
view draws the whole thing and shows the parameters behind it. Neither is a
rounded-off version of the other, which is the only way both can honestly be
called equally accurate.

## The univariate model: cycle lengths alone

### Log-normal, because cycles are right-skewed

Cycle lengths are not symmetric around their average. A 40-day cycle is far more
common than a 16-day one. A model that is symmetric in days puts probability on
impossible dates and understates the long tail, so the model works in
`ln(days)`, where the distribution is close to symmetric. Everything below
happens on that scale and is converted back at the end.

### A conjugate prior, so the width is honest

The mean and variance of `ln(cycle length)` get a **Normal-Inverse-Gamma**
prior:

```
μ | σ² ~ Normal(μ₀, σ²/κ₀)        μ₀ = ln(28), κ₀ = 1
σ²     ~ Inverse-Gamma(α₀, β₀)    α₀ = 2.5, β₀ = α₀ · 0.11²
```

`κ₀ = 1` makes the prior worth exactly one observed cycle — enough to keep a
first forecast sane, little enough that real data wins immediately. `0.11` on
the log scale is about ±3 days at a 28-day cycle, the between-cycle spread
reported for regularly cycling adults.

The prior is conjugate, so the update is closed form — no sampler, no optimiser,
microseconds on a phone:

```
κₙ = κ₀ + W
μₙ = (κ₀·μ₀ + W·x̄) / κₙ
αₙ = α₀ + W/2
βₙ = β₀ + ½·Σwᵢ(xᵢ − x̄)² + κ₀·W·(x̄ − μ₀)² / (2κₙ)
```

where `xᵢ = ln(lengthᵢ)`, `wᵢ` is that cycle's weight and `W = Σwᵢ`.

The **posterior predictive** is then a Student-t:

```
ln(next cycle) ~ t_2αₙ( μₙ , βₙ(κₙ+1) / (αₙκₙ) )
```

Two things fall out of that for free, and they are the reason for the whole
construction. The degrees of freedom `2αₙ` grow with the history, so a forecast
from two cycles has genuinely fat tails and a genuinely wide interval without
anyone hand-tuning a penalty. And the `(κₙ+1)/κₙ` factor carries the uncertainty
_about_ `μ` into the prediction — dropping it is the classic way to produce
intervals that are too narrow exactly when data is thin.

### Older cycles count for less

Cycles drift with age, stress and life. Each observation is weighted
`0.5^(age in cycles / 6)`, a **six-cycle half-life** — roughly half a year. Long
enough to average out one noisy month, short enough that a real change shows up
within a season. `Σwᵢ` is reported on screen as the _effective sample_: eleven
logged cycles are worth about 6.6.

### A long gap is probably an unlogged cycle

A 58-day gap against a 28-day norm is far more likely to be two unlogged 29-day
cycles than one 58-day cycle. A gap splits into `k` when it is at least 1.75
typical lengths long _and_ `gap/k` lands within 15% of the typical length. Each
recovered cycle carries **half weight**, because the split is an inference and
not an observation.

45 days does not split — one long cycle explains it at least as well, and
inventing two 22-day cycles would corrupt both the centre and the spread.

### Days you already ruled out

Each candidate day is a hypothesis, and a day you reported _with no bleeding_
refutes it. Those days are zeroed and the rest renormalised. This is why the
forecast **sharpens as a cycle runs on** rather than sitting still — every
logged, bloodless day removes a candidate.

A day with **no report at all** stays possible. Not logging is not a claim.

## The multivariate model: what this cycle is telling you

Two further channels of evidence, both optional, both learned from your own
history and nobody else's.

### The shape of a channel

Every channel works the same way, which is what makes a third one cheap:

1. Assign every reported day the number of days from it to the **next observed
   period start** — its _lag_.
2. Lags 0–13 (the luteal phase) build a **profile**; everything else builds the
   **baseline** the profile is contrasted against.
3. At prediction time, each candidate onset day implies a lag for every recent
   report. Score those reports under the profile against the baseline, and
   reweight the day by the likelihood ratio.

Days after the last observed start have no known lag and are used for neither.

### Mood swings

Premenstrual mood symptoms emerge one to two weeks before bleeding and rise
toward it, which makes them a leading indicator rather than a coincidence. The
profile is `P(mood swings reported | lag)`, a Bernoulli rate per lag, against
the rate outside the window:

```
ln LR = Σ  ln( rate[lag] / baseline )        when swings were reported
        Σ  ln( (1 − rate[lag]) / (1 − baseline) )   when they were not
```

A quiet run is evidence _against_ an imminent period just as a rough one is
evidence for it.

### Waking temperature

The biphasic shift is the strongest signal available: temperature steps up by
roughly 0.3 °C after ovulation, holds through the luteal phase, and falls again
as a period arrives. Knowing whether that step has happened pins down where in
the cycle you are.

Readings above 37.50 °C are dropped before any of this — see
[fever](features/daily-report.md#fever). A febrile morning is several times the
size of the step this channel exists to read, so one of them left in would both
fake a shift on its own day and drag the rolling median every reading around it
is measured against. It stays in the document and on the Report screen; it is
simply not evidence about a cycle.

The rest are used as **deviations from a rolling median** over ±45 days, never
as absolute temperatures. Absolute readings differ by person, by thermometer and
by how warm the bedroom was in February; centring leaves only the within-person
contrast the model is looking for, and a new thermometer that reads a degree
high changes nothing.

The profile is a mean deviation per lag with one pooled spread, and the ratio of
two Normals sharing that spread collapses to a difference of squares:

```
ln LR = Σ [ (dev − baseline)² − (dev − mean[lag])² ] / 2σ²
```

### Why the evidence is deliberately discounted

The likelihood above treats days as conditionally independent. They are not — a
rough stretch is one episode, not five, and a luteal plateau is one
physiological state producing a fortnight of near-identical readings. Rather
than pretend otherwise, each channel's log-likelihood ratio is **tempered** by a
fixed exponent (0.5 for mood, 0.35 for temperature) and **clamped** to ±3.
Channels are clamped before they are summed, and the total is clamped again at
±4.5.

The result: this cycle's reports can move the date by a few days, and can never
overrule the cycle history. Under-claiming is the right failure mode when the
alternative is over-counting correlated observations.

### It stays silent until it has something to say

A channel needs reported days in both the window and the baseline before it is
used at all — 20 for mood, 12 for temperature. Below that, per-lag rates are
shrunk almost entirely back to the overall rate by a pseudo-count, the profile
comes out flat, and a flat profile changes nothing. **With too little history,
the multivariate model reduces exactly to the univariate one**, which is why it
is the default: there is no early-days penalty to opt out of.

## From a distribution to a date

The continuous predictive is discretised into one probability per whole day, by
integrating the mass between `d − ½` and `d + ½` days. Integrating the bin
rather than sampling the density at its centre keeps the total honest in the
skewed tail, where the two differ noticeably.

The screen names the **median** — the day with even odds either side — not the
mode. Two reasons. The distribution is right-skewed, so its peak sits a day
below its middle, and naming the peak would put the headline a day earlier than
the "typical cycle length" quoted beside it. And the median is the point
estimate that minimises absolute error, which is the error the backtest reports
and the error a person actually experiences.

Intervals are **equal-tailed**: the 80% interval leaves 10% of the probability
off each end. On a calendar this is nearly identical to the highest-density
region for the shape this model produces, and "10% chance it is earlier, 10%
chance it is later" is a sentence someone can act on.

## Confidence, from the interval itself

The label above the forecast is derived from the width of the 80% interval and
the effective sample, so it cannot disagree with the band drawn next to it:

| Label               | When                                           |
| ------------------- | ---------------------------------------------- |
| `No prediction yet` | No complete cycle observed                     |
| `Rough estimate`    | Anything wider or thinner than the two below   |
| `Fair estimate`     | 80% interval ≤ 11 days, effective sample ≥ 2.5 |
| `Steady pattern`    | 80% interval ≤ 7 days, effective sample ≥ 5    |

A "steady pattern" label above a nine-day-wide band is the kind of contradiction
that teaches people to ignore labels.

## The backtest

The advanced view's **track record** is a rolling-origin backtest. From the
fifth cycle on, each one is re-predicted from only the cycles before it. The
evaluation date is chosen from past data alone — the previous start plus the
then-known median gap, less five days — so no fold can see the onset it is
scored against. The realised lead therefore varies, which is the price of not
peeking.

Two numbers come out, and the second matters more:

- **Average miss** — mean absolute error in days, shown next to what the plain
  "last start + median gap" rule would have missed by.
- **Coverage** — how often the 80% and 95% bands actually contained the answer.
  A model whose 80% band is right 80% of the time is calibrated; one that
  manages 40% is drawing confident nonsense, and this is the only place that
  would show up.

## What it still does not do

- It does not detect ovulation. The temperature channel reads _whether the shift
  has happened_; the "ovulation" date on the Forecast screen is still
  `nextStart − 14 days` and nothing more.
- It does not use population data. Every profile is learned from your own
  reports; the only outside numbers are the prior's 28 days and ±3, which one
  observed cycle starts overriding.
- It does not know about pregnancy, perimenopause, hormonal contraception,
  PCOS, or any condition that changes what a cycle is.
- **It is not contraception**, and it is not a medical device.

## Reading the code

| Concern                                      | Where                                               |
| -------------------------------------------- | --------------------------------------------------- |
| Student-t, incomplete beta, weighted moments | [`stats.ts`](../src/app/stats.ts)                   |
| The model itself                             | [`forecastModel.ts`](../src/app/forecastModel.ts)   |
| The chart                                    | [`ForecastChart.tsx`](../src/app/ForecastChart.tsx) |
| Temperature units and parsing                | [`temperature.ts`](../src/app/temperature.ts)       |

The numerics are pinned against published values in
[`tests/stats_test.ts`](../tests/stats_test.ts); the model's behaviour, and its
interval coverage, in
[`tests/forecastModel_test.ts`](../tests/forecastModel_test.ts).
