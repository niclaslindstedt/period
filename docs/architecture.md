# Architecture

A frontend-only PWA. No server, no API, no build-time data source. Everything
below runs in the browser tab.

```
index.html
  └── src/main.tsx            mounts <App> inside the i18n LanguageRoot
       └── src/App.tsx        theme, today, store, sync, tab switch, chrome
            ├── ReportScreen      writes day reports
            ├── ForecastScreen    reads cycle.ts
            ├── HistoryScreen     reads cycle.ts + moods.ts
            └── SettingsScreen    settings, sync controls, backup, about

src/app/
  types.ts          the model: DayEntry, AppData, the bleeding + mood rosters
  cycle.ts          periods → cycle lengths → forecast     (pure, clock-free)
  moods.ts          reports → mood tallies per cycle phase (pure, clock-free)
  merge.ts          two documents → one                    (pure)
  migrations.ts     bytes ⇄ AppData, with validation
  usePeriodStore.ts the document in state, persisted to localStorage
  useSyncEngine.ts  the cloud copy: pull on open, debounced push on edit
  useAppSettings.ts the settings blob
  backup.ts         export / restore a JSON file
```

## The shape of the data

One document, one key in localStorage:

```jsonc
{
  "version": 1,
  "entries": {
    "2026-03-01": {
      "date": "2026-03-01",
      "bleeding": "medium", // none | spotting | light | medium | heavy
      "moods": ["tired", "sad"],
      "swing": 2, // 0–3
      "note": "…", // optional
      "updatedAt": "2026-03-01T20:14:03.219Z",
    },
  },
}
```

Keyed by day, because every question the app answers is "what happened on this
day?" or "what do all the days add up to?". A report is an upsert; the calendar
screens are a map lookup; and the merge in `merge.ts` is a per-key comparison
rather than a diff.

`updatedAt` is the merge's tiebreak and nothing else. It is deliberately the
_only_ clock value stored: a report belongs to its calendar day, not to the
moment it was typed, so filing Monday's report on Thursday is not a conflict.

### Nothing derived is stored

Not the period spans, not the averages, not the predicted date. `cycle.ts`
recomputes all of it on render, in O(reports) over a dataset that is a few
hundred entries after a decade of daily use — far below the point where caching
would earn its keep.

The payoff is that there is no stale state to invalidate. Correct a report from
three weeks ago and the cycle length, the average, the confidence label, the
predicted date, and the calendar all move together, because they were never
anything but functions of the reports.

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
| `/charts`     | The dependency-free SVG `LineChart` and `BarChart`                                                                                         |
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
