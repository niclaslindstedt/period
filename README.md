# cycle

> A local-first cycle tracking PWA — two taps a day, then read your cycle history and a forecast of the next period and fertile window. No account, no server.

[![ci](https://github.com/niclaslindstedt/period/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/period/actions/workflows/ci.yml)
[![seo](https://github.com/niclaslindstedt/period/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/period/actions/workflows/seo.yml)
[![pages](https://github.com/niclaslindstedt/period/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/period/actions/workflows/pages.yml)
[![license](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue.svg)](LICENSE)

## What

**cycle** is a period tracker that runs entirely in your browser. Each day you
tap four buttons — blood, mood swings, lust, sex — and optionally add your
waking temperature and what an ovulation test said, on a screen that fits a
phone without scrolling. The app derives everything else from those reports:
where you are in your cycle, when the next period is likely, how your cycle
length has moved over time, and which phase your mood swings cluster in.

The forecast is not a single date. It is a probability for each day ahead, drawn
with its 50/80/95% credible bands, from a Bayesian model fitted to your own
history — log-normal cycle lengths under a conjugate prior, fitted as a mixture
so one irregular cycle cannot stretch every prediction, recent cycles weighted
more heavily, days you already reported without bleeding ruled out, and
your own reports read as evidence about _this_ cycle. Mood swings and
temperature speak about the days before a period; lust, sex and a positive
ovulation test speak about ovulation, a fortnight earlier, so the two halves of
the cycle both have something to say — and once your waking temperature shows a
sustained rise, the day it stepped up anchors the next period a luteal phase
later, which is the steadiest span in the whole cycle. A
**simple** view names the date and the range; an **advanced** view shows the
fitted parameters, the patterns it learned, and how well it has done on your past
cycles. Both read the same posterior, so they are equally accurate — advanced
just shows the workings.

The calendar reads that same posterior for the months after next, too: each
further cycle is the forecast with one more cycle length added to it, so it
widens as it goes and the app stops drawing periods at the point it can no
longer say which week. How far ahead you can see is a fact about your own
history rather than a setting.

Six fields is the whole report on purpose, and each one feeds a number you can
see: a heaviness scale, a mood roster and a free-text note were fields asked
every evening that nothing ever read.

It is built on [`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework),
the shared React/Preact surface behind the sibling
[notes](https://github.com/niclaslindstedt/notes) and
[contacts](https://github.com/niclaslindstedt/contacts) apps — same storage
adapters, same theme engine, same PWA update lifecycle.

## Why

Period trackers are an unusually bad category to hand your data to: cycle
history is health data, it is commercially valuable, and most apps in the
category are an account wrapped around a server you cannot inspect.

This one has no account and no server. Reports live in your browser's
localStorage. If you want them on more than one device, you connect **your own**
Dropbox or Google Drive and the app keeps a copy there — in a folder you can
open, in a JSON file you can read. Nothing else leaves the device: no
analytics, no telemetry, no third-party requests at runtime.

The forecasting is deliberately simple arithmetic — the median gap between your
period starts — and the app says how much history that estimate rests on rather
than presenting a guess from two cycles as a fact.

## Prerequisites

- Node.js ≥ 22 (CI pins 24 — see `.nvmrc`), npm ≥ 10
- A GitHub personal access token with `read:packages` in `~/.npmrc` — the
  `@niclaslindstedt/oss-framework` dependency resolves from GitHub Packages

## Install

```sh
npm config set //npm.pkg.github.com/:_authToken <your-token>
git clone https://github.com/niclaslindstedt/period.git
cd period
npm install
```

Or just open the hosted app at
[cycle.niclaslindstedt.se](https://cycle.niclaslindstedt.se/) and install it
from your browser's "Add to Home Screen" / install prompt — it is a PWA and
works fully offline.

## Quick start

```sh
npm run dev
```

Open the printed URL. The app boots on the daily report with today selected:
press whichever of the four buttons applies, then press **Save report**. Log a few days of a period and the **Forecast** tab starts predicting;
log a second period and **History** starts drawing. From then on the report is the **+** in the top right.

To try the production build the way it deploys:

```sh
npm run build && npm run preview
```

## Usage

Four tabs, on a bottom bar — swipe left or right to move between them:

| Tab          | What it does                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | What today is, in a word — _Fertile_, _Not fertile_, _Period_ — with how sure that is as a percentage, the cycle day, the next period, and a week of days either side of today in the same colours the calendar uses.                                                                                                                                       |
| **Calendar** | A month at a time. Periods and fertile windows are drawn as one stroke across the days they cover — filled where it has happened, hollow where it is expected, so a predicted period and the fertile window in front of it read as equally provisional. It projects past the next period too, as far ahead as your history can place one. Pages either way. |
| **Forecast** | Cycle day, the predicted next period with the range around it and a confidence label, an interactive chart of the probability per day, and the optional fertile window. Switch between **simple** and **advanced** detail.                                                                                                                                  |
| **History**  | Average cycle and period length, cycle-length trend, recent temperatures, mood swings by cycle phase, and the list of periods every number is derived from.                                                                                                                                                                                                 |

…and two buttons on the top bar, for the two screens you visit and leave:

| Button | What it does                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **+**  | The daily report: a button each for blood, mood swings, lust and sex — lit when it happened — plus an optional fertility-test result and an optional waking temperature, on a slider across the range one actually lands in or three digits in the box beside it. Press the date to reach any past day, or to pick a **range** and file a whole period of bleeding in one Save. |
| **⚙**  | Settings: theme, week start, cycle assumptions, forecast detail and temperature unit, cloud sync, backup / restore / delete, and the build's version.                                                                                                                                                                                                                           |

## Configuration

The app needs no configuration to run. Two build-time variables switch cloud
sync on; both are public OAuth client identifiers (the flows are PKCE, so there
is no secret to protect), and leaving either unset simply hides that provider:

| Variable                  | Effect                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `VITE_DROPBOX_APP_KEY`    | Enables the Dropbox backend.                               |
| `VITE_GOOGLE_CLIENT_ID`   | Enables the Google Drive backend.                          |
| `VITE_DROPBOX_APP_FOLDER` | Folder name the document is filed under (default `Cycle`). |
| `VITE_GDRIVE_APP_FOLDER`  | Folder name in My Drive (default `Cycle`).                 |
| `VITE_BASE`               | Deploy base path (default `/`).                            |

See [`docs/configuration.md`](docs/configuration.md) for the details.

## Examples

Record a day and read the forecast that comes out of it — the derivation is
pure, so it runs anywhere, no DOM required:

```ts
import { forecast } from "./src/app/cycle.ts";
import { emptyDoc } from "./src/app/types.ts";

const doc = emptyDoc();
for (const date of ["2026-03-01", "2026-03-02", "2026-03-03"]) {
  doc.entries[date] = {
    date,
    bleeding: true,
    moodSwings: false,
    lust: false,
    sex: false,
    temperature: null,
    fertilityTest: null,
    updatedAt: new Date().toISOString(),
  };
}

forecast(doc, "2026-03-10");
// → { cycleLength: 28, usingDefault: true, cycleDay: 10,
//     nextStart: "2026-03-29", confidence: "none", … }
```

`usingDefault: true` and `confidence: "none"` are the point: with one period
logged there is no observed cycle to predict from, and the app says so instead
of quietly presenting the 28-day default as your number.

The probabilistic forecast is the same shape of call, and returns the whole
distribution rather than one date:

```ts
import { probabilisticForecast } from "./src/app/forecastModel.ts";

const f = probabilisticForecast(doc, "2026-03-10", "multivariate")!;

f.expectedDay; // → "2026-03-29"   the median: even odds either side
f.intervals; // → [{ mass: 0.95, start: "2026-03-19", end: "2026-04-11", … }, …]
f.probabilityWithinWeek; // → 0.0…  the chance it starts in the next seven days
f.params.df; // → 5   Student-t degrees of freedom: fat tails, one period logged
f.confidence; // → "low"
```

Every number is a function of the reports and `today`, which is always passed
in — nothing here reads the clock. See
[`docs/forecast-model.md`](docs/forecast-model.md).

## Troubleshooting

| Symptom                                     | Fix                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm install` fails with `401 Unauthorized` | The framework comes from GitHub Packages — see Prerequisites.                                                                        |
| The forecast says "Not enough data yet"     | It needs two period starts to measure a cycle. Log a period, then the next one.                                                      |
| The predicted date looks wrong              | Check **History** → Periods: the averages come from that list, so a mistyped day is visible there and fixable from the **+** button. |
| Cloud sync shows "Reconnect needed"         | The provider's session lapsed. Tap the sync glyph → Reconnect.                                                                       |

More in [`docs/troubleshooting.md`](docs/troubleshooting.md).

## Documentation

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [Cycle derivation](docs/cycle.md) — periods, cycle lengths, phases
- [The forecast model](docs/forecast-model.md) — the Bayesian model behind the prediction
- [Sync](docs/sync.md)
- [Troubleshooting](docs/troubleshooting.md)
- [`AGENTS.md`](AGENTS.md) — conventions for humans and coding agents

## Contributing

Bugs and feature requests go to
[Issues](https://github.com/niclaslindstedt/period/issues); open-ended
questions to [Discussions](https://github.com/niclaslindstedt/period/discussions).
See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow, and
[`SECURITY.md`](SECURITY.md) for private vulnerability reporting.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) © Niclas Lindstedt.

---

**This app is not a medical device.** The forecast is arithmetic over the days
you logged. It is not contraception, not a pregnancy test, and not a substitute
for a clinician.
