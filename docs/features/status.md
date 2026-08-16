# Status

The screen the app opens on once there is anything to say: what today is, in
one word, with the number behind that word attached to it. Before the first
report is saved there is nothing to derive, so the app opens on
[Daily report](daily-report.md) instead.

- **The call** — _Fertile_, _Not fertile_, _Period_, or _Period likely_. A day
  you reported bleeding on is a **Period** whatever the model thought; every
  other call comes from the forecast.
- **How sure it is** — _About 84% statistically secure_. Not a rounding of a
  feeling: it is the share of the forecast's probability that actually falls on
  the call above it, so an early history reads low and says so.
- **Cycle day and next period** — the same two lines the
  [Forecast](forecast.md) screen leads with, from the same fit.
- **This week** — three days back, today, and three days ahead, each painted the
  colour its status earns. The same colours and the same shapes the
  [Calendar](calendar.md) uses: a period or a fertile window is one stroke
  across the days it covers, capped at its ends and cut straight where it
  carries on past the edge of the week; a day you reported nothing on is a dot.

It is an estimate from your own reports — not medical advice, and not
contraception.

## Where the percentage comes from

The forecast is a probability distribution over the day your next period starts
(see [the forecast model](../forecast-model.md)). Both questions this screen
asks are questions about that same distribution:

- A day is inside the **next period** if the period starts on or before it and
  the period runs far enough to reach it — so the last day of a predicted period
  is less certain than its first.
- A day is **fertile** if ovulation falls near it, and ovulation is a fixed
  number of days _before_ the next start (the luteal phase). So a day is fertile
  exactly when the next period starts roughly two weeks after it.

Adding up the probability of the start days that satisfy either condition gives
the chance that day carries that status. The percentage is that sum. Nothing is
re-estimated and no second model is fitted, which is why the Status screen can
never contradict the Forecast screen.

The figure is a **whole percent, floored, and never past 99%**. Whole because a
decimal would claim a resolution a fit over a few dozen cycles does not have —
the tenth of a point would move if one report from last spring were corrected.
Floored so the number is one the arithmetic can back: 63% means at least 63,
and the figure can only ever understate. Capped at 99% because flooring leaves
exactly one way to overstate — a genuine 99.6% would print as a flat "100%",
and the app claiming certainty is the one thing this line exists to avoid. The
same rule governs every percentage the [Forecast](forecast.md) screen quotes.

## The period you are having right now

There is a third case, and it is the days-ahead half of the week row on the
morning it matters most. Once you log the first bleeding day of a period, the
forecast has already moved on to the _next_ onset four weeks out — so on its own
it says nothing about tomorrow, and the rest of the period you are currently
having would read as empty calendar.

So the days after **Cycle day 1** are answered from a different question: given a
period that started on a known day and has been bleeding for a few days already,
how likely is it to still be going? That comes from how long your own periods
have run in the past (see
[the forecast model](../forecast-model.md#how-long-an-episode-lasts)), and it
fades out over the following days rather than stopping dead — the fourth day of
a five-day period is nearly certain, the eighth is not.

A day you reported _without_ bleeding is never painted this way. A logged "no"
is a fact, and the screen does not argue with a report you gave it.

"Not fertile" quotes the complement — the chance the fertile window does _not_
cover today.

## With the fertile window turned off

Settings → Cycle → **Show the fertile window** removes the fertility estimate
from the app. The Status screen then never says _Fertile_ or _Not fertile_; a
quiet day reads **No period expected** instead, and the week row drops the
fertile colour along with the legend entry for it. A negative phrasing of a
fertility estimate is still a fertility estimate, so the screen does not fall
back on one.

## Before there is any history

With no bleeding logged there is nothing to fit and nothing honest to put a
percentage on, so the screen says so and points at the daily report. One period
is enough for a rough call; a few make it a good one.
