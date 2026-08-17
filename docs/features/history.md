# History

What the reports add up to.

The charts are drawn in the [Forecast](forecast.md) chart's grammar — a
hairline baseline, a few date ticks, one accent hue, and a readout pinned above
the plot instead of dots and floating tooltips. Point (or drag across, or focus
the chart and arrow through) any chart and the readout names the point and its
value; with nothing under the pointer it reads out the most recent one.

They carry one thing the Forecast chart does not: a labelled y axis, at most
five gridlines stepped by a round number — 0, 10, 20, 30 days; 36.0, 36.5,
37.0 °C; 0%, 20%, 40%. A forecast plots a probability whose shape is the
message, but a History series plots a quantity in a unit you know, where a
column's height means nothing until you can price it. The scale hugs the data
exactly as the marks do, so the labels never span a range your readings never
covered — on the temperature chart in particular, which is drawn against its
own range rather than from zero, because from zero the third-of-a-degree step
the chart exists to show would be a flat line.

- **The four numbers** — average cycle length, average period length, how many
  cycles have been tracked, and how many days carry a report.
- **Cycle length over time** — one value per completed cycle, drawn as columns
  by default because that is what the data is: each cycle really is one
  discrete number, and a column per cycle says so where a line implies a
  continuum between them. A toggle under the chart trades the columns for the
  curve they trace, for anyone who finds a shape easier to take in. Either way
  a drift or a one-off outlier is visible rather than buried in an average.
- **Waking temperature** — your recent readings as one line, in whichever unit
  you read. Gaps are mornings you skipped, left as gaps rather than joined
  across: a line drawn through a fortnight nobody measured is a trend nobody
  measured. Fevers are gaps too: one 38.6 morning rescales the axis until
  every cycle on it is a flat line, and it was never a cycle measurement
  anyway (see [fever](daily-report.md#fever)). Appears once there are a few
  readings; a reading alone between gaps keeps a short dash of its own rather
  than vanishing.
- **Mood swings by cycle phase** — the share of the days you reported in each of
  the four phases (menstrual, follicular, fertile, luteal) that had mood swings.
  This is the "is it always like this the week before?" question, answered as a
  count rather than a claim about cause. It is a share and not a raw count
  because the phases are different lengths: the luteal phase has roughly twice
  the days of a period, and counts alone would make it look worse for free.
  The readout also says how many reported days each share rests on.
- **Periods** — every period, newest first, with its length and the cycle it
  closed, its dates set in the same pills the Forecast screen quotes its
  upcoming periods with.

That last list matters as much as the charts: it is exactly the input every
average was computed from, so a number that looks wrong can be traced to the
day behind it and fixed on the Report screen.

Days before your first logged period belong to no observed cycle and are left
out of the phase tallies rather than guessed into one.
