# Architecture

A frontend-only PWA. No server, no API, no build-time data source. Everything
below runs in the browser tab.

```
index.html
  └── src/main.tsx            mounts <App> inside the i18n LanguageRoot
       └── src/App.tsx        theme, today, store, sync, tab switch, chrome
            ├── TopBar            sync glyph, + (report), cog — left half empty
            ├── StatusScreen      reads dayStatus.ts — the opening screen
            ├── ReportScreen      writes day reports
            ├── CalendarScreen    reads dayStatus.ts over a month grid
            ├── ForecastScreen    reads cycle.ts + forecastModel.ts
            ├── HistoryScreen     reads cycle.ts + swings.ts
            ├── SettingsScreen    settings, sync controls, backup, about
            └── BottomNav         the four destinations

src/app/
  types.ts          the model: DayEntry (four booleans, two measurements)
  cycle.ts          periods → cycle lengths → one date      (pure, clock-free)
  forecastModel.ts  reports → a distribution over days      (pure, clock-free)
  dayStatus.ts      that distribution → one call per day    (pure, clock-free)
  stats.ts          Student-t, incomplete beta, discrete distributions (pure)
  swings.ts         reports → swing shares per cycle phase  (pure, clock-free)
  temperature.ts    °C ⇄ °F, parsing, two-decimal formatting (pure)
  bulk.ts           a day span → the reports it expands to  (pure, clock-free)
  merge.ts          two documents → one                     (pure)
  migrations.ts     bytes ⇄ AppData, with validation
  useDocStore.ts    the document in state, persisted to localStorage
  useSyncEngine.ts  the cloud copy: pull on open, debounced push on edit
  useAppSettings.ts the settings blob
  useSwipeNav.ts    touch swipe → one tab along the bottom bar
  backup.ts         export / restore a JSON file

  dev/demoData.ts    a year of invented reports, relative to today (pure)
  dev/demoBackend.ts that year as an in-memory DocBackend
  dev/useDemoData.ts the developer "Demo data" switch (in-memory only)

  ForecastChart.tsx the probability-per-day chart with its credible bands
  HistoryChart.tsx  the History screen's series, in the Forecast chart's grammar
  ProfileCharts.tsx the learned mood and temperature patterns
  Pill.tsx          the date pills Forecast and History quote dates with
  DayMark.tsx       a day's status → its mark, for the two screens that paint days
```

`cycle.ts` and `forecastModel.ts` are two answers to the same question at
different resolutions. `cycle.ts` gives the single date the fertile-window
summary needs; `forecastModel.ts` gives the distribution the headline and the
chart draw, reading mood swings and temperature as well as the gaps. They share
the anchor and the roll-forward rule so they never disagree by a cycle. See
[the forecast model](forecast-model.md).

`forecastModel.ts` also projects the cycles _after_ the next one, by convolving
its own posterior with its own cycle-length predictive — no second fit, and each
one wider than the last until the projection stops being a date (see
[the forecast model](forecast-model.md#the-cycles-after-the-next-one)). That is
what fills in the calendar's later months.

`dayStatus.ts` sits on top of `forecastModel.ts` and turns that distribution
into one call per day — _period_, _predicted period_, _fertile_, _not fertile_ —
with the probability behind it. It fits no model of its own; it only takes mass
out of the one already fitted, which is what stops the Status word, the Calendar
colour, and the Forecast date from ever contradicting each other. It also says
whether a day falls in the _span_ an upcoming period is expected to cover, which
is a weaker claim than the call and the one the paint follows a few cycles out —
the wording keeps the stricter rule. `DayMark.tsx`
is the single status → mark mapping the Status and Calendar screens share — the
colour and the shape both, so a period reads as one stroke across the days it
covers on either screen and a lone report reads as a dot on both.

## The shape of the data

One document, one key in localStorage:

```jsonc
{
  "version": 4,
  "entries": {
    "2026-03-01": {
      "date": "2026-03-01",
      "bleeding": true, // any bleeding at all, spotting included
      "moodSwings": false,
      "lust": false, // noticeably raised sex drive
      "sex": false,
      "temperature": 36.52, // waking, °C, or null when none was taken
      "fertilityTest": null, // "positive" | "negative" | null when none taken
      "updatedAt": "2026-03-01T20:14:03.219Z",
    },
  },
}
```

A report is four yes/no answers, two optional measurements, and the day they
belong to. `bleeding` is what the periods and the cycle lengths are derived
from; the other five are the evidence channels the forecast model reads within a
cycle. They come in two families: `moodSwings` and `temperature` are
premenstrual, and `lust`, `sex` and `fertilityTest` are ovulatory — they speak
about ovulation, a luteal phase before the onset, which is the part of the cycle
the first two are silent on.

A field nobody derives anything from would be a field asked for every evening
for nothing — v2 removed the four that were (a five-level bleeding scale, a
nine-mood roster, a 0–3 swing scale, and a note).

`migrations.ts` carries older documents across: v1 → v2 turns any bleeding level
but `none` into `bleeding: true` and any swing above steady into
`moodSwings: true`; v2 → v3 gives every existing day `temperature: null`; v3 → v4
gives every existing day `lust: false`, `sex: false` and `fertilityTest: null`.
Each of those is the same claim the absent field made.

Temperature is stored in **Celsius** whatever unit the reader has chosen, at
three decimal places. The third is not precision anybody typed — it is what lets
a two-decimal Fahrenheit reading round-trip, since one Fahrenheit hundredth is
0.0056 °C. See [`temperature.ts`](../src/app/temperature.ts).

An **absent** entry and an entry with both answers `false` are different
claims — "I never logged this day" against "I checked, nothing happened" — so
saving a no/no report stores it rather than clearing the day. Only **Clear this
day** removes one.

Keyed by day, because every question the app answers is "what happened on this
day?" or "what do all the days add up to?". A report is an upsert; the calendar
screens are a map lookup; and the merge in `merge.ts` is a per-key comparison
rather than a diff.

`updatedAt` is the merge's tiebreak and nothing else. It is deliberately the
_only_ clock value stored: a report belongs to its calendar day, not to the
moment it was typed, so filing Monday's report on Thursday is not a conflict.

### Nothing derived is stored

Not the period spans, not the averages, not the predicted date, and not the
fitted model. `cycle.ts` and `forecastModel.ts` recompute all of it on render,
in O(reports) over a dataset that is a few hundred entries after a decade of
daily use — far below the point where caching would earn its keep. The whole
posterior, both learned profiles and the backtest together are a few
milliseconds on a phone, which is what the closed-form conjugate update buys:
no sampler, no optimiser, nothing to warm up.

The payoff is that there is no stale state to invalidate. Correct a report from
three weeks ago and the cycle length, the average, the confidence label, the
predicted date, today's status and the calendar's colours all move together,
because they were never anything but functions of the reports.

## Demo data

`useDocStore` reads and writes through a `DocBackend` rather than touching
`localStorage` itself. That seam is what the developer **Demo data** switch
uses: while it is on, `App` hands the store an in-memory backend seeded with a
year of invented reports instead of the real `localDocBackend`, so a demo needs
no special case anywhere in the store, the screens, or the derivation.

Three properties make it safe to ship in the production bundle:

- **Nothing is persisted.** The demo document lives in a closure. Edits made
  during a demo round-trip through it — saving a report and watching the
  forecast move works exactly as it does for real — but `localStorage` is never
  written, and the real document is reloaded untouched when the switch goes off.
- **Nothing is synced.** `useSyncEngine` takes a `paused` flag that is set for
  as long as the takeover is in effect. No baseline read, no push: a year of
  invented reports can never reach a connected Dropbox or Drive account, and
  the cloud copy that is already there is left exactly as it was.
- **Nothing survives a reload.** The switch is module state, never persisted,
  so reloading the page is always the guaranteed way back to the real reports.

`dev/demoData.ts` itself is pure and clock-free like the derivation it feeds:
`today` is a parameter, and every date in the document is an _offset_ from it
("26 days ago"), never a fixed date that would age into a stale demo. The
"randomness" is a hash of each day's offset, so two builds of the same day are
byte-identical. The clock is read once, in `dev/demoBackend.ts`, when a
document is first seeded.

The builder and the backend sit behind `import()` and are fetched only when the
switch is first turned on, so the year of sample reports costs a production
user nothing.

## Rendering runtime

The runtime is **Preact**, not React. `@preact/preset-vite` compiles JSX
against `preact/jsx-runtime` and aliases `react` / `react-dom` (and the
`/jsx-runtime` and `/client` subpaths) onto `preact/compat`. `tsconfig.json`
`paths` and `package.json` `overrides` mirror that for `tsc` and for npm, so
the framework — which is published built against React — resolves to Preact
too. Nothing from React itself reaches the bundle.

App code still imports hooks and types from `"react"`; that is the supported
compat path. Only `src/main.tsx` uses Preact's own `render`.

Two differences bite in new code:

- Use `e.currentTarget`, not `e.target`, in event handlers.
- String-valued SVG attributes like `focusable` must be written `"false"`, not
  as a JSX boolean.

## What the framework owns

`@niclaslindstedt/oss-framework` supplies everything that isn't about
menstrual cycles:

| Subpath       | Used for                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/components` | `Modal`, `Section`, `ToggleRow`, `SegmentedControl`, `Button`, `LabeledInput`, `ConfirmDialog`, the toast store and viewport, the icon set |
| `/theme`      | The token vocabulary, the palettes, and `useApplyTheme`                                                                                    |
| `/calendar`   | `DayKey` arithmetic (`addDays`, `daysBetween`, `startOfWeek`) and `MonthGrid`                                                              |
| `/charts`     | The dependency-free SVG `LineChart` and `BarChart`, plus the scale/path primitives `ForecastChart` is built from                           |
| `/storage`    | The `StorageAdapter` contract and the Dropbox / Drive backends, plus the offline cache wrapper                                             |
| `/sync`       | `SyncStatus` (the header glyph) and `SyncDetailsModal` (the command centre) — presentation only                                            |
| `/logging`    | The log buffer and `LogViewer`                                                                                                             |
| `/i18n`       | The typed `t()` runtime                                                                                                                    |
| `/pwa`        | `usePwaUpdate` and the update prompt                                                                                                       |
| `/files`      | The download plumbing behind backup export                                                                                                 |

Dependency direction is one-way: screens → stores → framework. Nothing reaches
into the framework's internals — only its published subpaths.

The seam the framework draws is "the store stays in the app". It owns
mechanism; this repo owns what a period is, what a report means, and what the
numbers add up to.

## What loads when

There is no server render and no prerender, so everything on the entry path is
downloaded before anything appears. The whole app is currently one ~150 kB
chunk (~50 kB gzipped) plus the Inter subset — small enough that splitting it
would cost more in round trips than it saves.

That is a budget, not an accident. Before adding a static import to `App.tsx`,
ask whether the first paint needs it; anything heavy belongs behind `import()`.
`make check-seo` asserts the critical-path JS budget, so a regression fails CI
rather than showing up as a slow first open on a phone.

## The service worker

`pwa-plugin.ts` emits the worker at build time rather than pulling in a Workbox
toolchain: the framework's `usePwaUpdate` needs exactly three files
(`sw.js`, `version.json`, `precache-manifest.json`) and one cache-naming
convention, which is cheaper to write than to configure.

The worker is "prompt to update": it installs the new build's assets, parks in
`waiting`, and only takes over when the user taps the update toast. A silent
swap could discard a half-typed report.

`src/app/pwa.ts` holds the one value both sides must agree on — the precache
cache id — and is imported by both the browser (`App.tsx`) and the build
(`pwa-plugin.ts`), so it must stay free of browser- and Node-only imports.
