# History

What the reports add up to.

- **The four numbers** — average cycle length, average period length, how many
  cycles have been tracked, and how many days carry a report.
- **Cycle length over time** — one point per completed cycle, so a drift or a
  one-off outlier is visible rather than buried in an average.
- **Waking temperature** — your recent readings, in whichever unit you read.
  Gaps are mornings you skipped, and so are fevers: one 38.6 morning rescales
  the axis until every cycle on it is a flat line, and it was never a cycle
  measurement anyway (see [fever](daily-report.md#fever)).
  Appears once there are a few. Gaps in the line are mornings you skipped, left
  as gaps rather than joined across: a line drawn through a fortnight nobody
  measured is a trend nobody measured.
- **Mood swings by cycle phase** — the share of the days you reported in each of
  the four phases (menstrual, follicular, fertile, luteal) that had mood swings.
  This is the "is it always like this the week before?" question, answered as a
  count rather than a claim about cause. It is a share and not a raw count
  because the phases are different lengths: the luteal phase has roughly twice
  the days of a period, and counts alone would make it look worse for free.
- **Periods** — every period, newest first, with its length and the cycle it
  closed.

That last list matters as much as the charts: it is exactly the input every
average was computed from, so a number that looks wrong can be traced to the
day behind it and fixed on the Report screen.

Days before your first logged period belong to no observed cycle and are left
out of the phase tallies rather than guessed into one.
