# Calendar

The month view — the whole cycle at a glance, past and ahead. Page either way
with the arrows, or with `PageUp` / `PageDown` from the keyboard.

Each day's number sits on a coloured circle that says what kind of day it is:

| Circle       | Meaning                                                      |
| ------------ | ------------------------------------------------------------ |
| Filled rose  | **Reported bleeding** — a day you logged                     |
| Rose outline | **Predicted period** — a day a period is likely to cover     |
| Filled blue  | **Fertile window** — a day around the projected ovulation    |
| Faint grey   | **Reported, no bleeding** — you checked in, nothing happened |
| No circle    | Nothing logged, and nothing predicted                        |

The colour is behind the number rather than a mark under it, so a month reads as
bands of colour at a glance and a cell costs one row of height instead of two.

Today's number keeps its accent colour and weight whatever circle it is on.

## Where the colours come from

The same place the [Status](status.md) screen's week row does — one call per
day, out of the one forecast (see [that screen's explanation](status.md#where-the-percentage-comes-from)).
A day cannot be a different colour on the two screens, and neither can disagree
with the date the [Forecast](forecast.md) screen names.

What actually happened outranks what was predicted: a day you reported bleeding
on is filled rose even if the model expected it elsewhere.

"Predicted period" covers two things: the days the **next** period is likely to
reach, and — while a period is under way — the rest of the one you are having.
Both come out of the same fit, so the outlined days run on from the filled ones
instead of stopping at the last day you happened to log. See
[the Status screen](status.md#the-period-you-are-having-right-now).

Turning off **Show the fertile window** in Settings removes the blue entirely,
legend included.

## Before there is any history

Until a period is logged there is no forecast, so only the days you have
reported are coloured — the predicted and fertile circles fill in around them as
soon as there is a cycle to project.
