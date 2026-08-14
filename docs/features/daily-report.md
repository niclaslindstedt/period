# Daily report

The screen the app opens on. One day, two questions, one **Save** — and the
whole of it on a single phone screen, with nothing to scroll.

- **Blood** — yes or no. Any bleeding counts, spotting included: spotting is how
  most periods start, and the derivation has no use for a heaviness it never
  reads.
- **Mood swings** — yes or no. Whether your mood moved noticeably across the
  day.

`No` is a real answer. It records that you checked and there was nothing, which
the cycle derivation treats differently from a day you simply didn't log — so a
day where you answered no to both is still stored, and the line under the date
tells you which of the two you are looking at (**Logged** or **Nothing logged
yet**).

## Picking the day

The report opens on today. Press the date at the top of the card to open a month
calendar and report for any earlier day; future days can't be selected, since
there is nothing to report yet.

Nothing is saved until you press **Save report**, so opening the wrong day costs
nothing. **Clear this day** removes a day's report entirely — which is not the
same as answering no to both, and is the only way to take a report back.

## Why only two questions

The forecast is arithmetic over bleeding days (see [the cycle
derivation](../cycle.md)), and nothing else on the old five-field report fed it.
The bleeding level, the mood roster, the 0–3 swing scale and the free-text note
were asked every evening and read by nothing but themselves. `bleeding` is the
one answer the prediction needs; `moodSwings` is the one pattern worth plotting
against it on the [History](history.md) screen.

Existing reports were carried across when the model changed: any bleeding level
other than `none` became a yes, and any swing above `steady` became a yes. The
mood tags and notes were not migrated — see
[troubleshooting](../troubleshooting.md).
