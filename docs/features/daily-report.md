# Daily report

The screen the app opens on. One day, two questions, one optional number, one
**Save** — and the whole of it on a single phone screen, with nothing to scroll.

- **Blood** — yes or no. Any bleeding counts, spotting included: spotting is how
  most periods start, and the derivation has no use for a heaviness it never
  reads.
- **Mood swings** — yes or no. Whether your mood moved noticeably across the
  day.
- **Waking temperature** — optional. A slider for the reading, and a box for
  the exact one.

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

### The slider and the box

Two ways in, one number — they write the same field and each shows what the
other did.

The **slider** spans 35.50 °C to 37.50 °C, which is where a waking temperature
actually lives. Giving it the whole storable range would bury the third of a
degree that matters under a fingertip. Its left-hand stop is **None**: the field
is optional, so its resting position says "nothing recorded" rather than sitting
on a plausible-looking default, and dragging back to it clears the day's
reading.

The **box** takes only the digits that carry information. A waking temperature
is 3x.xx °C (or 9x.xx °F), so the leading digit and the decimal point are filled
in for you: tap the box, type **6 5 0**, and it reads back 36.50. Typing the
leading digit anyway also works — 3, 6, 5, 0 is understood as the same reading,
not as 33.65 — and the box shows the whole number the whole time, so what is on
screen is always what will be stored. On a phone it opens the number keypad.

### Fever

The slider's right-hand stop is **Fever**, and it is there because a febrile
morning is a real measurement that is not a _cycle_ measurement. The rise the
forecast reads is about 0.3 °C; an illness is several times that, and one
feverish morning left in the evidence would drag a whole cycle's estimate after
it.

So anything above 37.50 °C — the stop, or a number you type — is recorded on the
day it belongs to and left out of the [forecast's temperature
channel](../forecast-model.md) and out of the History screen's temperature
chart. The screen says so underneath rather than leaving you to wonder.

A reading below 35.50 °C is flagged instead of refused: the box marks itself and
asks you to check the digits, and then stores exactly what you entered. It is a
nudge, not a validator — a tracker that argued with what you measured would be
the wrong kind of confident.

Choose **Celsius** or **Fahrenheit** in **Settings → Forecast**. That is a
display choice only: reports are always stored the same way, so changing it
never rewrites a day and two devices set differently stay in sync.

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
