# Daily report

The screen a fresh install opens on — every other screen is derived from what
this one records, so until there is a first report it is the only one with
anything to do. One day, four taps, two optional measurements, one **Save** —
and the whole of it on a single phone screen, with nothing to scroll. Once a
day has been reported the app opens on [Status](status.md) instead.

Reach it from the **+** in the top right, from any screen. It is not one of the
tabs along the bottom, because it is not a place you go and stay: you file the
day and you leave. Pressing **+** again does exactly that — back to the screen
you came from, nothing saved.

- **Blood** — a button. Press it if there was any bleeding at all, spotting
  included: spotting is how most periods start, and the derivation has no use
  for a heaviness it never reads.
- **Mood swings** — a button. Press it if your mood moved noticeably across the
  day.
- **Lust** — a button. Press it if your sex drive was noticeably raised.
- **Sex** — a button. Press it if there was sex.
- **Fertility test** — optional. **None**, **Negative** or **Positive**: what
  an ovulation strip said this morning, if you ran one.
- **Waking temperature** — optional. A slider for the reading, and a box for
  the exact one.

Each button lights up in the app's red when it happened and sits dimmed when it
did not, so one glance at the row is the whole answer.

**Save** carries a mark saying where the report is going: a disk while the
document lives on this device only, and a cloud once you have connected a
[cloud account](cloud-sync.md). Press it and the button itself confirms — the
mark becomes a checkmark and the label reads **Saved** for a moment, then goes
back to naming the action. There is nothing to wait for: the report is written
to this device as you press. Touch any answer again and the checkmark drops,
because what is on screen is no longer what was saved. The only time saving
raises a message of its own is when the write is refused — no room, or storage
switched off in the browser — since nothing else on the screen would show it.

**Clear this day** sits under **Save** with a bin, so the destructive one of the
two is the one you can tell apart before the tap rather than after it. Clearing
does say so in a passing message, because it takes reports away and the count it
took is worth naming.

Correcting an older day is usually shorter from the other end: on the
[Calendar](calendar.md#correcting-a-day) you can see which day is wrong, and
tapping it opens the same report — with the same delete under it — without
picking a date first.

Leaving them all dim is a real answer. **Save** is what files the report, so a
day saved with no button lit records that you checked and there was nothing —
which the cycle derivation treats differently from a day you simply didn't log.
The line under the date tells you which of the two you are looking at (**Logged**
or **Nothing logged yet**), and a day you never save stays unlogged.

## Reporting a range of days

Press the date and the picker opens on **One day**. Switch it to **Range** and
the grid takes two taps: the first sets one end of the span, the second the
other — in either order, so picking the last day first works too. Save then
writes the same four yes/no answers to every day in between.

This is what filing a period after the fact looks like. Six consecutive
bleeding days used to be the same four taps six times over; now it is press the
date, tap the first and last day, tap **Blood**, and **Save 6 days**.

The card tells you what you are about to write. The date reads **3 Aug – 8 Aug**
with the day count under it, and the line below counts how many of those days
already carry a report — **2 of 6 days logged**. A span overwrites the days it
covers, so that count is there before you save rather than after.

Switching back to **One day** collapses the selection onto the first day of the
span, and **Clear these days** removes every report in it.

The [Calendar](calendar.md#correcting-several-days) reaches the same range save
by a different door: press and hold a day in the month, tap the day that closes
the span, and the same four answers — and the same **Delete** — apply to it.

A span is capped at 31 days. It is a guard against a mis-tap in a paged calendar
— a first day picked in March and a second in a month you scrolled to by
accident — not a limit on anything real: a period is under a fortnight. Once the
first day is down, the picker greys out everything past the cap, so the limit is
visible rather than something a tap discovers.

### The measurements are per day

The temperature and the fertility test are both switched off while a span is
selected, and read **One day only** where they otherwise say _Optional_. Each is
one morning's observation, so there is no honest value to write across six days.

**Readings and test results already on those days survive.** Filing "I bled
these six days" over a week you took your temperature every morning leaves all
six of those readings exactly where they were — a bulk report writes the four
yes/no answers and nothing else. To add or change either measurement, put the
picker back on **One day**.

## Lust and sex

Two buttons, answered the same way as the first two: press if it happened.

They are here because sex drive rises toward ovulation, and ovulation is what
the forecast would most like to know the date of. The model does not assume
that, though — it learns the shape from your own reports, one rate per number of
days before a period, and reads it back to you on the Forecast screen's advanced
view. **Your lust pattern** should show a hump in the middle of the chart rather
than at its right-hand end, which is what a mid-cycle signal looks like when the
axis counts down to a period.

**Sex** is the more confounded of the two — a weekend is not a hormone — and it
is deliberately treated as a question rather than an assumption. If your reports
do not follow your cycle, the chart comes out flat, and a flat channel is one
the model leaves out. Nothing is lost by answering it honestly.

## Fertility test

**None**, **Negative** or **Positive** — what an ovulation (LH) test strip said,
if you ran one.

Three options rather than a switch, because **None** and **Negative** are
different claims. A negative on the morning a surge was due is evidence; a
morning nobody tested is not an observation at all, and the model skips it. That
is the same distinction the app draws between a day with no report and a day
saved with every answer no.

A positive strip is the sharpest single thing you can tell this forecast. The LH
surge precedes ovulation by about a day, and a period follows ovulation by the
luteal phase — the steadiest stretch of the cycle. So one positive test dates the
next period more tightly than a fortnight of anything else here, and it does so
on the first cycle you use a strip: the model starts from the luteal phase set
in **Settings → Cycle**, and moves toward whatever your own positives have
actually been followed by as they accumulate. The Forecast screen's **Your
fertility tests** panel names the number it is using and says where it came
from.

Most days there is no test, and **None** is where a blank report opens. Nothing
nags for one.

## Waking temperature

Taken before getting up, this is the single most useful thing you can add to the
forecast. Body temperature steps up by roughly 0.3 °C after ovulation, holds
through the rest of the cycle, and falls again as a period arrives — so it says
where in the cycle you are, not just where the calendar thinks you are. The
forecast reads it twice: the raised plateau counts as evidence about the days
before a period, and the day of the **step itself**, once three raised mornings
confirm it, anchors the next period a luteal phase later — the sharpest single
thing a morning routine can tell the model.

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
chart. The Report screen does not explain that at the time: which readings the
model uses is a fact about the derivation, and the report is a place to answer
three questions, not to read about how they are used.

The box reads that stop back as the word **Fever**, not as a number. It has to
store _something_, and what it stores is 38.00 °C — but nobody measured that, and
showing it would look like a reading you took. A temperature you did type is
always shown as the number you typed, right up to the 38.00 °C threshold where
the word takes over.

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
from. The other five are the evidence channels [the forecast
model](../forecast-model.md) reads to sharpen that prediction _within_ a cycle,
and every one of them is plotted on the Forecast screen's advanced view so you
can see what it is doing.

They split into two families, and that split is why there are five rather than
two. `moodSwings` and `temperature` are **premenstrual** — they speak about the
days just before a period. `lust`, `sex` and `fertilityTest` are **ovulatory**:
they peak around ovulation, which is a luteal phase _earlier_, so they say
something about a part of the cycle the first two are silent on. A positive
fertility test is the sharpest of the lot — it dates ovulation to within a day,
and the next period follows it by the steadiest span in the cycle.

The old five-field report failed that test. The bleeding level, the mood roster,
the 0–3 swing scale and the free-text note were asked every evening and read by
nothing but themselves — a nightly chore with no output. Before another field is
added, it has to name the number on Forecast or History that would move because
of it.

Existing reports were carried across when the model changed: any bleeding level
other than `none` became a yes, and any swing above `steady` became a yes, and
days logged before the temperature field existed simply carry no reading, and
days logged before the ovulatory fields existed carry a no for lust and sex and
no test. The mood tags and notes were not migrated — see
[troubleshooting](../troubleshooting.md).
