# period

> A local-first period tracking PWA — log bleeding and mood each day, then read your cycle history and a forecast of the next period and fertile window. No account, no server.

[![ci](https://github.com/niclaslindstedt/period/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/period/actions/workflows/ci.yml)
[![seo](https://github.com/niclaslindstedt/period/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/period/actions/workflows/seo.yml)
[![pages](https://github.com/niclaslindstedt/period/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/period/actions/workflows/pages.yml)
[![license](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue.svg)](LICENSE)

## What

**period** is a period tracker that runs entirely in your browser. Each day you
answer four short questions — how heavy the bleeding was, which moods fit, how
much your mood swung, and anything else worth a note — and the app derives
everything else from those reports: where you are in your cycle, when the next
period is likely, how your cycle length has moved over time, and which phase
your mood swings cluster in.

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
[period.niclaslindstedt.se](https://period.niclaslindstedt.se/) and install it
from your browser's "Add to Home Screen" / install prompt — it is a PWA and
works fully offline.

## Quick start

```sh
npm run dev
```

Open the printed URL. The app boots on the **Report** tab with today selected:
pick a bleeding level, tap the moods that fit, and press **Save report**. Log a
few days of a period and the **Forecast** tab starts predicting; log a second
period and **History** starts drawing.

To try the production build the way it deploys:

```sh
npm run build && npm run preview
```

## Usage

Four tabs, on a bottom bar:

| Tab          | What it does                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Report**   | One day at a time: bleeding level, mood tags, mood-swing level, note. A week strip and a date picker reach any past day.                                      |
| **Forecast** | Which day of the cycle today is, the predicted next period with a confidence label, the optional fertile window, and a calendar of logged and predicted days. |
| **History**  | Average cycle and period length, cycle-length trend, mood swings by cycle phase, most-reported moods, and the list of periods every number is derived from.   |
| **Settings** | Theme, week start, cycle assumptions, cloud sync, backup / restore / delete, and the build's version.                                                         |

## Configuration

The app needs no configuration to run. Two build-time variables switch cloud
sync on; both are public OAuth client identifiers (the flows are PKCE, so there
is no secret to protect), and leaving either unset simply hides that provider:

| Variable                  | Effect                                                      |
| ------------------------- | ----------------------------------------------------------- |
| `VITE_DROPBOX_APP_KEY`    | Enables the Dropbox backend.                                |
| `VITE_GOOGLE_CLIENT_ID`   | Enables the Google Drive backend.                           |
| `VITE_DROPBOX_APP_FOLDER` | Folder name the document is filed under (default `Period`). |
| `VITE_GDRIVE_APP_FOLDER`  | Folder name in My Drive (default `Period`).                 |
| `VITE_BASE`               | Deploy base path (default `/`).                             |

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
    bleeding: "medium",
    moods: ["tired"],
    swing: 1,
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

## Troubleshooting

| Symptom                                     | Fix                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` fails with `401 Unauthorized` | The framework comes from GitHub Packages — see Prerequisites.                                                                    |
| The forecast says "Not enough data yet"     | It needs two period starts to measure a cycle. Log a period, then the next one.                                                  |
| The predicted date looks wrong              | Check **History** → Periods: the averages come from that list, so a mistyped day is visible there and fixable on the Report tab. |
| Cloud sync shows "Reconnect needed"         | The provider's session lapsed. Tap the sync glyph → Reconnect.                                                                   |

More in [`docs/troubleshooting.md`](docs/troubleshooting.md).

## Documentation

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [Cycle derivation](docs/cycle.md) — how every predicted number is computed
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
