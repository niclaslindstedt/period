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

### One odd cycle is not a new pattern

Cycle length is not one distribution. The epidemiology literature has modelled
it since Harlow & Zeger (1991) as a **mixture**: a symmetric cluster of
ordinary ovulatory cycles, plus a long-tailed minority of stretched ones — a
cycle where ovulation came late or not at all. A single-component fit pays for
ignoring that in one specific way: one 45-day cycle inflates the fitted spread,
and every forecast for the next year is wider than the actual pattern deserves.

So the fit is a small EM over exactly that mixture. Each observed cycle gets a
_responsibility_ — the probability it belongs to the standard component, judged
under the current fit — and the conjugate update is re-run with each weight
multiplied by it, five closed-form passes in all. An ordinary cycle keeps its
weight. A stretched one keeps a sliver, and what it mostly informs is the
**share** of nonstandard cycles, which the predictive keeps as a wide second
component. The odd cycle is not thrown away; it is filed where it belongs, and
the chance of _another_ one stays priced into the tail of every interval.

Two properties make this safe rather than merely aggressive:

- **A genuinely erratic history downweights nothing.** When every cycle
  disagrees, the fitted spread is wide, no single cycle stands out against it,
  and every responsibility stays near one — the intervals stay honestly wide.
  Robustness only engages when there is a tight pattern for an outlier to stand
  out from, which is exactly when protecting the pattern matters.
- **The wide component survives into the predictive.** The 80% band barely
  notices it; the 95% band keeps a fatter right tail than the cleaned spread
  alone would draw, which is the honest reading of a history that has already
  produced one stretched cycle.

The advanced view marks a downweighted cycle the same way it marks an imputed
one, with the weight the fit actually used.

### Days you already ruled out

Each candidate day is a hypothesis, and a day you reported _with no bleeding_
refutes it. Those days are zeroed and the rest renormalised. This is why the
forecast **sharpens as a cycle runs on** rather than sitting still — every
logged, bloodless day removes a candidate.

A day with **no report at all** stays possible. Not logging is not a claim.

## The multivariate model: what this cycle is telling you

Five further channels of evidence, all optional, all read against your own
history and nobody else's.

They come in two families, and the split is what makes five worth asking rather
than two:

- **Premenstrual** — mood swings and waking temperature. They speak about the
  fortnight before a period.
- **Ovulatory** — lust, sex and the fertility test. They speak about ovulation,
  which is a luteal phase _earlier_ — the half of the cycle the first two are
  silent on. They matter most in the middle of a cycle, while the forecast still
  has a fortnight of spread left to sharpen.

### The shape of a channel

Every channel works the same way, which is what makes a further one cheap:

1. Assign every answered day the number of days from it to the **next observed
   period start** — its _lag_.
2. Lags inside the channel's **window** build a **profile**; everything outside
   it builds the **baseline** the profile is contrasted against.
3. At prediction time, each candidate onset day implies a lag for every recent
   report. Score those reports under the profile against the baseline, and
   reweight the day by the likelihood ratio.

The window is 14 days for the premenstrual channels and 21 for the ovulatory
ones. Twenty-one is not a round number: ovulation sits about 14 days before an
onset, so a 14-day window would put the thing these channels are about exactly
on its own edge and see none of the days around it. Twenty-one covers ovulation
and the fertile days either side while still leaving the first week of a typical
cycle outside — and the contrast against that week, when lust is lowest and
nobody is testing, is what the profile measures.

Days after the last observed start have no known lag and are used for neither.
Neither are days the question was not answered on: a morning with no fertility
test is not a negative, it is no observation at all.

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

### The thermal shift as an anchor

The profile above reads the _plateau_ — a run of warm mornings favours
candidates that put those mornings in the fortnight before an onset. It cannot
date the event the plateau begins with, and that event is worth dating more
than anything else in the cycle.

The reason is where a cycle's variability lives. In the largest real-world
dataset published (612,000 ovulatory cycles from the Natural Cycles app), the
follicular phase spans 10–30 days across its 95% interval while the luteal
phase spans 7–17: nearly all of the uncertainty about the next onset is
uncertainty about **when ovulation happens**, and almost none about what
follows it. The day the temperature steps up is the end of the variable half of
the cycle, observed directly, this cycle.

So the model runs the classic charting rule — **three over six** — on the
centred readings of the current cycle: the coolest of three consecutive
readings must clear the warmest of the six before them by 0.15 °C, with the
three highs within four days of each other. When a qualifying rise is found,
its first morning anchors the onset one lead away, as a Gaussian
log-likelihood ratio over the gap: positive within the band a luteal phase
plausibly spans, negative beyond it, and firmly against any candidate on or
before the shift day itself — bleeding does not precede the plateau that ends
in it.

The lead is learned exactly the way the fertility test's is: it starts at the
luteal phase from **Settings → Cycle** less a day (the first high morning
follows ovulation by about one) and is pulled toward the gaps the reader's own
detected shifts were actually followed by, at two shifts' worth of inertia.
That is what lets the anchor work in the very first cycle it is possible to
detect a shift in — a learned profile would need a season first.

Like every channel it is tempered and clamped, for a reason specific to it: the
same mornings also feed the plateau profile, and the two must not count the
same evidence twice at full strength. The shared ceiling on the combined
evidence is what keeps the overlap honest.

### Lust and sex

Sex drive rises toward ovulation. Both channels are Bernoulli rates per lag —
identical machinery to mood swings, over the longer window — so the only thing
that differs is where the hump lands: in the middle of the chart rather than at
its right-hand end.

Neither is assumed to work. `sex` in particular is confounded (a weekend is not
a hormone), and the same shrinkage that keeps a two-cycle mood profile flat is
what keeps a channel that does not track the cycle flat however long it is
logged. A flat profile changes nothing, so a channel that predicts nothing costs
nothing — which is exactly why it is safe to ask.

### Fertility tests

The one channel whose profile is **constructed** rather than learned, and the
reason is what a strip is: an assay for one hormone with a known relationship to
one event. The shape of `rate[lag]` is not a personal idiosyncrasy waiting to be
discovered — it is a bump on the days a surge could fall on. The only genuinely
personal number in it is where that bump sits: the **lead** from a positive test
to the next period.

So the lead is what gets learned. It starts at the luteal phase from
**Settings → Cycle** plus a day (a strip turns positive roughly a day before
ovulation) and is pulled toward whatever your own positives have actually been
followed by, at two tests' worth of inertia. That is what lets a strip help on
the first cycle you use one; a learned profile would need a season of tests
before it said anything, and a season of tests is not why anyone buys them.

The bump is a Normal density over the lag, scaled by the chance of catching a
surge at all (0.75) and sitting on a small false-positive floor. **It is a
distribution, not a level** — the whole bump is worth about one caught surge,
not one per lag inside it. A bump that peaked at the detection rate would be
claiming three or four positive strips a cycle, and would then read the entirely
expected negatives on the days either side of a real positive as evidence
against it.

Because the baseline sits above the floor, a positive at the wrong distance from
a candidate counts _against_ that candidate rather than merely failing to count
for it.

### Why the evidence is deliberately discounted

The likelihood above treats days as conditionally independent. They are not — a
rough stretch is one episode, not five, and a luteal plateau is one
physiological state producing a fortnight of near-identical readings. Rather
than pretend otherwise, each channel's log-likelihood ratio is **tempered** by a
fixed exponent and **clamped** to ±3. Channels are clamped before they are
summed, and the total is clamped again at ±4.5.

| Channel             | Temper | Why                                                             |
| ------------------- | ------ | --------------------------------------------------------------- |
| Mood swings         | 0.5    | A rough stretch is one episode reported many times              |
| Lust, sex           | 0.35   | Correlated within themselves _and_ with each other              |
| Fertility test      | 0.8    | One measurement of one event; little left to double-count       |
| Temperature plateau | 0.35   | A luteal plateau is one state producing a fortnight of data     |
| Thermal shift       | 0.8    | One dated event — but read off the same mornings as the plateau |

The result: this cycle's reports can move the date by a few days, and can never
overrule the cycle history. Five channels that all agree still cannot break the
±4.5 ceiling. Under-claiming is the right failure mode when the alternative is
over-counting correlated observations.

### It stays silent until it has something to say

A learned channel needs answered days in both the window and the baseline before
it is used at all — 20 for mood, lust and sex, 12 for temperature. Below that,
per-lag rates are shrunk almost entirely back to the overall rate by a
pseudo-count, the profile comes out flat, and a flat profile changes nothing.

The fertility test and the thermal shift are the exceptions, and only because
their profiles are not estimated from a sample: each needs an event to read — a
strip taken, a rise sustained — not a history to learn from. Until one is
logged the channel is absent entirely, and the advanced view says whether this
cycle's rise has been seen yet.

**With too little history, the multivariate model reduces exactly to the
univariate one**, which is why it is the default: there is no early-days penalty
to opt out of.

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

## How long an episode lasts

Everything above is about the day the next period **starts**. A calendar paints
the days a period **covers**, and the two are only the same question if you also
know how long an episode runs — so a second, much smaller distribution is fitted
over episode lengths, from the episodes in your history that have finished.

It answers both of the coverage questions the screens ask:

- **How far the next period reaches.** Each candidate start day contributes its
  own probability times the chance an episode lasts at least that many days. The
  painted window therefore has a soft trailing edge: the fifth day of a
  predicted period is less certain than its second, which a fixed "five days
  from the start" could not express.
- **How much longer the period running right now will last.** Its start is
  observed, and so is the fact that it has already reached day _k_ — so the
  answer is the length distribution conditioned on having got that far.

The second one is why the days after `Cycle day 1` are coloured at all. The
start-day distribution has nothing to say about them: it is busy describing an
onset four weeks out.

Three details make it behave:

**The episode in progress is left out of its own fit.** Its length is
_censored_ — on the first morning of a period it reads as "one day". Averaging
that in is how a tracker ends up predicting one-day periods on the strength of a
period that has barely started.

**Observed lengths are smoothed by a day either way.** Four episodes of five
days would otherwise say a sixth day is impossible, and the calendar would stop
painting mid-period on the first cycle that runs long.

**Nothing is ruled out entirely.** A flat 2% is spread across the whole support,
so an episode that outlasts everything on record still has a defined answer to
"will this continue tomorrow?" rather than a division by zero. In practice it
keeps its colour a few more days and then fades.

A reported day with no bleeding is excluded outright, on the same rule that
rules out impossible start days: a logged "no" is a fact, and painting a period
over it would be the screen contradicting the report it was given. A day with no
report at all stays possible — not logging is not the same claim as logging a
no.

## The cycles after the next one

The [calendar](features/calendar.md) is paged, so it asks about months the next
period is not in. The answer is the same model asked again: the second onset is
the first plus another cycle length, the third is the second plus another, and
both terms are distributions already fitted above. Each further onset is their
**convolution** — the distribution of a sum of independent quantities — so
nothing new is estimated.

That is the point of doing it this way rather than stamping the typical length
forward from the predicted date. Adding an uncertain length to an uncertain date
gives a date that is less certain than either, and the variances add: a
projection inherits the uncertainty it was built from instead of repeating the
first prediction at full confidence.

The widening is also what ends it. The projection stops at the first onset whose
80% interval is wider than half a typical cycle, because that is where "around
here" stops saying more than "some time that month" — at a whole cycle the
intervals of consecutive onsets would touch, and the calendar would be shading a
stripe of uncertainty rather than marking a period. A steady history therefore
projects three or four cycles out and an erratic one projects none past the next
period, which is the right answer in both cases and not a setting either way.

Two summaries come out of it, and the screens use both. The merged per-day
distribution — the chance that _a_ period starts on a given day — is what the
percentages are read from, so a fertile day two cycles out quotes a real number.
And each cycle's **median start** is the day that period is named by, the first
of them being the date the headline quotes. Far enough ahead no single day is
more likely than not a period day, and a calendar painting only the days that
clear a half would answer "when is my period in September?" with an empty month.
So the mark follows the medians and the wording keeps the stricter rule — see
[the Status screen](features/status.md#the-mark-and-the-word).

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

## Where this sits in the literature

The model is a deliberately closed-form assembly of the pieces the cycle
literature agrees on, chosen so the whole fit runs in microseconds on a phone
with no sampler and no optimiser:

- **The mixture** is Harlow & Zeger's (1991) standard / nonstandard split, the
  same structure later Bayesian work (Guo et al. 2006; the hierarchical
  changepoint models of Huang et al.) builds on.
- **The recency weighting** is the cheap stand-in for the state-space drift of
  Bortot et al. (2010) — cycles change with age and life, and the six-cycle
  half-life is what lets the level move without a latent process to filter.
- **The luteal anchor** rests on the largest real-world dataset published (Bull
  et al. 2019, 612k cycles): cycle variability is follicular, so dating the
  thermal shift — the classic three-over-six rule, as in BBT-based forecasting
  work (Fukaya et al. 2017) — converts a variable-cycle problem into a
  steady-luteal one for the remainder of the cycle.
- **Skipped-cycle repair** addresses the self-tracking artifact that Li,
  Urteaga et al. (2022) model hierarchically: a doubled gap is more likely an
  unlogged cycle than a doubled cycle.

What the app deliberately does not import from that literature is **population
pooling**: the hierarchical models above share strength across users, which
needs a server and other people's cycles. Here every parameter beyond the
textbook priors is learned from the reader's own reports, on the reader's own
device.

## What it still does not do

- It does not detect ovulation prospectively. The thermal shift is only
  detectable a few mornings _after_ ovulation — that is enough to anchor the
  next onset, but the "ovulation" date and fertile window on the Forecast
  screen are still `nextStart − luteal phase` and nothing more.
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
