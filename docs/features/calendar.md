# Calendar

The month view — the whole cycle at a glance, past and ahead. Page either way
with the arrows, or with `PageUp` / `PageDown` from the keyboard.

The grid is a fixed six rows and it is the only thing on the screen, so it sits
centred in the height rather than at the top of it — on a tall phone that is the
difference between the month being under your thumb and it being under the
status bar.

Each day's number sits on a coloured mark that says what kind of day it is:

| Mark               | Meaning                                                      |
| ------------------ | ------------------------------------------------------------ |
| Filled rose stroke | **Reported bleeding** — the days you logged                  |
| Rose outline       | **Predicted period** — where the period is expected to reach |
| Filled blue stroke | **Fertile window** — the days around projected ovulation     |
| Faint grey dot     | **Reported, no bleeding** — you checked in, nothing happened |
| Nothing            | Nothing logged, and nothing predicted                        |

The shape says as much as the colour. A period and a fertile window are
stretches of days, so they are drawn as one stroke running from the first day to
the last with a rounded cap at each end, rather than as a row of separate
circles — five red days in a row were one period, and the calendar says so. A
report with no bleeding on it is a fact about that one day and joins up with
nothing, so it stays a dot. A period that lasted a single day is a stroke capped
at both ends, which is a dot too.

The colour is behind the number rather than a mark under it, so a month reads as
bands of colour at a glance and a cell costs one row of height instead of two.

Where a stroke runs past the end of a week it is cut straight at the edge of the
row and picked up flat on the next one, so nothing in the middle of a period is
ever drawn as if it were an end.

Today's number keeps its accent colour and weight whatever it is drawn on.

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
instead of stopping at the last day you happened to log. They are drawn as one
stroke for that reason: the filled part is the days reported so far, the outline
carries on to where the period is expected to end, and the seam between them is
straight because nothing ends there. See
[the Status screen](status.md#the-period-you-are-having-right-now).

Turning off **Show the fertile window** in Settings removes the blue entirely,
legend included.

## Before there is any history

Until a period is logged there is no forecast, so only the days you have
reported are coloured — the predicted and fertile strokes fill in around them as
soon as there is a cycle to project.
