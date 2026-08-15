# Forecast

Where you are in your cycle, and what is coming.

- **Cycle day** — how far into the current cycle today is.
- **Next period** — the predicted first day, how far off it is, and the range it
  is most likely to fall in. A period that has passed its predicted date without
  any bleeding logged reads as _late_, not as a new cycle.
- **The chart** — how likely each day is to be the one the next period starts,
  with the credible bands drawn behind it.
- **Fertile window** — the days around the projected ovulation, with the
  ovulation date itself named. Turn it off in Settings if you track only your
  period.

The month grid that used to close this screen is now the
[Calendar](calendar.md) tab, and the one-word "what is today" summary is the
[Status](status.md) tab. All three read the same fit, so none of them can
contradict another.

Every forecast carries a **confidence label** — from _No prediction yet_ through
_Rough estimate_ to _Steady pattern_ — because a date derived from two cycles
and one derived from twelve look identical otherwise.

It is an estimate from your own reports — not medical advice, and not
contraception.

## Reading the chart

Each column is one day, and its height is the chance the next period starts on
that day. The shaded bands behind them are the ranges the period falls in with
50%, 80% and 95% probability — the darkest band is the narrowest and the least
certain to contain the answer, the palest is the widest and the most certain.

A dashed line marks today. A short grey mark on the baseline means a day is
**ruled out**: you reported it with no bleeding, so it cannot be the first day.
This is why the forecast tightens as a cycle runs on.

Move the pointer across the chart — or focus it and use the left and right arrow
keys — and the row above it reads out that day: the chance it starts then, and
the chance it has started by then. With nothing under the pointer the row shows
the day the forecast names.

Four chips underneath change how it is drawn, and nothing else:

| Chip                     | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| **Columns** / **Curve**  | One bar per day, or the shape they trace                                    |
| **Per day** / **By day** | The chance for each day, or the chance it has started by each day           |
| **Bands**                | Show or hide the 50 / 80 / 95% credible bands                               |
| **Compare**              | Overlay what the cycle history alone predicted, before this cycle's reports |

**Compare** is the interesting one: the dashed line is the forecast without this
cycle's mood swings and temperatures, so the gap between the two is exactly what
today's reports changed.

## Simple and advanced

The **Detail** setting (in **Settings → Forecast**) switches between two views
of the same forecast.

**Simple** names the date, the range around it, and the chance it lands within a
week. That is what the screen is for, and most people never need more.

**Advanced** adds the workings:

- **The model** — the typical cycle length it fitted, the predictive spread, the
  effective sample size (older cycles count for less), the degrees of freedom,
  all three credible intervals as dates, and every cycle length the fit was made
  from with its weight.
- **Your mood pattern** — how often you reported mood swings at each number of
  days before a period started, against the rate for the rest of the cycle.
- **Your temperature pattern** — how far above the rest of your cycle your
  waking temperature sat at each of those lags, and the size of the rise after
  ovulation.
- **Track record** — each of your past cycles re-predicted from only the cycles
  before it, reporting the average miss (next to what a plain average would have
  missed by) and how often the 80% and 95% bands actually held.

**Both views show the same prediction.** Advanced does not run a different or
better model — it shows the one already behind the simple view.

## What the forecast is based on

The **Based on** setting (also in **Settings → Forecast**) chooses what the
model may read.

- **Cycles** — the gaps between your period starts, and nothing else.
- **Cycles + reports** — that, plus this cycle's mood swings and waking
  temperatures. Both cluster in the days before a period, so they say something
  about when the next one is due.

Cycles + reports is the default. It falls back to the cycles-only forecast on
its own until there are enough reported days to learn your pattern, so there is
no early-days cost to leaving it on — the advanced view says plainly when a
pattern is still too thin to use.

For the arithmetic behind all of it, see
[the forecast model](../forecast-model.md); for the period and phase
derivation, [how the numbers are worked out](../cycle.md).
