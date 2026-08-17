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
  Filled means the cycle it belongs to has begun, hollow means the cycle is
  itself still a prediction — so everything up to the next expected period is
  solid and everything past it is outlined. Today's number is a size larger than
  the rest, and carries the dot under the row.

It is an estimate from your own reports — not medical advice, and not
contraception.

## Where the percentage comes from

The forecast is a probability distribution over the day your next period starts
(see [the forecast model](../forecast-model.md)). Both questions this screen
asks are questions about that same distribution:

- A day is inside a **period** if a period starts on or before it and runs far
  enough to reach it — so the last day of a predicted period is less certain
  than its first.
- A day is **fertile** if ovulation falls near it, and ovulation is a fixed
  number of days _before_ a start (the luteal phase). So a day is fertile
  exactly when a period starts roughly two weeks after it.

"A period" rather than "the next period", because the model projects the cycles
after it too (see
[the forecast model](../forecast-model.md#the-cycles-after-the-next-one)) — which
is what lets the [Calendar](calendar.md) paint the months after next.

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
and the app claiming certainty is the one thing this line exists to avoid.

The bottom of the scale gets the same guard for the mirror-image reason: a
chance under one percent reads **"<1%"**, not "0%". A floor is a lower bound
everywhere else on the scale, but at the very bottom the digit it prints is
also the number zero — and a day the model gives a small chance is not a day it
has ruled out. A flat "0%" is kept for a probability that genuinely is zero.

The same rules govern every percentage the [Forecast](forecast.md) screen
quotes.

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

## The mark and the word

They answer different questions, and a few cycles out they part company.

The **word** — and the percentage under it — is a call about today: it says
_Period likely_ only when a period is more likely than not to cover the day.
That is the only threshold worth using for a sentence, because below it the
opposite sentence would be the truer one.

The **mark** says where a period is expected to fall. Those are not the same
claim, and far enough ahead only the second one can be made: by the third cycle
out the estimate is spread wider than a period is long, so no single day clears
a half even though the period is certainly coming. A calendar that painted
nothing there would be saying "no period expected", which is worse than saying
roughly when.

So the outline — which has always meant _expected_ rather than _reported_ —
follows the projected periods, and the wording stays exactly as cautious as it
was. Nothing else changes: the percentage beside a projected day is still the
real one, and a day you reported without bleeding is never painted as a period
however confident the projection is.

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
