# How the numbers are worked out

Every figure on the Forecast and History screens comes from
[`src/app/cycle.ts`](../src/app/cycle.ts), computed from the day reports at
render time. This page is that module in prose — worth reading before trusting
a date, and before changing the code.

The short version: **this is arithmetic, not a model.** There is no learning,
no symptom weighting, no population data. That is a deliberate choice — a
simple rule whose failure modes are legible beats a clever one whose output
nobody can check.

## From reports to periods

A day counts as bleeding if its level is anything other than `none` — spotting
included, since that is how many periods start.

Consecutive bleeding days form one period. A gap of **one** unreported or
non-bleeding day inside a run is bridged rather than treated as the end of one
period and the start of another; a gap of two or more splits them. One quiet
day mid-period is common, and splitting on it would invent a phantom two-day
cycle that then drags every average.

A period records its `start`, its `end`, its `length` in days, and how many days
inside it were actually reported as bleeding (`bleedingDays` — `length` minus
any bridged day).

## From periods to a cycle length

A cycle is measured **start to start** — the gap between the first day of one
period and the first day of the next — not from the end of one to the start of
the next. So two periods give one cycle length, three give two, and a single
period gives none at all.

The screens quote two of these:

- The **median** gap is what the forecast predicts from. One outlier — an
  illness, a season of not logging — would drag a mean around for the rest of
  the year; the median shrugs it off.
- The **mean** is shown on the History screen as "average cycle", because that
  is the number people expect to see.

## Confidence

A predicted date from two cycles and one from twelve look identical on a
calendar. The confidence label is the only thing that distinguishes them:

| Label               | When                                                      |
| ------------------- | --------------------------------------------------------- |
| `No prediction yet` | No complete cycle observed                                |
| `Rough estimate`    | One cycle, or a standard deviation of 4 days or more      |
| `Fair estimate`     | Three or more cycles, reasonably consistent               |
| `Steady pattern`    | Six or more cycles with a standard deviation under 2 days |

The spread cap matters: with genuinely irregular cycles the answer stays
`Rough estimate` however many are logged. Averaging noisy data harder does not
make it less noisy, and a tracker that grows more confident as the evidence
gets _worse_ is lying.

## The forecast

```
nextStart   = last period start + typical cycle length
              (rolled forward over cycles that went unlogged)
nextEnd     = nextStart + average period length − 1
ovulation   = nextStart − luteal phase length      (default 14 days)
fertile     = ovulation − 5  …  ovulation + 1
cycleDay    = days since the current cycle's start + 1
```

Two details are worth spelling out.

**Ovulation is counted backwards.** It is estimated from the _next_ period, not
forward from the last one, because the luteal phase (ovulation → period) varies
far less between people than the follicular phase (period → ovulation). Counting
forward would spread the follicular phase's variation straight into the fertile
window.

**A late period stays late.** When the predicted start has passed with no
bleeding logged, the app reports it as overdue — a negative "days until" —
rather than rolling to the next month. That ambiguity (late, or arrived and not
recorded?) resolves in favour of the more useful reading. Only once a _whole_
cycle has passed does the projection roll forward, because by then at least one
cycle certainly went unlogged and holding a month-old date would just be wrong.

The fertile window's width — 5 days before ovulation, 1 after — is sperm and
egg viability. It is not user-tunable, because it is not a preference.

## Cycle phases

Each day in a cycle falls in one of four phases, used to colour the calendar
and to bucket moods on the History screen:

| Phase      | Days                                                |
| ---------- | --------------------------------------------------- |
| Menstrual  | From the cycle start, for the average period length |
| Follicular | After that, up to the fertile window                |
| Fertile    | The window around the projected ovulation           |
| Luteal     | From the end of the window to the next period       |

Mood bucketing (in [`moods.ts`](../src/app/moods.ts)) only counts days inside
an **observed** cycle — a day before the first logged period belongs to no
cycle, and is skipped rather than guessed into a phase. The sample size is
reported alongside every average for the same reason.

## What it does not do

- It does not detect ovulation. Nothing here is measured — no temperature, no
  LH, no cervical fluid. The "ovulation" date is `nextStart − 14 days` and
  nothing more.
- It does not adapt to a changing cycle beyond what the median does on its own.
- It does not know about pregnancy, perimenopause, hormonal contraception,
  PCOS, or any condition that changes what a cycle is.
- **It is not contraception**, and it is not a medical device.

If the predicted date looks wrong, the History screen's period list is the
place to check: it is exactly the input the averages were computed from, so a
mistyped day is visible there and fixable on the Report tab.
