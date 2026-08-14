# Daily report

The screen the app opens on. One day, two questions, one optional number, one
**Save** — and the whole of it on a single phone screen, with nothing to scroll.

- **Blood** — yes or no. Any bleeding counts, spotting included: spotting is how
  most periods start, and the derivation has no use for a heaviness it never
  reads.
- **Mood swings** — yes or no. Whether your mood moved noticeably across the
  day.
- **Waking temperature** — optional, to two decimal places.

`No` is a real answer. It records that you checked and there was nothing, which
the cycle derivation treats differently from a day you simply didn't log — so a
day where you answered no to both is still stored, and the line under the date
tells you which of the two you are looking at (**Logged** or **Nothing logged
yet**).

## Waking temperature

Taken before getting up, this is the single most useful thing you can add to the
forecast. Body temperature steps up by roughly 0.3 °C after ovulation, holds
through the rest of the cycle, and falls again as a period arrives — so it says
where in the cycle you are, not just where the calendar thinks you are.

Two decimals is the point. The whole shift is about a third of a degree, so a
reading rounded to 0.1 °C throws away most of the signal.

The field is genuinely optional and the app never nags for it. Nobody takes
their temperature every morning, and [the model](../forecast-model.md) is built
to cope with gaps — a skipped morning is simply a day with no reading, not a
hole it has to guess at. Leave the box empty and everything else works exactly
as before.

Choose **Celsius** or **Fahrenheit** in **Settings → Forecast**. That is a
display choice only: reports are always stored the same way, so changing it
never rewrites a day and two devices set differently stay in sync. A reading far
outside the plausible range — a decimal point missed on the keypad — is refused
rather than saved, and **Save** waits until the box is emptied or corrected.

## Picking the day

The report opens on today. Press the date at the top of the card to open a month
calendar and report for any earlier day; future days can't be selected, since
there is nothing to report yet.

Nothing is saved until you press **Save report**, so opening the wrong day costs
nothing. **Clear this day** removes a day's report entirely — which is not the
same as answering no to both, and is the only way to take a report back.

## Why so few fields

Every field here feeds a number you can see somewhere else. That is the whole
test, and it is a strict one.

`bleeding` is what the periods, the cycle lengths and the prediction are derived
from. `moodSwings` and `temperature` are the two channels [the forecast
model](../forecast-model.md) reads to sharpen that prediction _within_ a cycle,
and both are plotted on the Forecast screen's advanced view so you can see what
they are doing.

The old five-field report failed that test. The bleeding level, the mood roster,
the 0–3 swing scale and the free-text note were asked every evening and read by
nothing but themselves — a nightly chore with no output. Before another field is
added, it has to name the number on Forecast or History that would move because
of it.

Existing reports were carried across when the model changed: any bleeding level
other than `none` became a yes, and any swing above `steady` became a yes, and
days logged before the temperature field existed simply carry no reading. The
mood tags and notes were not migrated — see
[troubleshooting](../troubleshooting.md).
