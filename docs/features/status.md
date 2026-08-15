# Status

The screen the app opens on: what today is, in one word, with the number behind
that word attached to it.

- **The call** — _Fertile_, _Not fertile_, _Period_, or _Period likely_. A day
  you reported bleeding on is a **Period** whatever the model thought; every
  other call comes from the forecast.
- **How sure it is** — _About 84% statistically secure_. Not a rounding of a
  feeling: it is the share of the forecast's probability that actually falls on
  the call above it, so an early history reads low and says so.
- **Cycle day and next period** — the same two lines the
  [Forecast](forecast.md) screen leads with, from the same fit.
- **This week** — three days back, today, and three days ahead, each painted the
  colour its status earns. The same colours the [Calendar](calendar.md) uses.

It is an estimate from your own reports — not medical advice, and not
contraception.

## Where the percentage comes from

The forecast is a probability distribution over the day your next period starts
(see [the forecast model](../forecast-model.md)). Both questions this screen
asks are questions about that same distribution:

- A day is inside the **next period** if the period starts on that day or on one
  of the few days before it — however long your periods usually run.
- A day is **fertile** if ovulation falls near it, and ovulation is a fixed
  number of days _before_ the next start (the luteal phase). So a day is fertile
  exactly when the next period starts roughly two weeks after it.

Adding up the probability of the start days that satisfy either condition gives
the chance that day carries that status. The percentage is that sum. Nothing is
re-estimated and no second model is fitted, which is why the Status screen can
never contradict the Forecast screen.

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
