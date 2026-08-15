# Agent guidance for period

This file is the canonical source of truth for AI coding agents working in this
repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`, and
`.github/copilot-instructions.md` are symlinks to this file.

## OSS Spec conformance

This repository adheres to [`OSS_SPEC.md`](OSS_SPEC.md), a prescriptive
specification for open source project layout, documentation, automation, and
governance. A copy of the spec lives at the repository root so contributors and
AI agents can consult it without leaving the repo; its version is recorded in
the YAML front matter at the top of the file.

Run `oss-spec validate .` (or the standalone
[`validate.sh`](https://github.com/niclaslindstedt/oss-spec/blob/main/scripts/validate.sh))
to verify conformance. When in doubt about a layout, naming, or workflow
decision, consult the relevant section of `OSS_SPEC.md` — it is the source of
truth for the conventions this repo follows.

## What this app is, and the one rule that follows from it

A period tracker holds health data about a named person's body. The whole
design premise is that the data never leaves the device unless its owner
explicitly connects their own cloud account.

**So: never add a network call that isn't the user's own cloud backend.** No
analytics, no error reporting service, no font CDN, no "anonymous" telemetry,
no third-party script — not behind a flag, not in dev only. If a change would
send a byte of report data, or a byte _about_ report data, anywhere the user
did not choose, it is the wrong change however useful the feature is. This is
the constraint the README and the privacy copy promise; it outranks
convenience.

The same applies to what the app _says_. The forecast is arithmetic over logged
days. Copy must not imply medical authority, diagnose anything, or present an
estimate as a certainty — the confidence label and the disclaimer on the
Forecast screen exist for that reason and should not be quietly dropped.

## Build and test commands

```sh
make install       # npm install (needs GitHub Packages auth — see below)
make build         # production build (vite build)
make test          # full test suite (vitest)
make lint          # eslint + tsc --noEmit
make fmt           # prettier --write
make fmt-check     # verify formatting (CI)
make check-seo     # build + assert the structural SEO/PWA signals
make icons         # regenerate the PWA icons, favicon, and og image
```

The `@niclaslindstedt/oss-framework` dependency comes from the **GitHub
Packages** npm registry (see `.npmrc`). GitHub Packages requires auth even for
public packages, so local installs need a `read:packages` token in `~/.npmrc`
(`//npm.pkg.github.com/:_authToken=<token>`); CI authenticates with the
workflow's `GITHUB_TOKEN`.

### Dependency install in web sessions

Claude Code on the web runs `.claude/hooks/session-start.sh` on `SessionStart`
(wired up in `.claude/settings.json`), so **dependencies install automatically
in the background** — an agent shouldn't run `make install` by hand first. The
hook resolves a GitHub Packages token from the environment
(`NODE_AUTH_TOKEN` / `GITHUB_PAT` / `GH_TOKEN` / `GITHUB_TOKEN`, first wins),
writes it to `~/.npmrc`, and runs `npm install` — the committed project
`.npmrc` stays token-free. It runs in **async** mode, so `node_modules` may
still be populating for a moment after the session opens; if a `make` target
fails on a missing dependency, wait and retry. The hook is a no-op outside the
web environment (`CLAUDE_CODE_REMOTE`), so it never touches a local developer's
npm config.

## Commit and PR conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.

### Watching a PR after you open it

Don't babysit a PR with polling. **Do not** schedule `send_later`, cron jobs,
`ScheduleWakeup`, or timed self-check-ins to re-check CI or merge state — those
just burn turns. Open the PR, confirm the checks you can see are green, then
stop. CI failures and review comments are delivered to the session as webhook
events, so you'll be woken when there's actually something to act on.

## Architecture summary

This is a **frontend-only, local-first PWA** — there is no server. It is built
on [`oss-framework`](https://github.com/niclaslindstedt/oss-framework), the
same shared surface behind the sibling `notes` and `contacts` apps.

The framework owns the UI kit and the generic mechanics: modals, form
primitives, the theme engine, the calendar grid, the SVG charts, the storage
adapters (localStorage / Dropbox / Google Drive), the i18n runtime, logging,
the toast store, and the PWA update state machine.

### The renderer is Preact

`preact` is the only renderer dependency — **never add `react` or `react-dom`
back.** `@preact/preset-vite` compiles JSX against `preact/jsx-runtime` and
aliases `react` / `react-dom` (and their `/jsx-runtime` + `/client` subpaths)
onto `preact/compat`; `tsconfig.json` `paths` and `package.json` `overrides`
mirror that for `tsc` and npm, so the framework — which is built against React
— resolves to Preact too. App code keeps importing hooks and types from
`"react"`, which is the supported compat path; only `src/main.tsx` uses
Preact's own `render`. Two differences bite in new code: use `e.currentTarget`
rather than `e.target` in event handlers, and spell string-valued attributes
like SVG's `focusable` as `"false"` rather than a JSX boolean.

### The app owns the domain ("store stays in the app")

- `src/app/types.ts` — the `DayEntry` / `AppData` model. A report is two
  booleans (`bleeding`, `moodSwings`), an optional `temperature`, and the day
  they belong to; adding a fourth question is a decision, not a detail.
- `src/app/cycle.ts` — the derivation: periods from bleeding days, cycle
  lengths, averages, one predicted date, the phase of a day. **Pure and
  clock-free.**
- `src/app/forecastModel.ts` — the probabilistic forecast: a distribution over
  the days ahead rather than one of them, plus the mood and temperature
  evidence channels and the rolling-origin backtest. Also pure and clock-free.
- `src/app/stats.ts` — the numerics underneath it (Student-t, the regularized
  incomplete beta, weighted moments, discrete distributions). Textbook
  definitions with textbook-value tests.
- `src/app/temperature.ts` — °C ⇄ °F, parsing, two-decimal formatting.
- `src/app/swings.ts` — mood-swing shares bucketed by cycle phase. Also pure.
- `src/app/merge.ts` — the per-day, last-edit-wins document merge that both
  cloud sync and backup restore run through.
- `src/app/migrations.ts` — parse / normalise / serialize; the only module that
  trusts stored bytes.
- `src/app/usePeriodStore.ts` — the document store (localStorage-persisted).
- `src/app/useSyncEngine.ts` — the sync engine over the framework's storage
  adapters (debounced push, conflict / auth / throttle handling).
- `src/app/dayStatus.ts` — the posterior turned into one call per day
  (_period_ / _predicted period_ / _fertile_ / _not fertile_) and the
  probability behind it. Fits nothing of its own; it only takes mass out of
  `forecastModel.ts`. Also pure and clock-free.
- `src/app/StatusScreen.tsx`, `ReportScreen.tsx`, `CalendarScreen.tsx`,
  `ForecastScreen.tsx`, `HistoryScreen.tsx`, `SettingsScreen.tsx` — the six
  screens, one per bottom-nav tab.
- `src/app/DayCircle.tsx` — a day's status as a colour, plus the legend built
  from the same table. The only place that mapping exists, so the Status week
  row and the Calendar month grid cannot paint one day two ways.
- `src/app/ForecastChart.tsx`, `ProfileCharts.tsx` — the forecast's own charts.
  Built from the framework's chart _primitives_ (`bandScale`, `linePath`,
  `barPath`, `linearScale`), not from its finished chart components.
- `src/app/i18n/en.ts` — every user-facing string.
- `src/output.ts` — the §19.4 central output module (semantic log helpers over
  the in-app log store).
- `pwa-plugin.ts` — emits the service worker + version/precache manifests the
  framework's `usePwaUpdate` consumes.

Dependency direction: screens → stores → framework. Nothing imports from the
framework's internals — only its published subpaths.

### Derive, don't store

Nothing about a cycle is persisted — not the period spans, not the averages,
not the predicted date. The document holds day reports and only day reports;
everything else is recomputed on render from `cycle.ts`. This is why correcting
a report from three weeks ago immediately fixes every downstream number, and
why there is no cache to invalidate. **Adding a derived field to `AppData` is
almost always the wrong fix** — the right one is a function in `cycle.ts`.

### The report is three fields, and the bar for a fourth is high

The Report screen asks whether there was blood, whether there were mood swings,
and — optionally — this morning's waking temperature. That is the whole
document. Every one of them feeds a number that is visible somewhere:
`bleeding` derives the periods and the cycle lengths; `moodSwings` and
`temperature` are the two evidence channels `forecastModel.ts` reads, both
plotted on the Forecast screen's advanced view.

v2 removed a five-level bleeding scale, a nine-mood roster, a 0–3 swing scale
and a free-text note, all of which were asked every evening and read by nothing
but the screen that stored them. So before adding a field, name the number on
Forecast or History that would move because of it. If there isn't one, the
field is a nightly chore with no output, and the answer is no — however
reasonable it sounds in isolation. A tracker earns its place by being answerable
in two taps in the dark at 23:50.

Temperature cleared that bar because the post-ovulatory rise is the strongest
single signal for onset there is, and it is **optional** precisely so the two
taps still work on a morning nobody reached for a thermometer. A new field that
has to be filled in every day to be useful has not cleared the bar.

The screen fits one phone screen, portrait, without scrolling — verified on a
375×667 viewport. A change that makes it scroll is a regression, not a layout
detail.

### One posterior, three screens

The rule above generalises. The Status screen's word, the Calendar screen's
colours and the Forecast screen's date are three renderings of the _same_
fitted distribution, routed through `dayStatus.ts`:

- a day is inside the next period ⟺ the period starts on it or on one of the
  `periodLength − 1` days before it;
- a day is fertile ⟺ the next period starts `luteal − after` … `luteal +
before` days after it (ovulation is defined backwards from the next start,
  which is exactly why one distribution answers both).

Summing the posterior mass over those start days _is_ the percentage the Status
screen quotes. Do not add a second estimator for any of it — a screen that says
"Fertile" over a distribution that puts the fertile window elsewhere is the one
failure this arrangement exists to make impossible.

### Simple and advanced read the same posterior

The Forecast screen has two detail levels. They are **not** two models: the
simple view quotes the median and the 80% interval of the identical
distribution the advanced view draws. Anything that makes them disagree — a
different fit, a rounded number, a separate code path — breaks the one promise
the screen makes about itself. If advanced needs a figure, expose it on
`ProbabilisticForecast` and let both views read it.

The same goes for the univariate / multivariate switch: with too little history
the multivariate model must reduce _exactly_ to the univariate one, which is
what makes it safe as the default.

### Keep the derivation clock-free

`cycle.ts`, `forecastModel.ts` and `swings.ts` never call `new Date()`. `today` is a parameter,
supplied by `App.tsx` (which refreshes it on focus, so midnight passing while
the app is open doesn't leave a stale day). Keep it that way: it is what lets
the tests pin real dates without fake timers.

## Where new code goes

| Change                             | Goes in                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A new thing to log about a day     | Probably nowhere — see below. If it survives that: `src/app/types.ts` (model) + `ReportScreen.tsx` (control) + a `migrations.ts` step |
| A new derived number or prediction | `src/app/cycle.ts`, with tests in `tests/cycle_test.ts`                                                                               |
| A new statistic over mood swings   | `src/app/swings.ts`                                                                                                                   |
| A new screen                       | `src/app/<Name>Screen.tsx` + a tab in `src/app/BottomNav.tsx`                                                                         |
| A new setting                      | `src/app/useAppSettings.ts` (shape + clamping) + a `Section` in `SettingsScreen.tsx`                                                  |
| A new storage backend              | The framework, not here — this app only wires adapters up in `useSyncEngine.ts`                                                       |
| Any user-facing string             | `src/app/i18n/en.ts`, never inline in a component                                                                                     |
| A shared UI primitive              | The framework, if it is domain-free; `src/app/` only if it is period-specific                                                         |

## Test conventions

Tests live in `tests/` with a `_test` suffix (OSS_SPEC §20.2) and run under
Vitest in the `node` environment — they cover the pure domain modules
(`cycle`, `swings`, `merge`, `migrations`), which is where the app's real logic
is. No DOM, no testing-library, no mocked clock.

Run one file with `npx vitest run tests/cycle_test.ts`.

A change to the derivation without a test that pins the new behaviour to real
dates is not finished. UI changes should keep the boot smoke path working:
`npm run build && npm run preview`, file a report, and check that Forecast
moves with it.

## Changelog and feature docs

`CHANGELOG.md`'s released sections are **generated** — never hand-edit them.
Every user-visible change adds a fragment under `.changes/unreleased/`:

```
.changes/unreleased/$(date +%s)-short-slug.md
---
type: Added        # Added | Changed | Fixed | Removed | Security | Deprecated
title: Short bold title
breaking: true     # optional — forces a major release
---

One sentence a user will read in the changelog.
```

A fragment for a substantial feature links to its doc under `docs/features/`
with `[Learn more](feature:<slug>)`.

## Documentation sync points

| If you change…                   | Update…                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The derivation in `cycle.ts`     | `docs/cycle.md`, and the README's Examples block if the output shape moved                                     |
| `forecastModel.ts` or `stats.ts` | `docs/forecast-model.md`, `docs/features/forecast.md`, and the README's What block                             |
| The `DayEntry` shape             | `docs/architecture.md`'s data shape, `docs/features/daily-report.md`, and a `migrations.ts` step               |
| The sync engine or the merge     | `docs/sync.md`                                                                                                 |
| A `VITE_*` variable              | `docs/configuration.md`, `src/vite-env.d.ts`, the README's Configuration table, and the workflows that pass it |
| A screen's behaviour             | The matching `docs/features/*.md` and the README's Usage table                                                 |
| `dayStatus.ts`                   | `docs/features/status.md` and `docs/features/calendar.md` — both screens quote its rules                       |
| Module layout                    | The "Where new code goes" table above and `docs/architecture.md`                                               |
| A make target or script          | `CONTRIBUTING.md`, the README's Quick start, and this file's command list                                      |

## Parity and cross-cutting rules

- **Every string goes through `t()`.** English is the only catalog today; the
  runtime is in place so adding a language is one `loaders` entry.
- **Two themes only** — one light, one dark, plus "follow the device". The
  framework ships a dozen palettes; this app deliberately exposes none of them.
  Don't reintroduce the picker.
- **The bottom nav is the navigation.** Six tabs, no sidebar, no drawer. Six is
  the ceiling, not a direction of travel: at 375px each tab gets about 62px,
  which fits "Calendar" and nothing longer. A seventh destination should
  replace one, not be squeezed in.
- **No dependency creep.** The framework, Preact, a font, and workbox-window.
  A new runtime dependency needs a reason that the framework can't serve.

## Website staleness

The app _is_ the website (OSS_SPEC §11.2 / §11.4) — `pages.yml` builds it and
deploys `dist/`. There is no separate marketing site to drift out of date, but
the SEO surface in `index.html` and `public/` does: when the app's description
changes, update `index.html`'s title/description/OG/JSON-LD, `public/llms.txt`,
and the manifest copy in `pwa-plugin.ts` together. `make check-seo` asserts the
structure, not the wording — it will not catch a stale sentence.

## Maintenance skills

Skills live under `.agent/skills/` (OSS_SPEC §21). Each has a `SKILL.md` with
its discovery process, its source→output mapping, and a `.last-updated` marker.

| Skill             | Runs when                                                     |
| ----------------- | ------------------------------------------------------------- |
| `maintenance`     | The registry and run order for every other skill — start here |
| `write-changeset` | Any user-visible change, before opening the PR                |
| `update-docs`     | `src/app/` changed in a way a `docs/` topic describes         |
| `update-readme`   | Commands, configuration, or the feature set changed           |
